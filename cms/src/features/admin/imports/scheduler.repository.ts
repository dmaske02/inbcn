import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import type { IngestionReferenceDto, IngestionSourceDto } from "./ingestion.types";

export type SchedulerBatch = Readonly<{
  id: string; status: string; startedAt: string | null; completedAt: string | null;
  imported: number; failed: number; errorMessage: string | null; metadata: Json; createdAt: string;
}>;

export async function getAutomatedImportContext(): Promise<Readonly<{
  sources: IngestionSourceDto[]; references: IngestionReferenceDto;
}>> {
  const client = createAdminClient();
  const [sources, languages, categories] = await Promise.all([
    client.from("sources").select("id,name,slug,source_type,website_url,feed_url,default_language_id,default_category_id,country,ingestion_priority,is_active,last_ingested_at,created_at,updated_at").in("source_type", ["newsdata_api", "rss"]).eq("is_active", true).order("ingestion_priority"),
    client.from("languages").select("id,code,name").eq("is_active", true),
    client.from("categories").select("id,language_id,slug,name").eq("is_active", true),
  ]);
  if (sources.error || languages.error || categories.error) throw sources.error ?? languages.error ?? categories.error;
  return {
    sources: sources.data.map((row) => ({ id: row.id, name: row.name, slug: row.slug, sourceType: row.source_type, websiteUrl: row.website_url, feedUrl: row.feed_url, defaultLanguageId: row.default_language_id, defaultCategoryId: row.default_category_id, country: row.country, ingestionPriority: row.ingestion_priority, isActive: row.is_active, lastIngestedAt: row.last_ingested_at, createdAt: row.created_at, updatedAt: row.updated_at })),
    references: { languages: languages.data, categories: categories.data.map((row) => ({ id: row.id, languageId: row.language_id, slug: row.slug, name: row.name })) },
  };
}

export async function claimAutomatedBatch(input: Readonly<{ startedAt: string; lockExpiresAt: string; queueSize: number; force: boolean }>) {
  const { data, error } = await createAdminClient().rpc("claim_auto_import_batch", {
    p_started_at: input.startedAt, p_lock_expires_at: input.lockExpiresAt,
    p_queue_size: input.queueSize, p_force: input.force,
  });
  if (error) throw error;
  const value = data as Readonly<{ claimed?: boolean; batchId?: string; reason?: string }>;
  if (!value.batchId) throw new Error("Scheduler claim did not return a batch id.");
  return { claimed: value.claimed === true, batchId: value.batchId, reason: value.reason ?? null };
}

export async function completeAutomatedBatch(id: string, input: Readonly<{ status: "completed" | "partial" | "failed"; completedAt: string; imported: number; skipped: number; duplicates: number; failed: number; retries: number; failures: readonly Readonly<{ sourceId: string; reason: string }>[] }>) {
  const metadata: Json = { kind: "scheduler_batch", skipped: input.skipped, duplicates: input.duplicates, retries: input.retries, failures: input.failures.map((item) => ({ ...item })) };
  const { error } = await createAdminClient().from("ingest_runs").update({ status: input.status, completed_at: input.completedAt, items_created: input.imported, items_failed: input.failed, error_message: input.failures[0]?.reason ?? null, metadata, updated_at: input.completedAt }).eq("id", id);
  if (error) throw error;
}

export async function recordSchedulerControl(enabled: boolean, actorId: string) {
  const now = new Date().toISOString();
  const { error } = await createAdminClient().from("ingest_runs").insert({ triggered_by: actorId, status: "completed", started_at: now, completed_at: now, metadata: { kind: "scheduler_control", enabled } });
  if (error) throw error;
}

export async function getSchedulerLedger(): Promise<SchedulerBatch[]> {
  const { data, error } = await createAdminClient().from("ingest_runs").select("id,status,started_at,completed_at,items_created,items_failed,error_message,metadata,created_at").is("source_id", null).order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return data.map((row) => ({ id: row.id, status: row.status, startedAt: row.started_at, completedAt: row.completed_at, imported: row.items_created, failed: row.items_failed, errorMessage: row.error_message, metadata: row.metadata, createdAt: row.created_at }));
}

export function automatedImportDependencies() {
  const client = createAdminClient();
  return {
    createRun: async (input: Readonly<{ sourceId: string; actorId: string | null; startedAt: string }>) => {
      const { data, error } = await client.from("ingest_runs").insert({ source_id: input.sourceId, triggered_by: input.actorId, status: "running", started_at: input.startedAt, metadata: { kind: "source_import", trigger: "scheduler" } }).select("id").single();
      if (error) throw error; return data;
    },
    completeRun: async (id: string, completion: import("./external-import.operations").ImportCompletion) => {
      const metadata: Json = { kind: "source_import", trigger: "scheduler", skipped: completion.counts.skipped, duplicates: completion.counts.duplicates, details: completion.details.map((item) => ({ ...item })), nextPage: completion.nextPage, quota: completion.quota ? { ...completion.quota } : null };
      const { error } = await client.from("ingest_runs").update({ status: completion.status, items_fetched: completion.counts.fetched, items_created: completion.counts.imported, items_failed: completion.counts.failed, error_message: completion.errorMessage, metadata, completed_at: completion.completedAt, updated_at: completion.completedAt }).eq("id", id); if (error) throw error;
    },
    getExistingIdentities: async (sourceId: string) => {
      const { data, error } = await client.from("stories").select("external_id,external_url,title").eq("source_id", sourceId).eq("story_type", "external_article"); if (error) throw error;
      return data.map((row) => ({ externalId: row.external_id, externalUrl: row.external_url, title: row.title }));
    },
    slugExists: async (languageId: string, slug: string) => { const { count, error } = await client.from("stories").select("id", { count: "exact", head: true }).eq("language_id", languageId).eq("slug", slug); if (error) throw error; return (count ?? 0) > 0; },
    insertDraft: async (draft: import("./external-import.operations").ImportedStoryDraft) => { const { data, error } = await client.from("stories").insert({ ...draft, seo_keywords: [...draft.seo_keywords] }).select("id").single(); if (error?.code === "23505") return { status: "duplicate" as const }; if (error) throw error; return { status: "created" as const, id: data.id }; },
    touchSource: async (sourceId: string, timestamp: string) => { const { error } = await client.from("sources").update({ last_ingested_at: timestamp, updated_at: timestamp }).eq("id", sourceId); if (error) throw error; },
    now: () => new Date().toISOString(),
  };
}
