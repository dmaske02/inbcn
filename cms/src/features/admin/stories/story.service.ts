import "server-only";

import type { AdminIdentity, AdminRole } from "@/features/admin/auth/authorization.model";
import {
  cmsStorySlugExists,
  deleteCmsStory,
  getCmsStories,
  getCmsStoryFeaturedMedia,
  getCmsStoryById,
  getCmsStoryReferences,
  insertCmsStory,
  transitionCmsStory,
  updateCmsStoryIfCurrent,
  type CmsStoryDto,
  type CmsStoryListQuery,
} from "@/features/news/server";
import type { DatabaseEnum } from "@/lib/supabase/types";
import {
  canCreateStory,
  getAllowedStoryCommands,
  parseStoryUpdateForm,
  resolveEditableStoryType,
  storyFormSchema,
  type StoryCommand,
  type StoryFormValues,
  type StoryStatus,
} from "./story.model";
import { calculateReadTime } from "@/features/news/server/services/story-reader.model";
import { parseTags } from "./story.workflow";
import { getMediaReferenceView, isSelectableMedia } from "@/features/admin/media/media.service";
import { resolveFeaturedMediaSelection } from "@/features/admin/media/media.model";
import { validateFeaturedMediaChange } from "./story-featured-media-policy";

const PAGE_SIZE = 20;
const STORY_STATUSES: readonly StoryStatus[] = ["draft", "pending_review", "approved", "scheduled", "published", "rejected", "archived"];

export class StoryManagementError extends Error {
  constructor(readonly code: "NOT_FOUND" | "FORBIDDEN" | "DUPLICATE_SLUG" | "INVALID_TRANSITION" | "INVALID_SCHEDULE" | "CONFLICT" | "VALIDATION", message: string) {
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

export type StoryReviewQueueView = Omit<StoryListView, "items" | "canCreate" | "canBulkPublish" | "canBulkArchive" | "canBulkDelete"> & Readonly<{
  items: readonly (StoryListView["items"][number] & {
    featuredMedia: Awaited<ReturnType<typeof getCmsStoryFeaturedMedia>> extends ReadonlyMap<string, infer T> ? T | null : never;
  })[];
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
  const referencesPromise = getCmsStoryReferences();
  if (!id) {
    if (!canCreateStory(admin.role)) throw new StoryManagementError("FORBIDDEN", "You cannot create stories.");
    return { story: null, references: await referencesPromise, featuredMedia: null, commands: ["save"] as const, readTime: 0 };
  }
  const [references, story] = await Promise.all([referencesPromise, getCmsStoryById(id)]);
  if (!story) throw new StoryManagementError("NOT_FOUND", "Story not found.");
  const featuredMedia = story.featuredMediaId
    ? await getMediaReferenceView(story.featuredMediaId)
    : null;
  return {
    story,
    references,
    featuredMedia,
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

function parseUpdateValues(input: StoryFormValues, persistedSummary: string): StoryFormValues {
  const result = parseStoryUpdateForm(input, persistedSummary);
  if (!result.success) throw new StoryManagementError("VALIDATION", "Check the story fields and try again.");
  return result.data;
}

async function assertFeaturedMediaSelection(
  admin: AdminIdentity,
  requestedFeaturedMediaId: string | null,
  currentFeaturedMediaId: string | null,
): Promise<void> {
  const result = await validateFeaturedMediaChange(
    admin,
    requestedFeaturedMediaId,
    currentFeaturedMediaId,
    isSelectableMedia,
  );
  if (!result.ok && result.code === "FORBIDDEN") {
    throw new StoryManagementError("FORBIDDEN", "You cannot change featured media.");
  }
  if (!result.ok) {
    throw new StoryManagementError("VALIDATION", "Select an available featured image.");
  }
}

export async function createStory(admin: AdminIdentity, input: StoryFormValues): Promise<CmsStoryDto> {
  if (!canCreateStory(admin.role)) throw new StoryManagementError("FORBIDDEN", "You cannot create stories.");
  const values = parseValues(input);
  if (await cmsStorySlugExists(values.languageId, values.slug)) {
    throw new StoryManagementError("DUPLICATE_SLUG", "That slug is already used for this language.");
  }
  await assertFeaturedMediaSelection(admin, values.featuredMediaId || null, null);
  return insertCmsStory({
    ...normalizeForm(values, admin.role, null, null, null),
    created_by: admin.id,
    status: "draft",
  });
}

export async function saveStory(admin: AdminIdentity, id: string, expectedUpdatedAt: string, input: StoryFormValues): Promise<CmsStoryDto> {
  const story = await getCmsStoryById(id);
  if (!story) throw new StoryManagementError("NOT_FOUND", "Story not found.");
  if (!getAllowedStoryCommands(admin.role, story.status, story.createdBy === admin.id, story.type === "external_article").includes("save")) {
    throw new StoryManagementError("FORBIDDEN", "This story cannot be edited in its current state.");
  }
  const values = parseUpdateValues(input, story.summary);
  if (await cmsStorySlugExists(values.languageId, values.slug, id)) {
    throw new StoryManagementError("DUPLICATE_SLUG", "That slug is already used for this language.");
  }
  await assertFeaturedMediaSelection(admin, values.featuredMediaId || null, story.featuredMediaId);
  const updated = await updateCmsStoryIfCurrent(id, expectedUpdatedAt, {
    ...normalizeForm(
      values,
      admin.role,
      story.featuredMediaId,
      story.type,
      story.sourceId,
    ),
    updated_at: new Date().toISOString(),
  });
  if (!updated) {
    throw new StoryManagementError("CONFLICT", "Story was changed by another editor. Reload before saving.");
  }
  return updated;
}

export async function getStoryReviewQueueView(admin: AdminIdentity, params: StoryListParams): Promise<StoryReviewQueueView> {
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const references = await getCmsStoryReferences();
  const result = await getCmsStories({
    page,
    pageSize: PAGE_SIZE,
    search: params.search?.trim() || undefined,
    status: "pending_review",
    languageId: params.language || undefined,
    categoryId: params.category || undefined,
    sort: "submitted_asc",
  });
  const media = await getCmsStoryFeaturedMedia(result.items.flatMap((story) => story.featuredMediaId ? [story.featuredMediaId] : []));
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
      featuredMedia: story.featuredMediaId ? media.get(story.featuredMediaId) ?? null : null,
    })),
    references,
    page,
    pageSize: PAGE_SIZE,
    total: result.total,
    totalPages: Math.max(1, Math.ceil(result.total / PAGE_SIZE)),
    filters: { search: params.search ?? "", status: "pending_review", language: params.language ?? "", category: params.category ?? "", sort: "submitted_asc" },
  };
}

