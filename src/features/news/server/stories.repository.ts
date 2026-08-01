import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database, DatabaseEnum, TableRow } from "@/lib/supabase/types";
import { getCategoryBySlug } from "./categories.repository";
import type {
  CategoryStoryDto,
  CmsStoryDto,
  CmsStoryListResultDto,
  CmsStoryReferenceDto,
  PublishedCategoryStoryPageDto,
  StoryDto,
  StorySummaryDto,
} from "./dto";
import {
  assertRepositoryQuerySucceeded,
  RepositoryError,
} from "./errors";
import { getLanguage } from "./languages.repository";

const DEFAULT_STORY_LIMIT = 20;
const STORY_SUMMARY_COLUMNS =
  "id, translation_group_id, language_id, category_id, source_id, external_author, story_type, slug, title, summary, featured_media_id, is_featured, is_breaking, is_sponsored, published_at" as const;
const STORY_DETAIL_COLUMNS =
  `${STORY_SUMMARY_COLUMNS}, content, updated_at, external_url, seo_title, seo_description, seo_keywords, canonical_url` as const;
const CATEGORY_STORY_COLUMNS = `${STORY_SUMMARY_COLUMNS}, content` as const;
const CMS_STORY_COLUMNS =
  "id, language_id, category_id, source_id, created_by, approved_by, story_type, status, slug, title, summary, content, featured_media_id, seo_title, seo_description, seo_keywords, canonical_url, is_featured, is_breaking, submitted_at, approved_at, scheduled_at, published_at, created_at, updated_at" as const;

export type CmsStoryListQuery = Readonly<{
  page: number;
  pageSize: number;
  search?: string;
  status?: DatabaseEnum<"story_status">;
  languageId?: string;
  categoryId?: string;
  sort?: "updated_desc" | "updated_asc" | "published_desc" | "title_asc";
}>;

export type CmsStoryInsert = Database["public"]["Tables"]["stories"]["Insert"];
export type CmsStoryUpdate = Database["public"]["Tables"]["stories"]["Update"];

type StorySummaryRow = Pick<
  TableRow<"stories">,
  | "id"
  | "translation_group_id"
  | "language_id"
  | "category_id"
  | "source_id"
  | "external_author"
  | "story_type"
  | "slug"
  | "title"
  | "summary"
  | "featured_media_id"
  | "is_featured"
  | "is_breaking"
  | "is_sponsored"
  | "published_at"
>;

type StoryDetailRow = StorySummaryRow &
  Pick<
    TableRow<"stories">,
    | "content"
    | "updated_at"
    | "external_url"
    | "seo_title"
    | "seo_description"
    | "seo_keywords"
    | "canonical_url"
  >;

type CategoryStoryRow = StorySummaryRow & Pick<TableRow<"stories">, "content">;

type CmsStoryRow = Pick<TableRow<"stories">, keyof CmsStoryDto extends never ? never :
  | "id" | "language_id" | "category_id" | "source_id" | "created_by" | "approved_by"
  | "story_type" | "status" | "slug" | "title" | "summary" | "content"
  | "featured_media_id" | "seo_title" | "seo_description" | "seo_keywords"
  | "canonical_url" | "is_featured" | "is_breaking" | "submitted_at" | "approved_at"
  | "scheduled_at" | "published_at" | "created_at" | "updated_at">;

