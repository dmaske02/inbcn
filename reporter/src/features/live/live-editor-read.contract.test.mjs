import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../../../../supabase/migrations/20260822161000_reporter_live_editor_read.sql", import.meta.url);

test("active signed editors receive select-only live-request access", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /create policy "Active editors can read live requests"/u);
  assert.match(migration, /for select to authenticated/u);
  assert.match(migration, /'editor'/u);
  assert.doesNotMatch(migration, /for (insert|update|delete)/iu);
  assert.doesNotMatch(migration, /grant execute/u);
});