export async function runStoryCommand(
  admin: AdminIdentity,
  id: string,
  command: Exclude<StoryCommand, "save">,
  expectedUpdatedAt?: string,
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
  if (!expectedUpdatedAt) throw new StoryManagementError("CONFLICT", "Story was changed by another editor. Reload before saving.");
  const result = await transitionCmsStory({ id, command, expectedUpdatedAt, scheduledAt, rejectionReason });
  if (result.code === "SUCCESS") return;
  if (result.code === "NOT_FOUND") throw new StoryManagementError("NOT_FOUND", "Story not found.");
  if (result.code === "FORBIDDEN") throw new StoryManagementError("FORBIDDEN", "You cannot perform that action.");
  if (result.code === "CONFLICT") throw new StoryManagementError("CONFLICT", "Story was changed by another editor. Reload before saving.");
  if (result.code === "INVALID_SCHEDULE") throw new StoryManagementError("INVALID_SCHEDULE", "The publish date must be in the future.");
  if (result.code === "VALIDATION_ERROR") throw new StoryManagementError("VALIDATION", "Check the workflow fields and try again.");
  throw new StoryManagementError("INVALID_TRANSITION", "That action is not allowed for this story.");
}

export async function runBulkStoryCommand(
  admin: AdminIdentity,
  ids: readonly string[],
  command: "publish" | "archive" | "delete",
): Promise<void> {
  for (const id of [...new Set(ids)]) {
    const story = await getCmsStoryById(id);
    if (!story) throw new StoryManagementError("NOT_FOUND", "Story not found.");
    await runStoryCommand(admin, id, command, story.updatedAt);
  }
}
