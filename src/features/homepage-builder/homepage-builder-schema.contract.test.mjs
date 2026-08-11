import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = new URL("../../../supabase/migrations/20260811090000_homepage_builder.sql", import.meta.url);

test("migration creates localized homepage configurations and ordered sections", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /create table public\.homepage_configurations/u);
  assert.match(sql, /unique\s*\(language_id\)/u);
  assert.match(sql, /create table public\.homepage_sections/u);
  for (const column of ["homepage_configuration_id", "block_id", "block_type", "renderer", "position", "container", "width", "enabled", "starts_at", "ends_at", "configuration", "created_by", "updated_by"]) assert.match(sql, new RegExp(`\\b${column}\\b`, "u"));
  assert.match(sql, /unique\s*\(homepage_configuration_id,\s*position\)/u);
  assert.match(sql, /jsonb_typeof\(configuration\) = 'object'/u);
});

test("migration provides atomic movement, compact deletion, triggers, and role policies", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /create or replace function public\.move_homepage_section/u);
  assert.match(sql, /sentinel_position/u);
  assert.match(sql, /create or replace function public\.delete_homepage_section/u);
  assert.match(sql, /position = position - 1/u);
  assert.match(sql, /set_homepage_configurations_updated_at/u);
  assert.match(sql, /set_homepage_sections_updated_at/u);
  assert.match(sql, /alter table public\.homepage_sections enable row level security/u);
  assert.match(sql, /in \('editor', 'admin'\)/u);
  assert.match(sql, /grant execute on function public\.move_homepage_section/u);
});
