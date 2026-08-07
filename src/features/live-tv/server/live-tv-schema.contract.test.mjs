import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260806150000_live_tv.sql",
  import.meta.url,
);
const hardeningMigrationUrl = new URL(
  "../../../../supabase/migrations/20260806170000_live_tv_write_privilege_hardening.sql",
  import.meta.url,
);

test("migration creates the single approved localized live_streams table", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create table public\.live_streams/u);
  assert.doesNotMatch(sql, /create table public\.live_tv_(?:channels|schedule)/u);
  for (const column of [
    "language_id uuid not null",
    "provider text not null",
    "provider_stream_id text",
    "stream_url text",
    "status text not null default 'draft'",
    "starts_at timestamptz",
    "ends_at timestamptz",
    "created_by uuid",
    "updated_by uuid",
    "created_at timestamptz not null default now()",
    "updated_at timestamptz not null default now()",
  ]) {
    assert.match(sql, new RegExp(column.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
});

test("migration enforces provider, lifecycle, playback, URL, and schedule constraints", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const constraint of [
    "live_streams_provider_check",
    "live_streams_provider_configuration_check",
    "live_streams_status_check",
    "live_streams_autoplay_muted_check",
    "live_streams_schedule_check",
    "live_streams_scheduled_start_check",
    "live_streams_stream_url_check",
    "live_streams_external_watch_url_check",
    "live_streams_poster_url_check",
    "live_streams_social_image_url_check",
  ]) {
    assert.match(sql, new RegExp(`constraint ${constraint}`, "u"));
  }
  assert.match(sql, /unique \(id, language_id\)/u);
  assert.match(sql, /create unique index live_streams_one_live_per_language_idx/u);
});

test("migration creates lookup and CMS indexes", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const index of [
    "live_streams_one_live_per_language_idx",
    "live_streams_public_schedule_idx",
    "live_streams_language_idx",
    "live_streams_status_idx",
    "live_streams_provider_idx",
    "live_streams_cms_pagination_idx",
    "live_streams_related_category_idx",
    "live_streams_related_story_idx",
  ]) {
    assert.match(sql, new RegExp(`create (?:unique )?index ${index}`, "u"));
  }
});

test("RLS exposes only effective public states and reserves management for editors and admins", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /alter table public\.live_streams enable row level security/u);
  assert.match(sql, /revoke all on table public\.live_streams from anon, authenticated/u);
  assert.match(sql, /grant select on table public\.live_streams to anon/u);
  assert.match(sql, /Public can read visible live streams/u);
  assert.match(sql, /status in \('live', 'scheduled', 'offline'\)/u);
  assert.match(sql, /Editors can read all live streams/u);
  assert.match(sql, /Editors can create live streams/u);
  assert.match(sql, /Editors can update live streams/u);
  assert.match(sql, /Admins can manage live streams/u);
  assert.doesNotMatch(sql, /Writers can manage live streams/u);
});

test("authenticated writes cannot alter immutable Live TV audit columns", async () => {
  const sql = await readFile(hardeningMigrationUrl, "utf8");
  assert.match(sql, /revoke insert, update on table public\.live_streams from authenticated/u);
  assert.match(sql, /grant insert \([^)]*created_by,[^)]*updated_by[^)]*\) on table public\.live_streams to authenticated/u);
  assert.match(sql, /grant update \([^)]*updated_by[^)]*\) on table public\.live_streams to authenticated/u);
  assert.doesNotMatch(sql, /grant update \([^)]*created_by[^)]*\) on table public\.live_streams to authenticated/u);
});
