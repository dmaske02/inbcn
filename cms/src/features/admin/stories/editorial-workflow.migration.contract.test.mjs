import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../../../../supabase/migrations/20260814090000_editorial_workflow_hardening.sql",
  import.meta.url,
);
const verificationUrl = new URL(
  "../../../../../supabase/verification/editorial-workflow-verification.sql",
  import.meta.url,
);

test("migration defines the canonical database-time public eligibility invariant", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create (?:or replace )?function public\.is_story_public/u);
  assert.match(sql, /status = 'published'/u);
  assert.match(sql, /published_at is not null/u);
  assert.match(sql, /published_at <= (?:statement_timestamp\(\)|now\(\)|current_timestamp)/u);
  assert.match(sql, /set search_path = ''/u);
});

test("migration creates an append-only protected story event ledger", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create table public\.story_events/u);
  assert.match(sql, /create index story_events_story_id_created_at_idx[\s\S]*story_id, created_at desc/u);
  assert.match(sql, /alter table public\.story_events enable row level security/u);
  assert.match(sql, /revoke all on table public\.story_events from anon, authenticated/u);
  assert.doesNotMatch(sql, /grant insert on table public\.story_events to authenticated/u);
});

test("migration defines a locked authenticated transition RPC with minimum grants", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create (?:or replace )?function public\.transition_story/u);
  assert.match(sql, /for update/u);
  assert.match(sql, /auth\.uid\(\)/u);
  assert.match(sql, /p_expected_updated_at/u);
  assert.match(sql, /security definer/u);
  assert.match(sql, /revoke all on function public\.transition_story/u);
  assert.match(sql, /grant execute on function public\.transition_story[\s\S]*to authenticated/u);
  assert.doesNotMatch(sql, /publish_due_stories/u);
});

test("transition RPC enforces bounded safe rejection reasons", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /char_length\(v_reason\)\s*>\s*1000/u);
  assert.match(sql, /\[\[:cntrl:\]\]/u);
});

test("database verification exercises transitions, conflicts, events, and anonymous visibility", async () => {
  const sql = await readFile(verificationUrl, "utf8");
  assert.ok((sql.match(/public\.transition_story\(/gu) ?? []).length >= 15);
  assert.match(sql, /set local role anon/u);
  assert.match(sql, /INVALID_TRANSITION/u);
  assert.match(sql, /CONFLICT/u);
  assert.match(sql, /count\(\*\)[\s\S]*public\.story_events/u);
  assert.match(sql, /rollback;/u);
});
