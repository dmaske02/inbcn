import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("imports dashboard reuses source data while history and scheduler ledger run concurrently", async () => {
  const [ingestionService, schedulerService] = await Promise.all([
    read("./ingestion.service.ts"),
    read("./scheduler.service.ts"),
  ]);

  assert.match(ingestionService, /const sourceViewPromise\s*=\s*getSourcesDashboard/iu);
  assert.match(ingestionService, /Promise\.all\(\[\s*sourceViewPromise[\s\S]*getIngestRunPage[\s\S]*getSchedulerDashboardForSources/iu);
  assert.match(schedulerService, /getSchedulerDashboardForSources/iu);
  assert.doesNotMatch(
    ingestionService,
    /getImportDashboard[\s\S]*Promise\.all\(\[[\s\S]*getSchedulerDashboard\(\)/iu,
  );
});

test("imports dashboard history uses a compact database projection", async () => {
  const [repository, migration] = await Promise.all([
    read("./ingestion.repository.ts"),
    read("../../../../supabase/migrations/20260804113000_compact_ingest_run_dashboard.sql"),
  ]);

  assert.match(repository, /from\("ingest_run_dashboard"\)/u);
  assert.doesNotMatch(repository, /const RUN_COLUMNS\s*=\s*[^;]*\bmetadata\b/isu);
  assert.match(migration, /create or replace view public\.ingest_run_dashboard/iu);
  assert.match(migration, /failure_reason/iu);
  assert.doesNotMatch(migration, /jsonb_agg\s*\(/iu);
});

test("run immediately defers queue processing after the scheduler batch is claimed", async () => {
  const [actions, schedulerService] = await Promise.all([
    read("./ingestion.actions.ts"),
    read("./scheduler.service.ts"),
  ]);

  assert.match(actions, /after\s*\(/u);
  assert.match(actions, /enqueueAutomatedImports/u);
  assert.doesNotMatch(actions, /runSchedulerNowAction[\s\S]*await timeImportAsync\("runSchedulerNowAction\.runAutomatedImports"/u);
  assert.match(schedulerService, /export async function enqueueAutomatedImports/iu);
});

test("development browser origin is allowed for the local CMS runtime", async () => {
  const nextConfig = await read("../../../../next.config.ts");

  assert.match(nextConfig, /allowedDevOrigins:\s*\[[^\]]*"127\.0\.0\.1"[^\]]*\]/u);
});
