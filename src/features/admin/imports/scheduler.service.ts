import "server-only";

import { env } from "@/config/env";
import type { AdminIdentity } from "@/features/admin/auth/authorization.model";
import { runNewsDataImportOperation } from "./ingestion.operations";
import { fetchNewsDataPage } from "./newsdata.repository";
import { runRssImportOperation } from "./rss.operations";
import { fetchRssFeed } from "./rss.repository";
import { buildImportQueue, calculateImportStatistics, getNextScheduledAt, runClaimedQueue, runImportQueue } from "./scheduler.model";
import { automatedImportDependencies, claimAutomatedBatch, completeAutomatedBatch, getAutomatedImportContext, getSchedulerLedger, recordSchedulerControl } from "./scheduler.repository";
import type { IngestionSourceDto } from "./ingestion.types";

function metadataValue(metadata: unknown, key: string): unknown {
  return metadata && typeof metadata === "object" ? Reflect.get(metadata, key) : undefined;
}

async function importAutomatedSource(sourceId: string) {
  const { sources, references } = await getAutomatedImportContext();
  const source = sources.find((item) => item.id === sourceId);
  if (!source) throw new Error("Active import source was not found.");
  const language = references.languages.find((item) => item.id === source.defaultLanguageId);
  const category = references.categories.find((item) => item.id === source.defaultCategoryId);
  const input = {
    actorId: null,
    source: { id: source.id, name: source.name, defaultLanguageId: source.defaultLanguageId, defaultLanguageCode: language?.code ?? null, defaultCategoryId: source.defaultCategoryId, defaultCategorySlug: category?.slug ?? null, country: source.country, isActive: source.isActive },
    categories: references.categories.filter((item) => item.languageId === source.defaultLanguageId).map((item) => ({ id: item.id, slug: item.slug })),
  };
  const dependencies = automatedImportDependencies();
  const result = source.sourceType === "rss"
    ? await runRssImportOperation({ ...input, source: { ...input.source, feedUrl: source.feedUrl } }, { ...dependencies, fetchFeed: fetchRssFeed })
    : await runNewsDataImportOperation(input, { ...dependencies, fetchPage: fetchNewsDataPage });
  await dependencies.touchSource(source.id, new Date().toISOString());
  return result;
}

async function executeAutomatedImportQueue(
  claim: Readonly<{ claimed: boolean; batchId: string; reason: string | null }>,
  queue: readonly IngestionSourceDto[],
) {
  const config = env.server.autoImport;
  return runClaimedQueue(claim, async () => {
   try {
    const result = await runImportQueue(queue.map((source) => source.id), { retryCount: config.retryCount, timeoutSeconds: config.timeoutSeconds, importSource: importAutomatedSource });
    const status = result.failures.length === 0 ? "completed" : result.imported > 0 ? "partial" : "failed";
    await completeAutomatedBatch(claim.batchId, { ...result, status, completedAt: new Date().toISOString() });
    return { started: true, batchId: claim.batchId, status, queueSize: queue.length, ...result };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Automated import failed.";
    await completeAutomatedBatch(claim.batchId, { status: "failed", completedAt: new Date().toISOString(), imported: 0, skipped: 0, duplicates: 0, failed: queue.length, retries: 0, failures: [{ sourceId: "scheduler", reason }] });
    console.error(JSON.stringify({ event: "auto_import_failed", batchId: claim.batchId, reason }));
    throw error;
   }
  });
}

export async function enqueueAutomatedImports(
  options: Readonly<{ force?: boolean }> = {},
) {
  const config = env.server.autoImport;
  const now = new Date();
  const [ledger, context] = await Promise.all([
    options.force ? Promise.resolve(null) : getSchedulerLedger(),
    getAutomatedImportContext(),
  ]);
  const lastBatch = ledger?.find((row) =>
    metadataValue(row.metadata, "kind") === "scheduler_batch" &&
    row.status !== "skipped",
  );
  if (!options.force && lastBatch && getNextScheduledAt(lastBatch.createdAt, config.intervalMinutes) > now) {
    return { result: { started: false, reason: "not_due" as const }, run: null };
  }
  const queue = buildImportQueue(context.sources);
  const startedAt = now.toISOString();
  const lockExpiresAt = new Date(
    now.getTime() +
      Math.max(
        config.timeoutSeconds * Math.max(queue.length, 1) * (config.retryCount + 1),
        300,
      ) * 1_000,
  ).toISOString();
  const claim = await claimAutomatedBatch({
    startedAt,
    lockExpiresAt,
    queueSize: queue.length,
    force: options.force === true,
  });
  if (!claim.claimed) {
    return {
      result: {
        started: false,
        batchId: claim.batchId,
        reason: claim.reason ?? "locked",
      },
      run: null,
    };
  }
  return {
    result: { started: true, batchId: claim.batchId, queueSize: queue.length },
    run: () => executeAutomatedImportQueue(claim, queue),
  };
}

export async function runAutomatedImports(options: Readonly<{ force?: boolean }> = {}) {
  const queued = await enqueueAutomatedImports(options);
  return queued.run ? queued.run() : queued.result;
}

export async function setSchedulerEnabled(admin: AdminIdentity, enabled: boolean) {
  await recordSchedulerControl(enabled, admin.id);
}

function composeSchedulerDashboard(
  ledger: Awaited<ReturnType<typeof getSchedulerLedger>>,
  sources: readonly IngestionSourceDto[],
) {
  const config = env.server.autoImport;
  const batches = ledger.filter((row) => metadataValue(row.metadata, "kind") === "scheduler_batch");
  const control = ledger.find((row) => metadataValue(row.metadata, "kind") === "scheduler_control");
  const enabled = config.enabled && (control ? metadataValue(control.metadata, "enabled") === true : true);
  const lastRun = batches.find((row) => row.status !== "running" && row.status !== "skipped") ?? null;
  const current = batches.find((row) => row.status === "running" && new Date(String(metadataValue(row.metadata, "lockExpiresAt"))).getTime() > Date.now()) ?? null;
  const statistics = calculateImportStatistics(batches.filter((row): row is typeof row & { completedAt: string } => Boolean(row.completedAt)).map((row) => ({ completedAt: row.completedAt, imported: row.imported })));
  return {
    enabled, configured: config.enabled, intervalMinutes: config.intervalMinutes, retryCount: config.retryCount,
    queueSize: buildImportQueue(sources).length, currentRun: current?.startedAt ?? null,
    lastRun: lastRun?.completedAt ?? null,
    nextRun: enabled ? getNextScheduledAt(lastRun?.createdAt ?? null, config.intervalMinutes).toISOString() : null,
    recentFailures: batches.filter((row) => row.status === "failed" || row.status === "partial").slice(0, 5).map((row) => ({ id: row.id, at: row.completedAt ?? row.createdAt, reason: row.errorMessage ?? "Import failed." })),
    statistics,
  };
}

export async function getSchedulerDashboardForSources(
  sources: PromiseLike<readonly IngestionSourceDto[]> | readonly IngestionSourceDto[],
) {
  const [ledger, resolvedSources] = await Promise.all([
    getSchedulerLedger(),
    sources,
  ]);
  return composeSchedulerDashboard(ledger, resolvedSources);
}

export async function getSchedulerDashboard() {
  const [ledger, context] = await Promise.all([
    getSchedulerLedger(),
    getAutomatedImportContext(),
  ]);
  return composeSchedulerDashboard(ledger, context.sources);
}
