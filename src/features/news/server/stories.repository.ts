import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { TableRow } from "@/lib/supabase/types";
import { getCategoryBySlug } from "./categories.repository";
import type { StoryDto, StorySummaryDto } from "./dto";
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

function toStorySummaryDto(row: StorySummaryRow): StorySummaryDto {
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
    isFeatured: row.is_featured,
    isBreaking: row.is_breaking,
    isSponsored: row.is_sponsored,
    publishedAt: row.published_at,
  };
}

type FeaturedMediaRow = Pick<TableRow<"media">, "secure_url" | "alt_text" | "caption" | "width" | "height">;

function toStoryDto(row: StoryDetailRow, media: FeaturedMediaRow | null): StoryDto {
  return {
    ...toStorySummaryDto(row),
    content: row.content,
    updatedAt: row.updated_at,
    externalUrl: row.external_url,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    seoKeywords: row.seo_keywords,
    canonicalUrl: row.canonical_url,
    featuredMedia: media ? {
      secureUrl: media.secure_url,
      altText: media.alt_text,
      caption: media.caption,
      width: media.width,
      height: media.height,
    } : null,
  };
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
  return data.map(toStorySummaryDto);
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
      .select("secure_url, alt_text, caption, width, height")
      .eq("id", data.featured_media_id)
      .eq("story_id", data.id)
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

export async function getStoriesByLanguage(
  locale: string,
): Promise<StorySummaryDto[]> {
  const language = await getLanguage(locale);
  if (!language) {
    return [];
  }

  return getPublishedStories({ languageId: language.id });
}
