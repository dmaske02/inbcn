import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260822151000_reporter_draft_persistence.sql",
  import.meta.url,
);

async function sourceOrEmpty(url) {
  try {
    return await readFile(url, "utf8");
  } catch {
    return "";
  }
}

const sql = await sourceOrEmpty(migrationUrl);
const compact = sql.replace(/\s+/gu, " ").trim();

function sqlFunction(name) {
  const match = sql.match(new RegExp(`create or replace function public\\.${name}\\b[\\s\\S]*?\\$\\$;`, "u"));
  assert.ok(match, `missing ${name} function`);
  return match[0].replace(/\s+/gu, " ").trim();
}

test("draft persistence stores canonical reporter event time and exposes one authenticated RPC", () => {
  assert.match(compact, /alter table public\.stories add column event_occurred_at timestamptz/u);
  assert.match(compact, /create or replace function public\.save_reporter_story_draft\(/u);
  assert.match(compact, /security definer set search_path = ''/u);
  assert.match(compact, /actor_id uuid := auth\.uid\(\)/u);
  assert.match(compact, /actor_role is distinct from 'reporter'/u);
  assert.match(compact, /access_sync_status is distinct from 'succeeded'/u);
  assert.match(compact, /reporter_access_generation.*access_sync_generation/u);
  assert.match(compact, /public_status not in \('active', 'grace'\)/u);
  assert.match(compact, /event_occurred_at.*interval '5 minutes'/u);
  assert.match(compact, /grant execute on function public\.save_reporter_story_draft/u);
  assert.doesNotMatch(compact, /grant execute on function public\.save_reporter_story_draft[^;]*to anon/u);
});

test("draft persistence locks owned completed media and replaces only canonical associations", () => {
  assert.match(compact, /count\(distinct media_id\)/u);
  assert.match(compact, /cardinality\(p_media_ids\)/u);
  assert.match(compact, /from public\.media.*media\.id = any \(p_media_ids\).*order by media\.id.*for update/u);
  assert.match(compact, /media\.created_by is distinct from actor_id/u);
  assert.match(compact, /media\.deleted_at is not null/u);
  assert.match(compact, /media\.secure_url !~ '\^https:\/\/'/u);
  assert.match(compact, /length\(btrim\(media\.cloudinary_public_id\)\) = 0/u);
  assert.match(compact, /update public\.media set story_id = null/u);
  assert.match(compact, /set story_id = saved_story_id, sort_order = array_position\(p_media_ids, media\.id\)/u);
  assert.doesNotMatch(compact, /grant (?:update|insert|delete).*public\.media.*authenticated/u);
});

test("draft persistence denies legacy citizen reports and non-draft reporter content", () => {
  assert.match(compact, /not public\.is_reporter_story\(current_story\)/u);
  assert.match(compact, /current_story\.created_by is distinct from actor_id/u);
  assert.match(compact, /current_story\.status is distinct from 'draft'/u);
  assert.match(compact, /story_type.*'citizen_report'/u);
  assert.match(compact, /source_id.*null/u);
  assert.doesNotMatch(compact, /insert into public\.story_revisions|insert into public\.story_locations/u);
});

test("submission wrappers source event evidence from the locked canonical story", () => {
  assert.match(compact, /alter function public\.submit_reporter_story\( uuid, timestamptz, numeric, numeric, numeric, timestamptz, text \) rename to submit_reporter_story_with_event_legacy/u);
  assert.match(compact, /alter function public\.direct_publish_reporter_story\( uuid, timestamptz, numeric, numeric, numeric, timestamptz, text \) rename to direct_publish_reporter_story_with_event_legacy/u);
  assert.match(compact, /select stories\.event_occurred_at into canonical_event_time.*for update/u);
  assert.match(compact, /public\.submit_reporter_story_with_event_legacy\( p_story_id, canonical_event_time/u);
  assert.match(compact, /public\.direct_publish_reporter_story_with_event_legacy\( p_story_id, canonical_event_time/u);
  assert.match(compact, /revoke all on function public\.submit_reporter_story_with_event_legacy/u);
  assert.match(compact, /revoke all on function public\.direct_publish_reporter_story_with_event_legacy/u);
});

test("submission wrappers preserve reporter-profile-story lock order", () => {
  for (const name of ["submit_reporter_story", "direct_publish_reporter_story"]) {
    const wrapper = sqlFunction(name);
    assert.match(wrapper, /from public\.reporter_profiles.*for update.*from public\.profiles.*for update.*from public\.stories.*for update/u);
  }
});

test("non-draft reporter event evidence is immutable and matches the latest revision", () => {
  assert.match(compact, /create or replace function public\.guard_reporter_story_event_evidence/u);
  assert.match(compact, /new\.event_occurred_at is distinct from old\.event_occurred_at/u);
  assert.match(compact, /order by revision_number desc limit 1 for update/u);
  assert.match(compact, /current_revision\.snapshot ->> 'event_occurred_at'/u);
  assert.match(compact, /REPORTER_STORY_EVENT_EVIDENCE_MISMATCH/u);
});
