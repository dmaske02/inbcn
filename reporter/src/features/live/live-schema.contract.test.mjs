import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260822160000_reporter_live_recording.sql",
  import.meta.url,
);
const databaseTypesUrl = new URL(
  "../../../../packages/database/src/database.types.ts",
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
const databaseTypes = await readFile(databaseTypesUrl, "utf8");
const compact = sql.replace(/\s+/gu, " ").trim();

function sqlFunction(name) {
  const match = sql.match(
    new RegExp(`create function public\\.${name}\\b[\\s\\S]*?\\$\\$;`, "u"),
  );
  assert.ok(match, `missing ${name} function`);
  return match[0].replace(/\s+/gu, " ").trim();
}

test("live schema requires approval and keeps recordings private", () => {
  assert.match(sql, /create table public\.reporter_live_requests/u);
  assert.match(sql, /create table public\.live_recordings/u);
  assert.match(sql, /create function public\.approve_reporter_live_request/u);
  assert.doesNotMatch(sql, /grant select on public\.live_recordings to anon/u);
  assert.match(sql, /retention_delete_at/u);
  assert.match(sql, /legal_hold/u);
});

test("reporter creation is generation-fenced and immutable after insertion", () => {
  assert.match(compact, /alter table public\.reporter_live_requests enable row level security/u);
  assert.match(compact, /Eligible reporters can create their own pending live requests/u);
  assert.match(compact, /status = 'pending'.*decided_by is null.*livekit_room_name is null/u);
  assert.match(compact, /reporter_access_generation.*access_sync_generation/u);
  assert.match(compact, /public_status = 'active'.*membership_expires_at >= clock_timestamp\(\).*can_broadcast_live/u);
  assert.doesNotMatch(compact, /grant update[^;]*reporter_live_requests[^;]*to authenticated/u);
  assert.doesNotMatch(compact, /grant delete[^;]*reporter_live_requests[^;]*to authenticated/u);
});

test("admin commands lock, recheck eligibility, and expose no public RPC", () => {
  for (const name of [
    "approve_reporter_live_request",
    "reject_reporter_live_request",
    "terminate_reporter_live_request",
    "set_live_recording_legal_hold",
  ]) {
    const command = sqlFunction(name);
    assert.match(command, /security definer set search_path = ''/u);
    assert.match(command, /actor_role is distinct from 'admin'/u);
    assert.match(command, /profiles\.role = 'admin' and profiles\.is_active/u);
    assert.match(command, /for update/u);
  }
  const approval = sqlFunction("approve_reporter_live_request");
  assert.match(approval, /public_status is distinct from 'active'/u);
  assert.match(approval, /membership_expires_at < decision_time/u);
  assert.match(approval, /can_broadcast_live/u);
  assert.match(approval, /access_sync_status is distinct from 'succeeded'/u);
  assert.match(approval, /make_interval\(mins => current_request\.expected_duration_minutes\)/u);
  assert.match(approval, /livekit_room_name = 'reporter-live-' \|\| replace\(current_request\.id::text, '-', ''\)/u);
  assert.doesNotMatch(compact, /grant execute on function public\.(?:approve|reject|terminate)_reporter_live_request[^;]*to anon/u);
});

test("recording retention is DB-owned and provider fields stay private", () => {
  assert.match(compact, /create unique index live_recordings_egress_id_key.*where egress_id is not null/u);
  assert.match(compact, /create function public\.set_live_recording_lifecycle_clocks/u);
  assert.match(compact, /transition_time \+ interval '90 days'/u);
  assert.match(compact, /new\.replay_status = 'published'.*new\.retention_delete_at := null/u);
  assert.match(compact, /where retention_delete_at is not null and not legal_hold/u);
  assert.match(compact, /revoke all on table public\.reporter_live_requests, public\.live_recordings from public, anon, authenticated, service_role/u);
  assert.match(compact, /grant select on table public\.live_recordings to authenticated/u);
  assert.doesNotMatch(compact, /grant select on table public\.live_recordings to anon/u);
  assert.doesNotMatch(compact, /grant (?:insert|update)[^;]*legal_hold[^;]*to service_role/u);
  assert.doesNotMatch(compact, /jsonb_build_object\([^;]*(?:storage_key|egress_id|provider_error|supporting_notes|private_metadata)/u);
});

test("handwritten database types retain the private table and command contracts", () => {
  for (const field of [
    "live_request_id",
    "egress_id",
    "retention_delete_at",
    "legal_hold",
    "intended_locality",
    "livekit_room_name",
  ]) {
    assert.match(databaseTypes, new RegExp(`\\b${field}:`, "u"));
  }
  for (const command of [
    "approve_reporter_live_request",
    "reject_reporter_live_request",
    "terminate_reporter_live_request",
    "set_live_recording_legal_hold",
  ]) {
    assert.match(databaseTypes, new RegExp(`\\b${command}:`, "u"));
  }
});
