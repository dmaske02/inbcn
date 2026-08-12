import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { TableRow } from "@/lib/supabase/types";
import type { SourceDto } from "./dto";
import { assertRepositoryQuerySucceeded } from "./errors";

const SOURCE_COLUMNS =
  "id, default_language_id, default_category_id, name, slug, source_type, website_url, feed_url, trust_score, last_ingested_at" as const;

type SourceRow = Pick<
  TableRow<"sources">,
  | "id"
  | "default_language_id"
  | "default_category_id"
  | "name"
  | "slug"
  | "source_type"
  | "website_url"
  | "feed_url"
  | "trust_score"
  | "last_ingested_at"
>;

function toSourceDto(row: SourceRow): SourceDto {
  return {
    id: row.id,
    defaultLanguageId: row.default_language_id,
    defaultCategoryId: row.default_category_id,
    name: row.name,
    slug: row.slug,
    type: row.source_type,
    websiteUrl: row.website_url,
    feedUrl: row.feed_url,
    trustScore: row.trust_score,
    lastIngestedAt: row.last_ingested_at,
  };
}

export async function getActiveSources(): Promise<SourceDto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sources")
    .select(SOURCE_COLUMNS)
    .eq("is_active", true)
    .order("name");

  assertRepositoryQuerySucceeded(error, "load active sources");
  return data.map(toSourceDto);
}
