import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = "supabase/migrations/20260812100000_media_retirement.sql";

test("retirement migration uses existing lifecycle columns without heterogeneous usage storage", async () => {
  const sql = await readFile(migration, "utf8");
  assert.doesNotMatch(sql, /create table|alter table public\.media add column|media_usages|cleanup|retention/iu);
  assert.match(sql, /deleted_at/u);
  assert.match(sql, /deleted_by/u);
});

test("Story assignment locks and validates canonical active image media", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /create or replace function public\.assert_story_featured_media_active\(\)/u);
  assert.match(sql, /before insert or update of featured_media_id on public\.stories/u);
  assert.match(sql, /for key share/u);
  assert.match(sql, /new\.featured_media_id is null/u);
  assert.match(sql, /deleted_at is not null/u);
  assert.match(sql, /media_type <> 'image'/u);
});

test("retire and restore RPCs are guarded, locked, stale-safe, and Story-authoritative", async () => {
  const sql = await readFile(migration, "utf8");
  for (const name of ["retire_media_asset", "restore_media_asset"]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${name}\\(media_id uuid, expected_updated_at timestamptz\\)`, "u"));
  }
  assert.match(sql, /security definer/u);
  assert.match(sql, /set search_path = public/u);
  assert.match(sql, /auth\.uid\(\)/u);
  assert.match(sql, /auth\.jwt\(\) -> 'app_metadata' ->> 'role'/u);
  assert.match(sql, /for update/u);
  assert.match(sql, /current_media\.updated_at <> expected_updated_at/u);
  assert.match(sql, /from public\.stories[\s\S]*featured_media_id = media_id/u);
  assert.match(sql, /set deleted_at = lifecycle_time,[\s\S]*deleted_by = actor_id/u);
  assert.match(sql, /set deleted_at = null,[\s\S]*deleted_by = null/u);
});

test("authenticated clients cannot hard-delete or directly mutate lifecycle columns", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /revoke delete on table public\.media from authenticated/u);
  assert.match(sql, /revoke update on table public\.media from authenticated/u);
  assert.match(sql, /grant update \([\s\S]*updated_at[\s\S]*\) on public\.media to authenticated/u);
  assert.doesNotMatch(sql.match(/grant update \([\s\S]*?\) on public\.media to authenticated/u)?.[0] ?? "", /deleted_at|deleted_by/u);
  assert.match(sql, /revoke all on function public\.retire_media_asset/u);
  assert.match(sql, /grant execute on function public\.retire_media_asset/u);
});

test("disposable verification covers roles, lifecycle, stale writes, and both lock orders", async () => {
  const sql = await readFile("supabase/verification/media-retirement-verification.sql", "utf8");
  for (const scenario of [
    "writer denied", "editor succeeds", "admin succeeds", "referenced media denied",
    "unused media retired", "retired media cannot be assigned", "restore",
    "stale expected_updated_at", "simultaneous retirement", "assignment wins",
    "retirement wins", "direct lifecycle update denied", "direct delete denied",
  ]) assert.match(sql, new RegExp(scenario, "iu"));
  assert.match(sql, /SESSION A/iu);
  assert.match(sql, /SESSION B/iu);
  assert.match(sql, /rollback/iu);
});
