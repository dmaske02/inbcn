import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const migrationUrl = new URL(
  "../../../../supabase/migrations/20260822162000_reporter_live_session_reservation.sql",
  import.meta.url,
);
const typesUrl = new URL("../../../../packages/database/src/database.types.ts", import.meta.url);
const routeUrl = new URL("../../app/api/live/[requestId]/session/route.ts", import.meta.url);

async function sourceOrEmpty(url) {
  try { return await readFile(url, "utf8"); } catch { return ""; }
}

function sqlFunction(sql, name) {
  const match = sql.match(new RegExp(`create function public\\.${name}\\b[\\s\\S]*?\\$\\$;`, "u"));
  assert.ok(match, `missing ${name}`);
  return match[0].replace(/\s+/gu, " ");
}

test("reservation migration provides a service-role-only five-minute CAS protocol", async () => {
  const sql = await sourceOrEmpty(migrationUrl);
  const compact = sql.replace(/\s+/gu, " ");
  assert.match(compact, /add column recording_claim_token uuid.*add column recording_claimed_at timestamptz.*add column recording_attempt_count integer/u);
  assert.match(compact, /create unique index live_recordings_one_active_per_request.*where recording_status in \('pending', 'recording'\)/u);
  for (const name of [
    "reserve_reporter_live_recording",
    "complete_reporter_live_recording_start",
    "fail_reporter_live_recording_start",
  ]) {
    const fn = sqlFunction(sql, name);
    assert.match(fn, /security definer set search_path = ''/u);
    assert.match(compact, new RegExp(`revoke all on function public\\.${name}[^;]* from public, anon, authenticated, service_role`, "u"));
    assert.match(compact, new RegExp(`grant execute on function public\\.${name}[^;]* to service_role`, "u"));
  }
  const reserve = sqlFunction(sql, "reserve_reporter_live_recording");
  assert.match(reserve, /from public\.reporter_profiles.*for update.*from public\.profiles.*for update.*from public\.reporter_live_requests.*for update.*from public\.live_recordings.*for update/u);
  assert.match(reserve, /request_owner is distinct from p_profile_id/u);
  assert.match(reserve, /current_request\.profile_id is distinct from request_owner/u);
  assert.match(reserve, /current_profile\.role is distinct from 'reporter' or not current_profile\.is_active/u);
  assert.match(reserve, /public_status is distinct from 'active'/u);
  assert.match(reserve, /access_sync_generation is distinct from p_access_generation/u);
  assert.match(reserve, /membership_expires_at < reservation_time/u);
  assert.match(reserve, /not current_reporter\.can_broadcast_live/u);
  assert.match(reserve, /current_request\.status is distinct from 'approved'/u);
  assert.match(reserve, /reservation_time < current_request\.approved_starts_at.*reservation_time > current_request\.approved_ends_at/u);
  assert.match(reserve, /livekit_room_name is distinct from 'reporter-live-' \|\| replace/u);
  assert.match(reserve, /recording_claimed_at >= reservation_time - interval '5 minutes'/u);
  assert.match(reserve, /jsonb_build_object\('state', 'busy'\)/u);
  assert.doesNotMatch(reserve.match(/jsonb_build_object\('state', 'busy'\)[^;]*/u)?.[0] ?? "", /claim/u);
  const failed = sqlFunction(sql, "fail_reporter_live_recording_start");
  assert.match(failed, /where id = p_recording_id and recording_status = 'pending' and recording_claim_token = p_claim_token/u);
  assert.match(failed, /'live_recording\.start_failed'/u);
  assert.match(failed, /where role = 'admin' and is_active/u);
  assert.doesNotMatch(failed, /jsonb_build_object\([^)]*(?:egress|storage|provider_error)/u);
});

test("manual types expose reservation columns and RPCs", async () => {
  const types = await readFile(typesUrl, "utf8");
  for (const field of ["recording_claim_token", "recording_claimed_at", "recording_attempt_count"]) {
    assert.match(types, new RegExp(`\\b${field}:`, "u"));
  }
  for (const fn of ["reserve_reporter_live_recording", "complete_reporter_live_recording_start", "fail_reporter_live_recording_start"]) {
    assert.match(types, new RegExp(`\\b${fn}:`, "u"));
  }
});

test("session route is POST-only, awaits params, authorizes, validates UUID, and maps safe errors", async () => {
  const route = await sourceOrEmpty(routeUrl);
  assert.match(route, /export const dynamic = "force-dynamic"/u);
  assert.match(route, /export const POST/u);
  assert.doesNotMatch(route, /export (?:async )?function GET|export const GET/u);
  assert.match(route, /await context\.params/u);
  assert.match(route, /authorizeCurrentReporter/u);
  assert.match(route, /z\.uuid/u);
  assert.match(route, /Cache-Control.*no-store/u);
  assert.doesNotMatch(route, /error\.message|String\(error\)/u);
});

test("private storage configuration is all-or-none and never public", async () => {
  const envSource = await readFile(new URL("../../config/env.ts", import.meta.url), "utf8");
  for (const name of ["LIVEKIT_S3_ACCESS_KEY", "LIVEKIT_S3_SECRET", "LIVEKIT_S3_BUCKET"]) {
    assert.match(envSource, new RegExp(name, "u"));
    assert.doesNotMatch(envSource, new RegExp(`NEXT_PUBLIC_${name}`, "u"));
  }
  await assert.rejects(execFileAsync(process.execPath, [
    "--conditions=react-server",
    "--experimental-strip-types",
    "--input-type=module",
    "-e",
    'await import("./src/config/env.ts")',
  ], {
    cwd: new URL("../../..", import.meta.url),
    env: { ...process.env, LIVEKIT_S3_BUCKET: "partial-private-bucket" },
  }), (error) => {
    assert.match(`${error.stdout ?? ""}${error.stderr ?? ""}`, /LIVEKIT_S3_ACCESS_KEY is required/u);
    return true;
  });
});
