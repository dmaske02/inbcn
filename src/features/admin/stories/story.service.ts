import "server-only";

import type { AdminIdentity, AdminRole } from "@/features/admin/auth/authorization.model";
import {
  cmsStorySlugExists,
  deleteCmsStory,
  getCmsStories,
  getCmsStoryById,
  getCmsStoryReferences,
  insertCmsStory,
  updateCmsStory,
  type CmsStoryDto,
  type CmsStoryListQuery,
} from "@/features/news/server";
import type { DatabaseEnum } from "@/lib/supabase/types";
import {
  canCreateStory,
  getAllowedStoryCommands,
  resolveEditableStoryType,
  storyFormSchema,
  type StoryCommand,
  type StoryFormValues,
  type StoryStatus,
} from "./story.model";
import { calculateReadTime } from "@/features/news/server/services/story-reader.model";
import { buildTransitionPatch, parseTags } from "./story.workflow";
import {
  getMediaPickerOptions,
  isSelectableMedia,
} from "@/features/admin/media/media.service";
import { resolveFeaturedMediaSelection } from "@/features/admin/media/media.model";

const PAGE_SIZE = 20;
const STORY_STATUSES: readonly StoryStatus[] = ["draft", "pending_review", "approved", "scheduled", "published", "rejected", "archived"];

export class StoryManagementError extends Error {
  constructor(readonly code: "NOT_FOUND" | "FORBIDDEN" | "DUPLICATE_SLUG" | "INVALID_TRANSITION" | "VALIDATION", message: string) {
    super(message);
    this.name = "StoryManagementError";
  }
}

export type StoryListParams = Readonly<{
  page?: string;
  search?: string;
  status?: string;
  language?: string;
  category?: string;
  sort?: string;
}>;

export type StoryListView = Readonly<{
  items: readonly Readonly<CmsStoryDto & {
    languageName: string;
    categoryName: string;
    authorName: string;
    commands: readonly StoryCommand[];
  }>[];
  references: Awaited<ReturnType<typeof getCmsStoryReferences>>;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  filters: Required<Pick<StoryListParams, "search" | "status" | "language" | "category" | "sort">>;
  canCreate: boolean;
  canBulkPublish: boolean;
  canBulkArchive: boolean;
  canBulkDelete: boolean;
}>;

function asStatus(value?: string): DatabaseEnum<"story_status"> | undefined {
  return STORY_STATUSES.includes(value as StoryStatus) ? (value as StoryStatus) : undefined;
}

function asSort(value?: string): CmsStoryListQuery["sort"] {
  return value === "updated_asc" || value === "published_desc" || value === "title_asc" ? value : "updated_desc";
}

export async function getStoryListView(admin: AdminIdentity, params: StoryListParams): Promise<StoryListView> {
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const references = await getCmsStoryReferences();
  const result = await getCmsStories({
    page,
    pageSize: PAGE_SIZE,
    search: params.search?.trim() || undefined,
    status: asStatus(params.status),
    languageId: params.language || undefined,
    categoryId: params.category || undefined,
    sort: asSort(params.sort),
  });
  const languageNames = new Map(references.languages.map((item) => [item.id, item.name]));
  const categoryNames = new Map(references.categories.map((item) => [item.id, item.name]));
  const authorNames = new Map(references.authors.map((item) => [item.id, item.displayName]));

  return {
    items: result.items.map((story) => ({
      ...story,
      languageName: languageNames.get(story.languageId) ?? "Unknown",
      categoryName: categoryNames.get(story.categoryId) ?? "Unknown",
      authorName: story.createdBy ? (authorNames.get(story.createdBy) ?? "Former user") : "System",
      commands: getAllowedStoryCommands(admin.role, story.status, story.createdBy === admin.id, story.type === "external_article"),
    })),
    references,
    page,
    pageSize: PAGE_SIZE,
    total: result.total,
    totalPages: Math.max(1, Math.ceil(result.total / PAGE_SIZE)),
    filters: {
      search: params.search ?? "",
      status: params.status ?? "",
      language: params.language ?? "",
      category: params.category ?? "",
      sort: params.sort ?? "updated_desc",
    },
    canCreate: canCreateStory(admin.role),
    canBulkPublish: admin.role === "editor" || admin.role === "admin",
    canBulkArchive: admin.role === "editor" || admin.role === "admin",
    canBulkDelete: admin.role === "admin",
  };
}

export async function getStoryEditorView(admin: AdminIdentity, id?: string) {
  const [references, media] = await Promise.all([
    getCmsStoryReferences(),
    getMediaPickerOptions(admin),
  ]);
  if (!id) {
    if (!canCreateStory(admin.role)) throw new StoryManagementError("FORBIDDEN", "You cannot create stories.");
    return { story: null, references, media, commands: ["save"] as const, readTime: 0 };
  }
  const story = await getCmsStoryById(id);
  if (!story) throw new StoryManagementError("NOT_FOUND", "Story not found.");
  return {
    story,
    references,
    media,
    commands: getAllowedStoryCommands(admin.role, story.status, story.createdBy === admin.id, story.type === "external_article"),
    readTime: calculateReadTime(story.content),
  };
}

