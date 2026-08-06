import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260804094500_fix_ingest_run_timestamp_semantics.sql",
  import.meta.url,
);

test("ingest run timestamps allow processing to start before the audit row is created", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(
    migration,
    /drop constraint if exists ingest_runs_timestamp_order_check/iu,
  );
  assert.match(
    migration,
    /completed_at is null[\s\S]*completed_at >= started_at/iu,
  );
  assert.doesNotMatch(migration, /started_at\s*>=\s*created_at/iu);
  assert.doesNotMatch(migration, /created_at\s*<=\s*started_at/iu);
});
