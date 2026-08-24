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
const handlerUrl = new URL("../../app/api/live/[requestId]/session/handler.ts", import.meta.url);

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
    "authorize_reporter_live_session",
  ]) {
    const fn = sqlFunction(sql, name);
    assert.match(fn, /security definer set search_path = ''/u);
    assert.match(compact, new RegExp(`revoke all on function public\\.${name}[^;]* from public, anon, authenticated, service_role`, "u"));
    assert.match(compact, new RegExp(`grant execute on function public\\.${name}[^;]* to service_role`, "u"));
  }
  const reserve = sqlFunction(sql, "reserve_reporter_live_recording");
  assert.match(reserve, /from public\.reporter_live_requests.*for update.*from public\.reporter_profiles.*for update.*from public\.profiles.*for update.*from public\.live_recordings.*for update/u);
  assert.match(reserve, /request_owner is distinct from p_profile_id/u);
  assert.match(reserve, /current_request\.profile_id is distinct from request_owner/u);
  assert.match(reserve, /current_profile\.role is distinct from 'reporter' or not current_profile\.is_active/u);
  assert.match(reserve, /public_status is distinct from 'active'/u);
  assert.match(reserve, /access_sync_generation is distinct from p_access_generation/u);
  assert.match(reserve, /membership_expires_at < reservation_time/u);
  assert.match(reserve, /not current_reporter\.can_broadcast_live/u);
  assert.match(reserve, /current_request\.status is distinct from 'approved'/u);
  assert.match(reserve, /reservation_time < current_request\.approved_starts_at.*reservation_time >= current_request\.approved_ends_at/u);
  assert.match(reserve, /livekit_room_name is distinct from 'reporter-live-' \|\| replace/u);
  assert.match(reserve, /recording_claimed_at >= reservation_time - interval '5 minutes'/u);
  assert.match(reserve, /jsonb_build_object\('state', 'busy'\)/u);
  assert.doesNotMatch(reserve.match(/jsonb_build_object\('state', 'busy'\)[^;]*/u)?.[0] ?? "", /claim/u);
  const failed = sqlFunction(sql, "fail_reporter_live_recording_start");
  assert.match(failed, /where id = p_recording_id and recording_status = 'pending' and recording_claim_token = p_claim_token/u);
  assert.match(failed, /'live_recording\.start_failed'/u);
  assert.match(failed, /where role = 'admin' and is_active/u);
  assert.doesNotMatch(failed, /jsonb_build_object\([^)]*(?:egress|storage|provider_error)/u);
  const authorize = sqlFunction(sql, "authorize_reporter_live_session");
  assert.match(authorize, /from public\.reporter_live_requests.*for update.*from public\.reporter_profiles.*for update.*from public\.profiles.*for update.*from public\.live_recordings.*for update/u);
  assert.match(authorize, /current_recording\.live_request_id is distinct from current_request\.id/u);
  assert.match(authorize, /current_recording\.recording_status not in \('recording', 'failed'\)/u);
  assert.match(authorize, /authorization_time >= current_request\.approved_ends_at/u);
  assert.match(authorize, /current_request\.status is distinct from 'approved'/u);
  assert.match(authorize, /current_reporter\.public_status is distinct from 'active'/u);
  assert.match(authorize, /current_reporter\.membership_expires_at < authorization_time/u);
  assert.match(authorize, /not current_reporter\.can_broadcast_live/u);
  assert.match(authorize, /current_reporter\.access_sync_generation is distinct from p_access_generation/u);
  assert.match(authorize, /'request_id', current_request\.id/u);
  const complete = sqlFunction(sql, "complete_reporter_live_recording_start");
  assert.match(complete, /\(egress_id is null or egress_id = p_egress_id\)/u);
});

test("review migration adds terminal Egress reconciliation with canonical lock order and fixed operator alerts", async () => {
  const reviewSql = await readFile(new URL(
    "../../../../supabase/migrations/20260822163000_livekit_recording_review.sql",
    import.meta.url,
  ), "utf8");
  const compact = reviewSql.replace(/\s+/gu, " ").toLowerCase();
  const reconcile = sqlFunction(reviewSql.toLowerCase(), "report_reporter_live_recording_reconciliation");
  const parentLookup = reconcile.indexOf("select live_request_id into target_request_id");
  const requestLock = reconcile.indexOf("from public.reporter_live_requests", parentLookup);
  const recordingLock = reconcile.indexOf("from public.live_recordings", requestLock);
  assert.ok(parentLookup >= 0 && requestLock > parentLookup && recordingLock > requestLock);
  assert.doesNotMatch(reconcile.slice(parentLookup, requestLock), /for update/u);
  assert.match(reconcile.slice(requestLock, recordingLock), /for update/u);
  assert.match(reconcile.slice(recordingLock), /for update/u);
  assert.match(reconcile, /recording_status = 'pending'.*recording_claim_token = p_claim_token/u);
  assert.match(reconcile, /egress_id is not null and current_recording\.egress_id is distinct from p_egress_id/u);
  assert.match(reconcile, /'live_recording\.reconciliation_required'/u);
  assert.match(reconcile, /'a reporter live recording requires provider reconciliation[.]'/u);
  assert.doesNotMatch(reconcile, /jsonb_build_object\([^)]*(?:egress|storage|provider_error|room)/u);
  assert.match(compact, /revoke all on function public\.report_reporter_live_recording_reconciliation\(uuid, uuid, text, text\) from public, anon, authenticated, service_role/u);
  assert.match(compact, /grant execute on function public\.report_reporter_live_recording_reconciliation\(uuid, uuid, text, text\) to service_role/u);
});

