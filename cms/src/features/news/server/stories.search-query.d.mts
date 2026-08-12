import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

export type PublishedStorySearchRequestQuery = Readonly<{
  languageId: string;
  query: string;
  categoryId?: string;
  publishedAfter?: string;
  page: number;
  pageSize: number;
}>;

export function buildPublishedStorySearchRequest<T>(
  supabase: SupabaseClient<Database>,
  columns: string,
  query: PublishedStorySearchRequestQuery,
): PromiseLike<Readonly<{
  data: T[] | null;
  error: PostgrestError | null;
  count: number | null;
}>>;
