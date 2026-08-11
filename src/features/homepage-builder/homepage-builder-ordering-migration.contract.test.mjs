import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = new URL(
  "../../../supabase/migrations/20260811150000_homepage_builder_move_to.sql",
  import.meta.url,
);

test("move-to migration defines one authorized, configuration-scoped atomic RPC", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /create or replace function public\.move_homepage_section_to\s*\(section_id uuid, target_position integer\)/u);
  assert.match(sql, /security invoker/u);
  assert.match(sql, /coalesce\(\(select auth\.jwt\(\) -> 'app_metadata' ->> 'role'\), ''\) not in/u);
  assert.match(sql, /in \('editor', 'admin'\)/u);
  assert.match(sql, /homepage_configuration_id = current_row\.homepage_configuration_id/u);
  assert.match(sql, /for update/u);
  assert.match(sql, /target_position < 0 or target_position >= section_count/u);
  assert.match(sql, /Section positions must be unique and contiguous/u);
  assert.match(sql, /sentinel_position/u);
  assert.match(sql, /while shifted_position/u);
  assert.match(sql, /current_row\.position < target_position[\s\S]*position = shifted_position - 1/u);
  assert.match(sql, /else[\s\S]*position = shifted_position \+ 1/u);
  assert.match(sql, /updated_by = \(select auth\.uid\(\)\)/u);
  assert.match(sql, /revoke all on function public\.move_homepage_section_to\(uuid, integer\) from public, anon/u);
  assert.match(sql, /grant execute on function public\.move_homepage_section_to\(uuid, integer\) to authenticated, service_role/u);
});

test("move-to migration is additive and leaves Homepage Builder tables intact", async () => {
  const sql = await readFile(migration, "utf8");
  assert.doesNotMatch(sql, /drop\s+(?:table|column)/iu);
  assert.doesNotMatch(sql, /alter\s+table/iu);
  assert.doesNotMatch(sql, /create\s+table/iu);
});
