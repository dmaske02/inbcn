import assert from "node:assert/strict";
import test from "node:test";

import {
  buildImportQueue,
  calculateImportStatistics,
  getNextScheduledAt,
  runImportQueue,
  runClaimedQueue,
} from "./scheduler.model.ts";

test("queue contains only ready active sources in priority order", () => {
  const queue = buildImportQueue([
    { id: "inactive", isActive: false, ingestionPriority: 1, defaultLanguageId: "en", defaultCategoryId: "news", sourceType: "rss", feedUrl: "https://example.com/a.xml" },
    { id: "later", isActive: true, ingestionPriority: 20, defaultLanguageId: "en", defaultCategoryId: "news", sourceType: "newsdata_api", feedUrl: null },
    { id: "rss", isActive: true, ingestionPriority: 10, defaultLanguageId: "en", defaultCategoryId: "news", sourceType: "rss", feedUrl: "https://example.com/feed.xml" },
    { id: "broken", isActive: true, ingestionPriority: 2, defaultLanguageId: null, defaultCategoryId: "news", sourceType: "newsdata_api", feedUrl: null },
  ]);
  assert.deepEqual(queue.map((source) => source.id), ["rss", "later"]);
});

test("worker retries a transient source failure and records eventual success", async () => {
  let attempts = 0;
  const result = await runImportQueue(["source-1"], {
    retryCount: 2,
    timeoutSeconds: 10,
    importSource: async () => {
      attempts += 1;
      if (attempts < 3) throw new Error("temporary upstream failure");
      return { counts: { fetched: 2, imported: 1, skipped: 0, duplicates: 1, failed: 0 } };
    },
  });
  assert.equal(attempts, 3);
  assert.deepEqual(result, {
    imported: 1,
    skipped: 0,
    duplicates: 1,
    failed: 0,
    retries: 2,
    failures: [],
  });
});

test("worker stops after configured retries and records the source failure", async () => {
  let attempts = 0;
  const result = await runImportQueue(["source-1"], {
    retryCount: 1,
    timeoutSeconds: 10,
    importSource: async () => {
      attempts += 1;
      throw new Error("feed unavailable");
    },
  });
  assert.equal(attempts, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.retries, 1);
  assert.deepEqual(result.failures, [{ sourceId: "source-1", reason: "feed unavailable" }]);
});

test("worker times out a stalled source and continues the queue", async () => {
  const visited = [];
  const result = await runImportQueue(["stalled", "healthy"], {
    retryCount: 0,
    timeoutSeconds: 0.01,
    importSource: async (sourceId) => {
      visited.push(sourceId);
      if (sourceId === "stalled") await new Promise(() => {});
      return { counts: { fetched: 1, imported: 1, skipped: 0, duplicates: 0, failed: 0 } };
    },
  });
  assert.deepEqual(visited, ["stalled", "healthy"]);
  assert.equal(result.imported, 1);
  assert.equal(result.failed, 1);
  assert.match(result.failures[0].reason, /timed out/i);
});

test("statistics use calendar boundaries and sum imported drafts", () => {
  const stats = calculateImportStatistics([
    { completedAt: "2026-08-03T08:00:00.000Z", imported: 2 },
    { completedAt: "2026-08-02T08:00:00.000Z", imported: 3 },
    { completedAt: "2026-07-31T08:00:00.000Z", imported: 5 },
    { completedAt: "2026-07-01T08:00:00.000Z", imported: 7 },
  ], new Date("2026-08-03T12:00:00.000Z"));
  assert.deepEqual(stats, { today: 2, week: 10, month: 5 });
});

test("next run is derived from the last run and configured interval", () => {
  assert.equal(
    getNextScheduledAt("2026-08-03T10:00:00.000Z", 30).toISOString(),
    "2026-08-03T10:30:00.000Z",
  );
});

test("a rejected database claim skips the queue without importing", async () => {
  let imports = 0;
  const result = await runClaimedQueue(
    { claimed: false, batchId: "skipped-batch", reason: "locked" },
    async () => { imports += 1; return { imported: 1 }; },
  );
  assert.equal(imports, 0);
  assert.deepEqual(result, { started: false, batchId: "skipped-batch", reason: "locked" });
});