test("manual types expose reservation columns and RPCs", async () => {
  const types = await readFile(typesUrl, "utf8");
  for (const field of ["recording_claim_token", "recording_claimed_at", "recording_attempt_count"]) {
    assert.match(types, new RegExp(`\\b${field}:`, "u"));
  }
  for (const fn of ["reserve_reporter_live_recording", "complete_reporter_live_recording_start", "fail_reporter_live_recording_start", "authorize_reporter_live_session", "report_reporter_live_recording_reconciliation"]) {
    assert.match(types, new RegExp(`\\b${fn}:`, "u"));
  }
});

test("session route safely contains authorization and params exceptions and canonicalizes UUIDs", async () => {
  const { createSessionHandler } = await import("../../app/api/live/[requestId]/session/handler.ts");
  const { LiveSessionError } = await import("./live-session.service.ts");
  for (const scenario of [
    {
      handler: () => createSessionHandler({
      authorize: async () => { throw new Error("raw-auth-secret"); },
      requestSession: async () => { throw new Error("must not run"); },
      }),
      params: () => Promise.resolve({ requestId: "unused" }),
    },
    {
      handler: () => createSessionHandler({
      authorize: async () => ({ ok: true, state: "reporter", userId: "profile", accessGeneration: 4 }),
      requestSession: async () => { throw new Error("must not run"); },
      }),
      params: () => Promise.reject(new Error("raw-param-secret")),
    },
  ]) {
    const response = await scenario.handler()(new Request("https://reporter.test"), { params: scenario.params() });
    assert.equal(response.status, 503);
    assert.match(response.headers.get("cache-control"), /no-store/u);
    assert.doesNotMatch(await response.text(), /raw|secret/u);
  }

  let receivedRequestId;
  const handler = createSessionHandler({
    authorize: async () => ({ ok: true, state: "reporter", userId: "profile", accessGeneration: 4 }),
    requestSession: async (input) => {
      receivedRequestId = input.requestId;
      return { serverUrl: "wss://livekit.test", token: "token", roomName: "room", startsAt: "start", endsAt: "end", recordingState: "recording" };
    },
  });
  const response = await handler(new Request("https://reporter.test"), {
    params: Promise.resolve({ requestId: "22222222-2222-4222-8222-2222222222AA" }),
  });
  assert.equal(response.status, 200);
  assert.equal(receivedRequestId, "22222222-2222-4222-8222-2222222222aa");

  const unauthenticated = await createSessionHandler({
    authorize: async () => ({ ok: false, reason: "unauthenticated" }),
    requestSession: async () => { throw new Error("must not run"); },
  })(new Request("https://reporter.test"), { params: Promise.resolve({ requestId: "unused" }) });
  assert.equal(unauthenticated.status, 401);

  const invalid = await handler(new Request("https://reporter.test"), {
    params: Promise.resolve({ requestId: "not-a-uuid" }),
  });
  assert.equal(invalid.status, 400);

  const starting = await createSessionHandler({
    authorize: async () => ({ ok: true, state: "reporter", userId: "profile", accessGeneration: 4 }),
    requestSession: async () => { throw new LiveSessionError("STARTING", 503); },
  })(new Request("https://reporter.test"), {
    params: Promise.resolve({ requestId: "22222222-2222-4222-8222-222222222222" }),
  });
  assert.equal(starting.status, 503);
  assert.equal(starting.headers.get("retry-after"), "30");
  assert.match(starting.headers.get("cache-control"), /no-store/u);
});

test("session route is POST-only, awaits params, authorizes, validates UUID, and maps safe errors", async () => {
  const route = `${await sourceOrEmpty(routeUrl)}\n${await sourceOrEmpty(handlerUrl)}`;
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

test("reporter environment rejects LiveKit URLs containing credentials, path, query, or fragment", async () => {
  for (const url of [
    "https://user:password@livekit.example.test",
    "https://livekit.example.test/private",
    "https://livekit.example.test/?token=private",
    "https://livekit.example.test/#private",
    "https://livekit.example.test/?",
    "https://livekit.example.test/#",
  ]) {
    await assert.rejects(execFileAsync(process.execPath, [
      "--conditions=react-server",
      "--experimental-strip-types",
      "--input-type=module",
      "-e",
      'await import("./src/config/env.ts")',
    ], {
      cwd: new URL("../../..", import.meta.url),
      env: {
        ...process.env,
        LIVEKIT_URL: url,
        LIVEKIT_API_KEY: "api-key",
        LIVEKIT_API_SECRET: "api-secret",
      },
    }), (error) => {
      const output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
      assert.match(output, /LIVEKIT_URL/u);
      assert.doesNotMatch(output, /password|token=private/u);
      return true;
    });
  }
});
