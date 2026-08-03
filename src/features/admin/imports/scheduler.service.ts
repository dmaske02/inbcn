import "server-only";

import { env } from "@/config/env";
import type { AdminIdentity } from "@/features/admin/auth/authorization.model";
import { runNewsDataImportOperation } from "./ingestion.operations";
import { fetchNewsDataPage } from "./newsdata.repository";
import { runRssImportOperation } from "./rss.operations";
import { fetchRssFeed } from "./rss.repository";
import { buildImportQueue, calculateImportStatistics, getNextScheduledAt, runClaimedQueue, runImportQueue } from "./scheduler.model";
import { automatedImportDependencies, claimAutomatedBatch, completeAutomatedBatch, getAutomatedImportContext, getSchedulerLedger, recordSchedulerControl } from "./scheduler.repository";

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

export async function runAutomatedImports(options: Readonly<{ force?: boolean }> = {}) {
  const config = env.server.autoImport;
  const now = new Date();
  const ledger = await getSchedulerLedger();
  const lastBatch = ledger.find((row) => metadataValue(row.metadata, "kind") === "scheduler_batch" && row.status !== "skipped");
  if (!options.force && lastBatch && getNextScheduledAt(lastBatch.createdAt, config.intervalMinutes) > now) {
    return { started: false, reason: "not_due" as const };
  }
  const { sources } = await getAutomatedImportContext();
  const queue = buildImportQueue(sources);
  const startedAt = now.toISOString();
  const lockExpiresAt = new Date(now.getTime() + Math.max(config.timeoutSeconds * Math.max(queue.length, 1) * (config.retryCount + 1), 300) * 1_000).toISOString();
  const claim = await claimAutomatedBatch({ startedAt, lockExpiresAt, queueSize: queue.length, force: options.force === true });
  return runClaimedQueue(claim, async () => {
   try {
    const result = await runImportQueue(queue.map((source) => source.id), { retryCount: config.retryCount, timeoutSeconds: config.timeoutSeconds, importSource: importAutomatedSource });
    const status = result.failures.length === 0 ? "completed" : result.imported > 0 ? "partial" : "failed";
    await completeAutomatedBatch(claim.batchId, { ...result, status, completedAt: new Date().toISOString() });
    console.info(JSON.stringify({ event: "auto_import_completed", batchId: claim.batchId, status, queueSize: queue.length, ...result }));
    return { started: true, batchId: claim.batchId, status, queueSize: queue.length, ...result };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Automated import failed.";
    await completeAutomatedBatch(claim.batchId, { status: "failed", completedAt: new Date().toISOString(), imported: 0, skipped: 0, duplicates: 0, failed: queue.length, retries: 0, failures: [{ sourceId: "scheduler", reason }] });
    console.error(JSON.stringify({ event: "auto_import_failed", batchId: claim.batchId, reason }));
    throw error;
   }
  });
}

export async function setSchedulerEnabled(admin: AdminIdentity, enabled: boolean) {
  await recordSchedulerControl(enabled, admin.id);
}

export async function getSchedulerDashboard() {
  const config = env.server.autoImport;
  const [ledger, context] = await Promise.all([getSchedulerLedger(), getAutomatedImportContext()]);
  const batches = ledger.filter((row) => metadataValue(row.metadata, "kind") === "scheduler_batch");
  const control = ledger.find((row) => metadataValue(row.metadata, "kind") === "scheduler_control");
  const enabled = config.enabled && (control ? metadataValue(control.metadata, "enabled") === true : true);
  const lastRun = batches.find((row) => row.status !== "running" && row.status !== "skipped") ?? null;
  const current = batches.find((row) => row.status === "running" && new Date(String(metadataValue(row.metadata, "lockExpiresAt"))).getTime() > Date.now()) ?? null;
  const statistics = calculateImportStatistics(batches.filter((row): row is typeof row & { completedAt: string } => Boolean(row.completedAt)).map((row) => ({ completedAt: row.completedAt, imported: row.imported })));
  return {
    enabled, configured: config.enabled, intervalMinutes: config.intervalMinutes, retryCount: config.retryCount,
    queueSize: buildImportQueue(context.sources).length, currentRun: current?.startedAt ?? null,
    lastRun: lastRun?.completedAt ?? null,
    nextRun: enabled ? getNextScheduledAt(lastRun?.createdAt ?? null, config.intervalMinutes).toISOString() : null,
    recentFailures: batches.filter((row) => row.status === "failed" || row.status === "partial").slice(0, 5).map((row) => ({ id: row.id, at: row.completedAt ?? row.createdAt, reason: row.errorMessage ?? "Import failed." })),
    statistics,
  };
}