function toCmsStoryDto(row: CmsStoryRow): CmsStoryDto {
  return {
    id: row.id, languageId: row.language_id, categoryId: row.category_id,
    sourceId: row.source_id, createdBy: row.created_by, approvedBy: row.approved_by,
    type: row.story_type, status: row.status, slug: row.slug, title: row.title,
    summary: row.summary, content: row.content, featuredMediaId: row.featured_media_id,
    seoTitle: row.seo_title, seoDescription: row.seo_description,
    seoKeywords: row.seo_keywords, canonicalUrl: row.canonical_url,
    isFeatured: row.is_featured, isBreaking: row.is_breaking,
    submittedAt: row.submitted_at, approvedAt: row.approved_at,
    scheduledAt: row.scheduled_at, publishedAt: row.published_at,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function toStorySummaryDto(
  row: StorySummaryRow,
  media: FeaturedMediaRow | null = null,
): StorySummaryDto {
  if (!row.published_at) {
    throw new RepositoryError("map published story");
  }

  return {
    id: row.id,
    translationGroupId: row.translation_group_id,
    languageId: row.language_id,
    categoryId: row.category_id,
      sourceId: row.source_id,
      externalAuthor: row.external_author,
    type: row.story_type,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    featuredMediaId: row.featured_media_id,
    featuredMedia: media ? toFeaturedMediaDto(media) : null,
    isFeatured: row.is_featured,
    isBreaking: row.is_breaking,
    isSponsored: row.is_sponsored,
    publishedAt: row.published_at,
  };
}

function toCategoryStoryDto(
  row: CategoryStoryRow,
  media: FeaturedMediaRow | null = null,
): CategoryStoryDto {
  return { ...toStorySummaryDto(row, media), content: row.content };
}

type FeaturedMediaRow = Pick<
  TableRow<"media">,
  | "id"
  | "cloudinary_public_id"
  | "secure_url"
  | "alt_text"
  | "caption"
  | "width"
  | "height"
>;

function toFeaturedMediaDto(media: FeaturedMediaRow) {
  return {
    publicId: media.cloudinary_public_id,
    secureUrl: media.secure_url,
    altText: media.alt_text,
    caption: media.caption,
    width: media.width,
    height: media.height,
  };
}

function toStoryDto(row: StoryDetailRow, media: FeaturedMediaRow | null): StoryDto {
  return {
    ...toStorySummaryDto(row, media),
    content: row.content,
    updatedAt: row.updated_at,
    externalUrl: row.external_url,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    seoKeywords: row.seo_keywords,
    canonicalUrl: row.canonical_url,
  };
}

async function getFeaturedMediaMap(
  rows: readonly StorySummaryRow[],
): Promise<ReadonlyMap<string, FeaturedMediaRow>> {
  if (rows.length === 0) return new Map();
  const mediaIds = [
    ...new Set(
      rows
        .map((row) => row.featured_media_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (mediaIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("media")
    .select("id, cloudinary_public_id, secure_url, alt_text, caption, width, height")
    .in("id", mediaIds);
  assertRepositoryQuerySucceeded(error, "load featured media");
  return new Map(data.map((item) => [item.id, item]));
}

async function attachFeaturedMedia(
  rows: readonly StorySummaryRow[],
): Promise<StorySummaryDto[]> {
  const mediaById = await getFeaturedMediaMap(rows);
  return rows.map((row) =>
    toStorySummaryDto(
      row,
      row.featured_media_id ? mediaById.get(row.featured_media_id) ?? null : null,
    ));
}

async function attachCategoryFeaturedMedia(
  rows: readonly CategoryStoryRow[],
): Promise<CategoryStoryDto[]> {
  const mediaById = await getFeaturedMediaMap(rows);
  return rows.map((row) =>
    toCategoryStoryDto(
      row,
      row.featured_media_id ? mediaById.get(row.featured_media_id) ?? null : null,
    ));
}

async function getPublishedStories(
  filters: Readonly<{
    languageId?: string;
    categoryId?: string;
    featured?: boolean;
    breaking?: boolean;
  }> = {},
): Promise<StorySummaryDto[]> {
  const supabase = await createClient();
  let query = supabase
    .from("stories")
    .select(STORY_SUMMARY_COLUMNS)
    .eq("status", "published")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(DEFAULT_STORY_LIMIT);

  if (filters.languageId) {
    query = query.eq("language_id", filters.languageId);
  }
  if (filters.categoryId) {
    query = query.eq("category_id", filters.categoryId);
  }
  if (filters.featured !== undefined) {
    query = query.eq("is_featured", filters.featured);
  }
  if (filters.breaking !== undefined) {
    query = query.eq("is_breaking", filters.breaking);
  }

  const { data, error } = await query;
  assertRepositoryQuerySucceeded(error, "load published stories");
  return attachFeaturedMedia(data);
}

export async function getLatestStories(): Promise<StorySummaryDto[]> {
  return getPublishedStories();
}

export async function getFeaturedStories(): Promise<StorySummaryDto[]> {
  return getPublishedStories({ featured: true });
}

export async function getBreakingStories(): Promise<StorySummaryDto[]> {
  return getPublishedStories({ breaking: true });
}

export async function getStoryBySlug(
  locale: string,
  slug: string,
): Promise<StoryDto | null> {
  const language = await getLanguage(locale);
  if (!language) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stories")
    .select(STORY_DETAIL_COLUMNS)
    .eq("language_id", language.id)
    .eq("slug", slug)
    .eq("status", "published")
    .not("published_at", "is", null)
    .maybeSingle();

  assertRepositoryQuerySucceeded(error, "load story");
  if (!data) return null;

  let media: FeaturedMediaRow | null = null;
  if (data.featured_media_id) {
    const mediaResult = await supabase
      .from("media")
      .select("id, cloudinary_public_id, secure_url, alt_text, caption, width, height")
      .eq("id", data.featured_media_id)
      .maybeSingle();
    assertRepositoryQuerySucceeded(mediaResult.error, "load story media");
    media = mediaResult.data;
  }
  return toStoryDto(data, media);
}

export async function getStoriesByCategory(
  locale: string,
  categorySlug: string,
): Promise<StorySummaryDto[]> {
  const category = await getCategoryBySlug(locale, categorySlug);
  if (!category) {
    return [];
  }

  return getPublishedStories({
    languageId: category.languageId,
    categoryId: category.id,
  });
}

export type PublishedCategoryStoryPageQuery = Readonly<{
  languageId: string;
  categoryId: string;
  page: number;
  pageSize: number;
  excludeStoryId?: string;
}>;

export type CategoryStoryCandidates = Readonly<{
  featured: readonly CategoryStoryDto[];
  latest: readonly CategoryStoryDto[];
}>;

export async function getCategoryStoryCandidates(
  languageId: string,
  categoryId: string,
): Promise<CategoryStoryCandidates> {
  const supabase = await createClient();
  const featuredQuery = supabase
    .from("stories")
    .select(CATEGORY_STORY_COLUMNS)
    .eq("language_id", languageId)
    .eq("category_id", categoryId)
    .eq("status", "published")
    .not("published_at", "is", null)
    .eq("is_featured", true)
    .order("published_at", { ascending: false })
    .limit(1);
  const latestQuery = supabase
    .from("stories")
    .select(CATEGORY_STORY_COLUMNS)
    .eq("language_id", languageId)
    .eq("category_id", categoryId)
    .eq("status", "published")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(1);
  const [featuredResult, latestResult] = await Promise.all([
    featuredQuery,
    latestQuery,
  ]);

  assertRepositoryQuerySucceeded(featuredResult.error, "load featured category story candidates");
  assertRepositoryQuerySucceeded(latestResult.error, "load latest category story candidates");
  const [featured, latest] = await Promise.all([
    attachCategoryFeaturedMedia(featuredResult.data),
    attachCategoryFeaturedMedia(latestResult.data),
  ]);
  return { featured, latest };
}

export async function getPublishedCategoryStoryPage(
  query: PublishedCategoryStoryPageQuery,
): Promise<PublishedCategoryStoryPageDto> {
  const supabase = await createClient();
  const from = (query.page - 1) * query.pageSize;
  let request = supabase
    .from("stories")
    .select(CATEGORY_STORY_COLUMNS, { count: "exact" })
    .eq("language_id", query.languageId)
    .eq("category_id", query.categoryId)
    .eq("status", "published")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false });

  if (query.excludeStoryId) request = request.neq("id", query.excludeStoryId);

  const { data, error, count } = await request.range(
    from,
    from + query.pageSize - 1,
  );
  if (error?.code === "PGRST103") {
    const detailsTotal = error.details.match(/only (\d+) rows/u)?.[1];
    const total = count ?? (detailsTotal ? Number(detailsTotal) : null);
    if (total !== null) return { stories: [], total };
  }
  assertRepositoryQuerySucceeded(error, "load published category story page");
  return { stories: await attachCategoryFeaturedMedia(data), total: count ?? 0 };
}

export async function getStoriesByLanguage(
  locale: string,
): Promise<StorySummaryDto[]> {
  const language = await getLanguage(locale);
  if (!language) {
    return [];
  }

  return getPublishedStories({ languageId: language.id });
}

export async function getCmsStories(query: CmsStoryListQuery): Promise<CmsStoryListResultDto> {
  const supabase = await createClient();
  const from = (query.page - 1) * query.pageSize;
  let request = supabase.from("stories").select(CMS_STORY_COLUMNS, { count: "exact" });

  if (query.search) {
    const search = query.search.replace(/[,()%]/g, " ").trim();
    if (search) request = request.or(`title.ilike.%${search}%,slug.ilike.%${search}%`);
  }
  if (query.status) request = request.eq("status", query.status);
  if (query.languageId) request = request.eq("language_id", query.languageId);
  if (query.categoryId) request = request.eq("category_id", query.categoryId);

  const sort = query.sort ?? "updated_desc";
  if (sort === "title_asc") request = request.order("title", { ascending: true });
  else if (sort === "published_desc") request = request.order("published_at", { ascending: false, nullsFirst: false });
  else request = request.order("updated_at", { ascending: sort === "updated_asc" });

  const { data, error, count } = await request.range(from, from + query.pageSize - 1);
  assertRepositoryQuerySucceeded(error, "load CMS stories");
  return { items: data.map(toCmsStoryDto), total: count ?? 0 };
}

export async function getCmsStoryById(id: string): Promise<CmsStoryDto | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("stories").select(CMS_STORY_COLUMNS).eq("id", id).maybeSingle();
  assertRepositoryQuerySucceeded(error, "load CMS story");
  return data ? toCmsStoryDto(data) : null;
}

export async function cmsStorySlugExists(languageId: string, slug: string, excludeId?: string): Promise<boolean> {
  const supabase = await createClient();
  let query = supabase.from("stories").select("id", { count: "exact", head: true }).eq("language_id", languageId).eq("slug", slug);
  if (excludeId) query = query.neq("id", excludeId);
  const { error, count } = await query;
  assertRepositoryQuerySucceeded(error, "check story slug");
  return (count ?? 0) > 0;
}

export async function insertCmsStory(values: CmsStoryInsert): Promise<CmsStoryDto> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("stories").insert(values).select(CMS_STORY_COLUMNS).single();
  assertRepositoryQuerySucceeded(error, "create story");
  return toCmsStoryDto(data);
}

export async function updateCmsStory(id: string, values: CmsStoryUpdate): Promise<CmsStoryDto> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("stories").update(values).eq("id", id).select(CMS_STORY_COLUMNS).single();
  assertRepositoryQuerySucceeded(error, "update story");
  return toCmsStoryDto(data);
}

export async function deleteCmsStory(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("stories").delete().eq("id", id);
  assertRepositoryQuerySucceeded(error, "delete story");
}

export async function getCmsStoryReferences(): Promise<CmsStoryReferenceDto> {
  const supabase = await createClient();
  const [languages, categories, sources, authors] = await Promise.all([
    supabase.from("languages").select("id, code, name").eq("is_active", true).order("name"),
    supabase.from("categories").select("id, language_id, name").eq("is_active", true).order("name"),
    supabase.from("sources").select("id, name").eq("is_active", true).order("name"),
    supabase.from("profiles").select("id, display_name").eq("is_active", true).order("display_name"),
  ]);
  assertRepositoryQuerySucceeded(languages.error, "load CMS languages");
  assertRepositoryQuerySucceeded(categories.error, "load CMS categories");
  assertRepositoryQuerySucceeded(sources.error, "load CMS sources");
  assertRepositoryQuerySucceeded(authors.error, "load CMS authors");
  return {
    languages: languages.data,
    categories: categories.data.map((item) => ({ id: item.id, languageId: item.language_id, name: item.name })),
    sources: sources.data,
    authors: authors.data.map((item) => ({ id: item.id, displayName: item.display_name })),
  };
}
