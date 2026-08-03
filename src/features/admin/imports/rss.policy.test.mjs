import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260802030000_rss_editor_import_policy.sql",
  import.meta.url,
);

test("RSS editor import policy is additive and draft-only", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /create policy "Editors can import RSS article drafts"/u);
  assert.match(sql, /for insert\s+to authenticated\s+with check/iu);
  assert.match(sql, /app_metadata'\s*->>\s*'role'\)\s*=\s*'editor'/iu);
  assert.match(sql, /created_by\s*=\s*\(select auth\.uid\(\)\)/iu);
  assert.match(sql, /story_type\s*=\s*'external_article'/iu);
  assert.match(sql, /status\s*=\s*'draft'/iu);
  assert.match(sql, /source_type\s*=\s*'rss'/iu);
  assert.match(sql, /ingestion_source\.is_active/iu);
  assert.match(sql, /published_at is null/iu);
  assert.match(sql, /approved_at is null/iu);
  assert.match(sql, /not is_featured/iu);
  assert.doesNotMatch(sql, /\b(drop|alter|delete|update)\b/iu);
  assert.doesNotMatch(sql, /\bwriter\b/iu);
});
