export type SchedulableSource = Readonly<{
  id: string;
  sourceType: string;
  isActive: boolean;
  ingestionPriority: number;
  defaultLanguageId: string | null;
  defaultCategoryId: string | null;
  feedUrl: string | null;
}>;

export type QueueResult = Readonly<{
  imported: number;
  skipped: number;
  duplicates: number;
  failed: number;
  retries: number;
  failures: readonly Readonly<{ sourceId: string; reason: string }>[];
}>;

export function buildImportQueue<T extends SchedulableSource>(sources: readonly T[]): T[] {
  return sources
    .filter((source) =>
      (source.sourceType === "newsdata_api" || source.sourceType === "rss") &&
      source.isActive &&
      Boolean(source.defaultLanguageId) &&
      Boolean(source.defaultCategoryId) &&
      (source.sourceType !== "rss" || Boolean(source.feedUrl)))
    .toSorted((left, right) =>
      left.ingestionPriority - right.ingestionPriority || left.id.localeCompare(right.id));
}

export function getNextScheduledAt(lastRunAt: string | null, intervalMinutes: number, now = new Date()): Date {
  const base = lastRunAt ? new Date(lastRunAt) : now;
  return new Date(base.getTime() + intervalMinutes * 60_000);
}

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown import failure";
}

async function withTimeout<T>(operation: Promise<T>, timeoutSeconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Import timed out after ${timeoutSeconds} seconds.`)),
      timeoutSeconds * 1_000,
    );
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function runImportQueue(
  sourceIds: readonly string[],
  options: Readonly<{
    retryCount: number;
    timeoutSeconds: number;
    importSource(sourceId: string): Promise<Readonly<{ counts: Readonly<{
      fetched: number; imported: number; skipped: number; duplicates: number; failed: number;
    }> }>>;
  }>,
): Promise<QueueResult> {
  let imported = 0;
  let skipped = 0;
  let duplicates = 0;
  let failed = 0;
  let retries = 0;
  const failures: { sourceId: string; reason: string }[] = [];

  for (const sourceId of sourceIds) {
    let lastError: unknown;
    let completed = false;
    for (let attempt = 0; attempt <= options.retryCount; attempt += 1) {
      if (attempt > 0) retries += 1;
      try {
        const result = await withTimeout(options.importSource(sourceId), options.timeoutSeconds);
        imported += result.counts.imported;
        skipped += result.counts.skipped;
        duplicates += result.counts.duplicates;
        failed += result.counts.failed;
        completed = true;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!completed) {
      failed += 1;
      failures.push({ sourceId, reason: errorReason(lastError) });
    }
  }
  return { imported, skipped, duplicates, failed, retries, failures };
}

export function calculateImportStatistics(
  runs: readonly Readonly<{ completedAt: string; imported: number }>[],
  now = new Date(),
): Readonly<{ today: number; week: number; month: number }> {
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const weekStart = now.getTime() - 7 * 24 * 60 * 60 * 1_000;
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  return runs.reduce((stats, run) => {
    const completedAt = new Date(run.completedAt).getTime();
    if (completedAt >= dayStart) stats.today += run.imported;
    if (completedAt >= weekStart) stats.week += run.imported;
    if (completedAt >= monthStart) stats.month += run.imported;
    return stats;
  }, { today: 0, week: 0, month: 0 });
}

export async function runClaimedQueue<T>(
  claim: Readonly<{ claimed: boolean; batchId: string; reason: string | null }>,
  run: () => Promise<T>,
): Promise<T | Readonly<{ started: false; batchId: string; reason: string }>> {
  if (!claim.claimed) {
    return { started: false, batchId: claim.batchId, reason: claim.reason ?? "locked" };
  }
  return run();
}
