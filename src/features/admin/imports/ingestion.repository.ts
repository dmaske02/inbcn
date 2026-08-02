import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database, Json, TableRow } from "@/lib/supabase/types";
import { assertRepositoryQuerySucceeded } from "@/features/news/server/errors";
import type { ImportCompletion } from "./ingestion.operations";
import { parseImportRunMetadata } from "./newsdata.model";
import type {
  IngestRunDto,
  IngestRunPageDto,
  NewsDataReferenceDto,
  NewsDataSourceDto,
} from "./ingestion.types";

const SOURCE_COLUMNS =
  "id, name, slug, default_language_id, default_category_id, country, ingestion_priority, is_active, last_ingested_at, created_at, updated_at" as const;

const RUN_COLUMNS =
  "id, source_id, triggered_by, status, items_fetched, items_created, items_updated, items_failed, error_message, metadata, started_at, completed_at, created_at, source:sources!ingest_runs_source_id_fkey(name)" as const;

type SourceRow = Pick<
  TableRow<"sources">,
  | "id"
  | "name"
  | "slug"
  | "default_language_id"
  | "default_category_id"
  | "country"
  | "ingestion_priority"
  | "is_active"
  | "last_ingested_at"
  | "created_at"
  | "updated_at"
>;

function toSourceDto(row: SourceRow): NewsDataSourceDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    defaultLanguageId: row.default_language_id,
    defaultCategoryId: row.default_category_id,
    country: row.country,
    ingestionPriority: row.ingestion_priority,
    isActive: row.is_active,
    lastIngestedAt: row.last_ingested_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function relationName(
  relation: Readonly<{ name: string }> | readonly Readonly<{ name: string }>[] | null,
): string {
  if (!relation) return "Unknown source";
  if ("name" in relation) return relation.name;
  return relation[0]?.name ?? "Unknown source";
}

function toRunDto(row: {
  id: string;
  source_id: string;
  triggered_by: string | null;
  status: string;
  items_fetched: number;
  items_created: number;
  items_updated: number;
  items_failed: number;
  error_message: string | null;
  metadata: Json;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  source: Readonly<{ name: string }> | readonly Readonly<{ name: string }>[] | null;
}): IngestRunDto {
  const status = ["queued", "running", "completed", "partial", "failed"].includes(
    row.status,
  )
    ? (row.status as IngestRunDto["status"])
    : "failed";
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceName: relationName(row.source),
    triggeredBy: row.triggered_by,
    status,
    itemsFetched: row.items_fetched,
    itemsCreated: row.items_created,
    itemsUpdated: row.items_updated,
    itemsFailed: row.items_failed,
    errorMessage: row.error_message,
    metadata: parseImportRunMetadata(row.metadata),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

export async function getNewsDataSources(): Promise<NewsDataSourceDto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sources")
    .select(SOURCE_COLUMNS)
    .eq("source_type", "newsdata_api")
    .order("ingestion_priority")
    .order("name");
  assertRepositoryQuerySucceeded(error, "load NewsData sources");
  return data.map(toSourceDto);
}

export async function getNewsDataSourceById(
  id: string,
): Promise<NewsDataSourceDto | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sources")
    .select(SOURCE_COLUMNS)
    .eq("id", id)
    .eq("source_type", "newsdata_api")
    .maybeSingle();
  assertRepositoryQuerySucceeded(error, "load NewsData source");
  return data ? toSourceDto(data) : null;
}

export async function newsDataSourceSlugExists(
  slug: string,
  excludeId?: string,
): Promise<boolean> {
  const supabase = await createClient();
  let request = supabase
    .from("sources")
    .select("id", { count: "exact", head: true })
    .eq("slug", slug);
  if (excludeId) request = request.neq("id", excludeId);
  const { count, error } = await request;
  assertRepositoryQuerySucceeded(error, "check NewsData source slug");
  return (count ?? 0) > 0;
}

type SourceValues = Database["public"]["Tables"]["sources"]["Insert"];

export async function insertNewsDataSource(
  values: SourceValues,
): Promise<NewsDataSourceDto> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sources")
    .insert(values)
    .select(SOURCE_COLUMNS)
    .single();
  assertRepositoryQuerySucceeded(error, "create NewsData source");
  return toSourceDto(data);
}

export async function updateNewsDataSource(
  id: string,
  values: Database["public"]["Tables"]["sources"]["Update"],
): Promise<NewsDataSourceDto> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sources")
    .update(values)
    .eq("id", id)
    .eq("source_type", "newsdata_api")
    .select(SOURCE_COLUMNS)
    .single();
  assertRepositoryQuerySucceeded(error, "update NewsData source");
  return toSourceDto(data);
}

export async function getNewsDataReferences(): Promise<NewsDataReferenceDto> {
  const supabase = await createClient();
  const [languages, categories] = await Promise.all([
    supabase
      .from("languages")
      .select("id, code, name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("categories")
      .select("id, language_id, slug, name")
      .eq("is_active", true)
      .order("name"),
  ]);
  assertRepositoryQuerySucceeded(languages.error, "load ingestion languages");
  assertRepositoryQuerySucceeded(categories.error, "load ingestion categories");
  return {
    languages: languages.data,
    categories: categories.data.map((category) => ({
      id: category.id,
      languageId: category.language_id,
      slug: category.slug,
      name: category.name,
    })),
  };
}

export async function getIngestRunPage(
  page: number,
  pageSize: number,
): Promise<IngestRunPageDto> {
  const supabase = await createClient();
  const from = (page - 1) * pageSize;
  const { data, error, count } = await supabase
    .from("ingest_runs")
    .select(RUN_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  assertRepositoryQuerySucceeded(error, "load import history");
  return { items: data.map(toRunDto), total: count ?? 0 };
}

export async function createIngestRun(input: {
  sourceId: string;
  actorId: string;
  startedAt: string;
}): Promise<Readonly<{ id: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ingest_runs")
    .insert({
      source_id: input.sourceId,
      triggered_by: input.actorId,
      status: "running",
      started_at: input.startedAt,
    })
    .select("id")
    .single();
  assertRepositoryQuerySucceeded(error, "start NewsData import");
  return data;
}

export async function completeIngestRun(
  id: string,
  completion: ImportCompletion,
): Promise<void> {
  const supabase = await createClient();
  const metadata: Json = {
    skipped: completion.counts.skipped,
    duplicates: completion.counts.duplicates,
    details: completion.details.map((detail) => ({ ...detail })),
    nextPage: completion.nextPage,
    quota: completion.quota ? { ...completion.quota } : null,
  };
  const { error } = await supabase
    .from("ingest_runs")
    .update({
      status: completion.status,
      items_fetched: completion.counts.fetched,
      items_created: completion.counts.imported,
      items_updated: 0,
      items_failed: completion.counts.failed,
      error_message: completion.errorMessage,
      metadata,
      completed_at: completion.completedAt,
      updated_at: completion.completedAt,
    })
    .eq("id", id);
  assertRepositoryQuerySucceeded(error, "complete NewsData import");
}

export async function touchSourceLastIngestedAt(
  id: string,
  timestamp: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("sources")
    .update({ last_ingested_at: timestamp, updated_at: timestamp })
    .eq("id", id)
    .eq("source_type", "newsdata_api");
  assertRepositoryQuerySucceeded(error, "update NewsData source activity");
}