function normalizeForm(
  values: StoryFormValues,
  role: AdminRole,
  currentFeaturedMediaId: string | null,
  currentStoryType: CmsStoryDto["type"] | null,
  currentSourceId: string | null,
) {
  const storyType = resolveEditableStoryType(currentStoryType);
  return {
    language_id: values.languageId,
    category_id: values.categoryId,
    source_id:
      storyType === "external_article"
        ? currentSourceId
        : role === "writer"
          ? null
          : values.sourceId || null,
    story_type: storyType,
    slug: values.slug,
    title: values.title,
    summary: values.summary,
    content: values.content,
    featured_media_id: resolveFeaturedMediaSelection(
      role,
      currentFeaturedMediaId,
      values.featuredMediaId,
    ),
    seo_title: values.seoTitle || null,
    seo_description: values.seoDescription || null,
    seo_keywords: parseTags(values.tags),
    canonical_url: values.canonicalUrl || null,
    is_featured: role === "writer" ? false : values.isFeatured,
    is_breaking: role === "writer" ? false : values.isBreaking,
  };
}

function parseValues(input: StoryFormValues): StoryFormValues {
  const result = storyFormSchema.safeParse(input);
  if (!result.success) throw new StoryManagementError("VALIDATION", "Check the story fields and try again.");
  return result.data;
}

export async function createStory(admin: AdminIdentity, input: StoryFormValues): Promise<CmsStoryDto> {
  if (!canCreateStory(admin.role)) throw new StoryManagementError("FORBIDDEN", "You cannot create stories.");
  const values = parseValues(input);
  if (await cmsStorySlugExists(values.languageId, values.slug)) {
    throw new StoryManagementError("DUPLICATE_SLUG", "That slug is already used for this language.");
  }
  if (
    admin.role !== "writer" &&
    values.featuredMediaId &&
    !(await isSelectableMedia(admin, values.featuredMediaId))
  ) {
    throw new StoryManagementError("VALIDATION", "Select an available featured image.");
  }
  return insertCmsStory({
    ...normalizeForm(values, admin.role, null, null, null),
    created_by: admin.id,
    status: "draft",
  });
}

export async function saveStory(admin: AdminIdentity, id: string, input: StoryFormValues): Promise<CmsStoryDto> {
  const story = await getCmsStoryById(id);
  if (!story) throw new StoryManagementError("NOT_FOUND", "Story not found.");
  if (!getAllowedStoryCommands(admin.role, story.status, story.createdBy === admin.id, story.type === "external_article").includes("save")) {
    throw new StoryManagementError("FORBIDDEN", "This story cannot be edited in its current state.");
  }
  const values = parseValues(input);
  if (await cmsStorySlugExists(values.languageId, values.slug, id)) {
    throw new StoryManagementError("DUPLICATE_SLUG", "That slug is already used for this language.");
  }
  if (
    admin.role !== "writer" &&
    values.featuredMediaId &&
    !(await isSelectableMedia(admin, values.featuredMediaId))
  ) {
    throw new StoryManagementError("VALIDATION", "Select an available featured image.");
  }
  return updateCmsStory(id, {
    ...normalizeForm(
      values,
      admin.role,
      story.featuredMediaId,
      story.type,
      story.sourceId,
    ),
    updated_at: new Date().toISOString(),
  });
}

export async function runStoryCommand(
  admin: AdminIdentity,
  id: string,
  command: Exclude<StoryCommand, "save">,
  scheduledAt?: string,
  rejectionReason?: string,
): Promise<void> {
  const story = await getCmsStoryById(id);
  if (!story) throw new StoryManagementError("NOT_FOUND", "Story not found.");
  const allowed = getAllowedStoryCommands(admin.role, story.status, story.createdBy === admin.id, story.type === "external_article");
  if (!allowed.includes(command)) throw new StoryManagementError("INVALID_TRANSITION", "That action is not allowed for this story.");
  if (command === "delete") {
    await deleteCmsStory(id);
    return;
  }
  try {
    await updateCmsStory(id, buildTransitionPatch(command, story.status, admin.id, new Date().toISOString(), scheduledAt, rejectionReason));
  } catch (error) {
    if (error instanceof StoryManagementError) throw error;
    if (error instanceof Error && error.message.toLowerCase().includes("publish date")) {
      throw new StoryManagementError("VALIDATION", error.message);
    }
    throw error;
  }
}

export async function runBulkStoryCommand(
  admin: AdminIdentity,
  ids: readonly string[],
  command: "publish" | "archive" | "delete",
): Promise<void> {
  for (const id of [...new Set(ids)]) await runStoryCommand(admin, id, command);
}
