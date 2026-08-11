import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = new URL(
  "../../../supabase/migrations/20260811160000_homepage_builder_structural_mutations.sql",
  import.meta.url,
);

test("structural migration duplicates immediately after a current source in one locked operation", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /create or replace function public\.duplicate_homepage_section_after/u);
  assert.match(sql, /security invoker/u);
  assert.match(sql, /coalesce\(\(select auth\.jwt\(\) -> 'app_metadata' ->> 'role'\), ''\) not in/u);
  assert.match(sql, /expected_updated_at/u);
  assert.match(sql, /expected_order/u);
  assert.match(sql, /for update/u);
  assert.match(sql, /while shifted_position > current_row\.position/u);
  assert.match(sql, /position = shifted_position \+ 1/u);
  for (const field of ["configuration", "enabled", "starts_at", "ends_at", "container", "width", "renderer", "block_type"]) {
    assert.match(sql, new RegExp(`\\b${field}\\b`, "u"));
  }
  assert.match(sql, /returning id into new_section_id/u);
});

test("structural migration deletes conditionally and compacts positions one row at a time", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /create or replace function public\.delete_homepage_section_if_current/u);
  assert.match(sql, /expected_updated_at/u);
  assert.match(sql, /expected_order/u);
  assert.match(sql, /delete from public\.homepage_sections where id = current_row\.id/u);
  assert.match(sql, /while shifted_position < section_count/u);
  assert.match(sql, /position = shifted_position - 1/u);
  assert.match(sql, /returns boolean/u);
  assert.doesNotMatch(sql, /drop\s+(?:table|column)/iu);
});
