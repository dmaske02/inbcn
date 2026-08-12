import "server-only";

import type { createClient as createSupabaseClient } from "../../../lib/supabase/server.ts";
import type { HomepageLocale } from "../homepage-builder.types.ts";
import type {
  HomepagePickerCategoryRecord,
  HomepagePickerQuery,
  HomepagePickerRepository,
  HomepagePickerStoryRecord,
} from "./homepage-picker.types.ts";

const STORY_COLUMNS = "id, language_id, title, published_at, external_image_url, external_image_width, external_image_height, featured_media:media!stories_featured_media_id_fkey(secure_url, alt_text, width, height), category:categories!stories_category_language_fkey(id, name)" as const;
const CATEGORY_COLUMNS = "id, language_id, name, slug, stories:stories!stories_category_language_fkey(count)" as const;

type PickerClient = Awaited<ReturnType<typeof createSupabaseClient>>;
type RepositoryDependencies = Readonly<{
  createClient?: () => Promise<PickerClient>;
  now?: () => string;
}>;

type StoryRow = Readonly<{
  id: string;
  language_id: string;
  title: string;
  published_at: string | null;
  external_image_url: string | null;
  external_image_width: number | null;
  external_image_height: number | null;
  featured_media: Readonly<{
    secure_url: string;
    alt_text: string | null;
    width: number | null;
    height: number | null;
  }> | readonly Readonly<{
    secure_url: string;
    alt_text: string | null;
    width: number | null;
    height: number | null;
  }>[] | null;
  category: Readonly<{ id: string; name: string }> | readonly Readonly<{ id: string; name: string }>[] | null;
}>;

type CategoryRow = Readonly<{
  id: string;
  language_id: string;
  name: string;
  slug: string;
  stories: Readonly<{ count: number }> | readonly Readonly<{ count: number }>[] | null;
}>;

function fail(error: { message: string } | null, action: string): void {
  if (error) throw new Error(`Unable to ${action}: ${error.message}`);
}

function one<T>(value: T | readonly T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value as T | null;
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

async function resolveLanguageId(client: PickerClient, locale: HomepageLocale): Promise<string> {
  const { data, error } = await client
    .from("languages")
    .select("id")
    .eq("code", locale)
    .eq("is_active", true)
    .maybeSingle();
  fail(error, "resolve the Homepage Picker language");
  if (!data) throw new Error("The Homepage Picker language is unavailable.");
  return data.id;
}

function toStoryRecord(row: StoryRow): HomepagePickerStoryRecord {
  if (!row.published_at) throw new Error("A published Homepage Picker story is missing its publication date.");
  const category = one(row.category);
  const featuredMedia = one(row.featured_media);
  return {
    id: row.id,
    languageId: row.language_id,
    title: row.title,
    publishedAt: row.published_at,
    category: category ? { id: category.id, name: category.name } : null,
    featuredMedia: featuredMedia
      ? {
          url: featuredMedia.secure_url,
          altText: featuredMedia.alt_text,
          width: featuredMedia.width,
          height: featuredMedia.height,
        }
      : null,
    externalImage: row.external_image_url
      ? {
          url: row.external_image_url,
          width: row.external_image_width,
          height: row.external_image_height,
        }
      : null,
  };
}

function toCategoryRecord(row: CategoryRow): HomepagePickerCategoryRecord {
  const count = one(row.stories)?.count ?? 0;
  return {
    id: row.id,
    languageId: row.language_id,
    name: row.name,
    slug: row.slug,
    publishedStoryCount: count,
  };
}

export function createHomepagePickerRepository(
  dependencies: RepositoryDependencies = {},
): HomepagePickerRepository {
  const getClient = dependencies.createClient ?? (async () => {
    const { createClient } = await import("../../../lib/supabase/server.ts");
    return createClient();
  });
  const now = dependencies.now ?? (() => new Date().toISOString());

  return {
    async searchStoryRecords(query: HomepagePickerQuery) {
      const client = await getClient();
      const languageId = await resolveLanguageId(client, query.locale);
      const first = (query.page - 1) * query.pageSize;
      const last = first + query.pageSize - 1;
      let request = client
        .from("stories")
        .select(STORY_COLUMNS, { count: "exact" })
        .eq("language_id", languageId)
        .eq("status", "published")
        .not("published_at", "is", null)
        .lte("published_at", now());
      if (query.query) request = request.ilike("title", `%${escapeLikePattern(query.query)}%`);
      const { data, count, error } = await request
        .order("published_at", { ascending: false })
        .order("id", { ascending: false })
        .range(first, last);
      fail(error, "search published Homepage Picker stories");
      return {
        records: ((data ?? []) as unknown as StoryRow[]).map(toStoryRecord),
        total: count ?? 0,
      };
    },

    async searchCategoryRecords(query: HomepagePickerQuery) {
      const client = await getClient();
      const languageId = await resolveLanguageId(client, query.locale);
      const first = (query.page - 1) * query.pageSize;
      const last = first + query.pageSize - 1;
      let request = client
        .from("categories")
        .select(CATEGORY_COLUMNS, { count: "exact" })
        .eq("language_id", languageId)
        .eq("is_active", true)
        .eq("stories.status", "published")
        .eq("stories.language_id", languageId)
        .not("stories.published_at", "is", null)
        .lte("stories.published_at", now());
      if (query.query) request = request.ilike("name", `%${escapeLikePattern(query.query)}%`);
      const { data, count, error } = await request
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .range(first, last);
      fail(error, "search active Homepage Picker categories");
      return {
        records: ((data ?? []) as unknown as CategoryRow[]).map(toCategoryRecord),
        total: count ?? 0,
      };
    },

    async findPublishedStoryRecord(id: string, locale: HomepageLocale) {
      const client = await getClient();
      const languageId = await resolveLanguageId(client, locale);
      const { data, error } = await client
        .from("stories")
        .select(STORY_COLUMNS)
        .eq("id", id)
        .eq("language_id", languageId)
        .eq("status", "published")
        .not("published_at", "is", null)
        .lte("published_at", now())
        .maybeSingle();
      fail(error, "load the targeted published Homepage Picker story");
      return data ? toStoryRecord(data as unknown as StoryRow) : null;
    },

    async findActiveCategoryRecord(id: string, locale: HomepageLocale) {
      const client = await getClient();
      const languageId = await resolveLanguageId(client, locale);
      const { data, error } = await client
        .from("categories")
        .select(CATEGORY_COLUMNS)
        .eq("id", id)
        .eq("language_id", languageId)
        .eq("is_active", true)
        .eq("stories.status", "published")
        .eq("stories.language_id", languageId)
        .not("stories.published_at", "is", null)
        .lte("stories.published_at", now())
        .maybeSingle();
      fail(error, "load the targeted active Homepage Picker category");
      return data ? toCategoryRecord(data as unknown as CategoryRow) : null;
    },
  };
}

const repository = createHomepagePickerRepository();

export const searchStoryRecords = repository.searchStoryRecords;
export const searchCategoryRecords = repository.searchCategoryRecords;
export const findPublishedStoryRecord = repository.findPublishedStoryRecord;
export const findActiveCategoryRecord = repository.findActiveCategoryRecord;
