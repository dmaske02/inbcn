import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260822165000_livekit_terminal_reconciliation_marker.sql",
  import.meta.url,
);
const typesUrl = new URL("../../../../packages/database/src/database.types.ts", import.meta.url);
const verificationUrl = new URL(
  "../../../../supabase/verification/reporter-live-recording-verification.sql",
  import.meta.url,
);

async function sourceOrEmpty(url) {
  try {
    return await readFile(url, "utf8");
  } catch {
    return "";
  }
}

function sqlFunction(sql, name) {
  const match = sql.match(
    new RegExp(`create or replace function (?:public|private)\\.${name}\\b[\\s\\S]*?\\$\\$;`, "u"),
  );
  assert.ok(match, `missing replacement for ${name}`);
  return match[0].replace(/\s+/gu, " ").toLowerCase();
}

test("the additive upgrade durably quarantines every audited bound non-completed legacy shape", async () => {
  const sql = await sourceOrEmpty(migrationUrl);
  const compact = sql.replace(/\s+/gu, " ").toLowerCase();

  assert.match(compact, /alter table public\.live_recordings add column terminal_reconciliation_status text/u);
  assert.match(compact, /terminal_reconciliation_status = 'unknown' and recording_status in \('pending', 'recording', 'failed'\)/u);
  assert.match(compact, /recording_status = 'pending' and terminal_reconciliation_status in \('completed', 'failed'\)/u);
  assert.match(compact, /recording_status = 'completed' and terminal_reconciliation_status = 'completed'/u);
  assert.match(compact, /recording_status = 'failed' and terminal_reconciliation_status = 'failed'/u);

  const quarantine = sqlFunction(sql, "quarantine_legacy_live_recording_reconciliations");
  const backfillStart = quarantine.indexOf("update public.live_recordings as legacy_recording");
  assert.ok(backfillStart >= 0);
  const backfill = quarantine.slice(backfillStart);
  assert.match(backfill, /set terminal_reconciliation_status = 'unknown'/u);
  assert.match(backfill, /legacy_recording\.recording_status in \('pending', 'recording', 'failed'\)/u);
  assert.match(backfill, /legacy_recording\.egress_id is not null/u);
  assert.match(backfill, /legacy_recording\.terminal_reconciliation_status is null/u);
  assert.match(backfill, /exists \( select 1 from public\.audit_events as reconciliation_audit/u);
  assert.match(backfill, /reconciliation_audit\.action = 'live_recording\.reconciliation_required'/u);
  assert.match(backfill, /reconciliation_audit\.subject_type = 'live_recording'/u);
  assert.match(backfill, /reconciliation_audit\.subject_id = legacy_recording\.id/u);
  assert.doesNotMatch(quarantine, /raise exception|recording_claim_token is not null|recording_claimed_at is not null/u);
  assert.doesNotMatch(compact, /live_recording_reconciliation_upgrade_requires_operator_remediation/u);

  const lock = compact.indexOf("lock table public.live_recordings in share row exclusive mode");
  const quarantineCall = compact.indexOf("select private.quarantine_legacy_live_recording_reconciliations()", lock);
  const reserveReplacement = compact.indexOf("create or replace function public.reserve_reporter_live_recording", quarantineCall);
  const serviceGrant = compact.indexOf("grant execute on function public.reserve_reporter_live_recording", quarantineCall);
  assert.ok(lock >= 0 && quarantineCall > lock && reserveReplacement > quarantineCall
    && serviceGrant > reserveReplacement);

  const guard = sqlFunction(sql, "guard_live_recording_terminal_reconciliation");
  assert.match(guard, /old\.terminal_reconciliation_status in \('completed', 'failed'\).*new\.terminal_reconciliation_status is distinct from old\.terminal_reconciliation_status.*raise exception/u);
  assert.match(guard, /old\.terminal_reconciliation_status = 'unknown'.*new\.terminal_reconciliation_status is null.*raise exception/u);
  assert.match(compact, /create trigger live_recordings_terminal_reconciliation_is_monotonic before update of terminal_reconciliation_status on public\.live_recordings/u);
});

test("expired quarantined claims stay busy before provider history or start work", async () => {
  const sql = await sourceOrEmpty(migrationUrl);
  const reserve = sqlFunction(sql, "reserve_reporter_live_recording");

  const requestLock = reserve.indexOf("from public.reporter_live_requests");
  const reporterLock = reserve.indexOf("from public.reporter_profiles", requestLock);
  const profileLock = reserve.indexOf("from public.profiles", reporterLock);
  const recordingLock = reserve.indexOf("from public.live_recordings", profileLock);
  const markerFence = reserve.indexOf("terminal_reconciliation_status is not null", recordingLock);
  const freshLease = reserve.indexOf("recording_claimed_at >= reservation_time - interval '5 minutes'", recordingLock);
  const reclaim = reserve.indexOf("set recording_claim_token = claim_token", recordingLock);

  assert.ok(requestLock >= 0 && reporterLock > requestLock && profileLock > reporterLock
    && recordingLock > profileLock && markerFence > recordingLock
    && freshLease > markerFence && reclaim > freshLease);
  assert.match(reserve.slice(markerFence, freshLease), /return jsonb_build_object\('state', 'busy'\)/u);
});

test("marked start completion and local room or Egress failure cannot overwrite the marker", async () => {
  const sql = await sourceOrEmpty(migrationUrl);
  const completeStart = sqlFunction(sql, "complete_reporter_live_recording_start");
  const failStart = sqlFunction(sql, "fail_reporter_live_recording_start");
  const authorize = sqlFunction(sql, "authorize_reporter_live_session");

  assert.match(completeStart, /recording_claim_token = p_claim_token and terminal_reconciliation_status is null/u);
  assert.match(failStart, /recording_claim_token = p_claim_token and terminal_reconciliation_status is null/u);
  assert.match(authorize, /current_recording\.terminal_reconciliation_status is not null.*reporter_live_session_forbidden/u);
});

test("an unknown sibling fences the request until provider-confirmed resolution", async () => {
  const sql = await sourceOrEmpty(migrationUrl);
  const reserve = sqlFunction(sql, "reserve_reporter_live_recording");
  const authorize = sqlFunction(sql, "authorize_reporter_live_session");

  const reserveMarkerScan = reserve.indexOf("terminal_reconciliation_status = 'unknown'");
  const reserveActiveScan = reserve.indexOf("recording_status in ('pending', 'recording')");
  assert.ok(reserveMarkerScan >= 0 && reserveActiveScan > reserveMarkerScan);
  assert.match(reserve, /from public\.live_recordings where live_request_id = current_request\.id and terminal_reconciliation_status = 'unknown'.*return jsonb_build_object\('state', 'busy'\).*recording_status in \('pending', 'recording'\)/u);
  assert.match(reserve, /if found and current_recording\.terminal_reconciliation_status is not null then return jsonb_build_object\('state', 'busy'\)/u);
  assert.match(authorize, /exists \( select 1 from public\.live_recordings as quarantined_recording where quarantined_recording\.live_request_id = current_request\.id and quarantined_recording\.terminal_reconciliation_status = 'unknown' \).*reporter_live_session_forbidden/u);
});

test("provider-confirmed quarantine resolution is exact, bounded, auditable, and retry-safe", async () => {
  const sql = await sourceOrEmpty(migrationUrl);
  const compact = sql.replace(/\s+/gu, " ").toLowerCase();
  const resolve = sqlFunction(sql, "resolve_quarantined_live_recording");

  assert.match(resolve, /security definer set search_path = ''/u);
  assert.match(resolve, /auth\.role\(\) is distinct from 'service_role'.*live_recording_provider_resolution_forbidden/u);
  assert.match(resolve, /p_provider_status not in \('completed', 'failed'\)/u);
  assert.match(resolve, /p_duration_seconds > 86400.*p_bytes > 1099511627776/u);
  assert.match(resolve, /p_duration_seconds is distinct from round\(p_duration_seconds, 3\)/u);
  assert.match(resolve, /not isfinite\(p_provider_started_at\).*not isfinite\(p_provider_ended_at\)/u);
  assert.match(resolve, /p_provider_ended_at > resolution_time \+ interval '5 minutes'/u);
  assert.match(resolve, /p_provider_status = 'failed'.*p_storage_key is not null.*p_provider_started_at is not null.*p_provider_ended_at is not null/u);

  const requestLock = resolve.indexOf("from public.reporter_live_requests");
  const recordingLock = resolve.indexOf("from public.live_recordings", requestLock);
  assert.ok(requestLock >= 0 && recordingLock > requestLock);
  assert.match(resolve.slice(requestLock, recordingLock), /for update/u);
  assert.match(resolve.slice(recordingLock), /for update/u);
  assert.match(resolve, /current_recording\.live_request_id is distinct from current_request\.id/u);
  assert.match(resolve, /current_recording\.egress_id is distinct from p_egress_id/u);
  assert.match(resolve, /current_request\.livekit_room_name is distinct from 'reporter-live-' \|\| replace\(current_request\.id::text, '-', ''\)/u);
  assert.match(resolve, /canonical_key := 'reporter-live\/' \|\| current_request\.id::text \|\| '\/' \|\| current_recording\.id::text \|\| '\.mp4'/u);
  assert.match(resolve, /current_recording\.terminal_reconciliation_status is distinct from 'unknown'/u);
  assert.match(resolve, /'provider-confirmed-terminal-failure'/u);
  assert.match(resolve, /'live_recording\.reconciliation_resolved'.*'\{"status":"resolved"\}'::jsonb/u);
  assert.doesNotMatch(resolve, /jsonb_build_object\([^)]*(?:egress|storage|provider|reason|location|payload)/u);
  assert.match(resolve, /return jsonb_build_object\('state', 'unchanged'\)/u);
  assert.match(resolve, /live_recording_provider_resolution_conflict/u);

  const signature = "resolve_quarantined_live_recording(uuid, uuid, text, text, text, numeric, bigint, timestamptz, timestamptz)";
  assert.match(compact, new RegExp(`revoke all on function public\\.${signature.replace(/[().]/gu, "\\$&")} from public, anon, authenticated, service_role`, "u"));
  assert.match(compact, new RegExp(`grant execute on function public\\.${signature.replace(/[().]/gu, "\\$&")} to service_role`, "u"));
});

test("only an unknown service resolution can correct a legacy terminal local state", async () => {
  const sql = await sourceOrEmpty(migrationUrl);
  const lifecycle = sqlFunction(sql, "set_live_recording_lifecycle_clocks");
  const webhook = sqlFunction(sql, "complete_livekit_webhook_event");

  assert.match(lifecycle, /auth\.role\(\) is not distinct from 'service_role'.*old\.terminal_reconciliation_status = 'unknown'.*new\.terminal_reconciliation_status = new\.recording_status.*new\.recording_status in \('completed', 'failed'\)/u);
  assert.match(lifecycle, /became_terminal :=.*provider_resolution and old\.recording_status is distinct from new\.recording_status/u);
  assert.match(lifecycle, /old\.recording_status in \('completed', 'failed'\).*not provider_resolution.*live_recording_transition_invalid/u);
  assert.match(lifecycle, /provider_resolution and new\.recording_status = 'completed'.*new\.recording_started_at.*new\.recording_completed_at/u);
  assert.match(webhook, /recording_status in \('completed', 'failed'\) and current_recording\.terminal_reconciliation_status is distinct from 'unknown'.*return jsonb_build_object\('state', 'stale'\)/u);
  assert.match(webhook, /recording_started_at = p_provider_started_at.*recording_completed_at = p_provider_ended_at/u);
});

test("conflicting terminal callbacks fail before stale handling while matching and nonterminal retries stay stale-safe", async () => {
  const sql = await sourceOrEmpty(migrationUrl);

  const reconcile = sqlFunction(sql, "report_reporter_live_recording_reconciliation");
  const completeWebhook = sqlFunction(sql, "complete_livekit_webhook_event");

  assert.match(reconcile, /terminal_reconciliation_status in \('completed', 'failed'\) and current_recording\.terminal_reconciliation_status is distinct from p_provider_status.*return false/u);
  assert.match(reconcile, /set egress_id = p_egress_id, terminal_reconciliation_status = case when terminal_reconciliation_status in \('completed', 'failed'\) then terminal_reconciliation_status else p_provider_status end/u);
  assert.match(reconcile, /terminal_reconciliation_status is null or terminal_reconciliation_status = 'unknown' or terminal_reconciliation_status = p_provider_status/u);

  const terminalMismatch = completeWebhook.indexOf("terminal_reconciliation_status in ('completed', 'failed')");
  const staleReceipt = completeWebhook.indexOf("if (current_recording.recording_status in ('completed', 'failed')");
  const pendingToRecording = completeWebhook.indexOf("if p_recording_status = 'recording'");
  assert.ok(terminalMismatch >= 0 && staleReceipt > terminalMismatch && pendingToRecording > staleReceipt);
  assert.match(completeWebhook.slice(terminalMismatch, staleReceipt), /p_recording_status in \('completed', 'failed'\).*current_recording\.terminal_reconciliation_status is distinct from p_recording_status.*livekit_webhook_terminal_mismatch/u);
  assert.match(completeWebhook, /terminal_reconciliation_status is not null and p_recording_status = 'recording'.*processing_status = 'processed'.*return jsonb_build_object\('state', 'stale'\)/u);
  assert.match(completeWebhook, /terminal_reconciliation_status = case when terminal_reconciliation_status is null then null else 'completed' end/u);
  assert.match(completeWebhook, /terminal_reconciliation_status = case when terminal_reconciliation_status is null then null else 'failed' end/u);
  assert.doesNotMatch(completeWebhook, /terminal_reconciliation_status\s*=\s*null/u);
});

test("terminal reconciliation retains receipt-first and request-before-recording lock order", async () => {
  const sql = await sourceOrEmpty(migrationUrl);
  const completeWebhook = sqlFunction(sql, "complete_livekit_webhook_event");
  const receiptLock = completeWebhook.indexOf("from public.webhook_events");
  const targetLookup = completeWebhook.indexOf("select live_request_id into target_request_id");
  const requestLock = completeWebhook.indexOf("from public.reporter_live_requests", targetLookup);
  const recordingLock = completeWebhook.indexOf("from public.live_recordings", requestLock);

  assert.ok(receiptLock >= 0 && targetLookup > receiptLock
    && requestLock > targetLookup && recordingLock > requestLock);
  assert.doesNotMatch(completeWebhook.slice(targetLookup, requestLock), /for update/u);
  assert.match(completeWebhook.slice(requestLock, recordingLock), /for update/u);
  assert.match(completeWebhook.slice(recordingLock), /for update/u);
  assert.match(completeWebhook, /current_recording\.egress_id is distinct from current_event\.provider_subject_id/u);
});

test("terminal reconciliation marker is private, typed, and deployment-verifiable", async () => {
  const [sql, types, verification] = await Promise.all([
    sourceOrEmpty(migrationUrl),
    readFile(typesUrl, "utf8"),
    readFile(verificationUrl, "utf8"),
  ]);
  const compact = sql.replace(/\s+/gu, " ").toLowerCase();
  const verificationCompact = verification.replace(/\s+/gu, " ");

  assert.match(compact, /never exposed to browsers, public projections, audit metadata, or notifications/u);
  assert.doesNotMatch(compact, /grant (?:select|insert|update)[^;]*terminal_reconciliation_status[^;]*to (?:public|anon|authenticated)/u);
  assert.match(compact, /revoke insert \( live_request_id, live_stream_id, egress_id, recording_status, storage_key, duration_seconds, bytes, checksum, provider_error, private_metadata \), update \( live_stream_id, egress_id, recording_status, storage_key, duration_seconds, bytes, checksum, provider_error, private_metadata \) on table public\.live_recordings from service_role/u);
  for (const name of [
    "reserve_reporter_live_recording",
    "complete_reporter_live_recording_start",
    "fail_reporter_live_recording_start",
    "authorize_reporter_live_session",
    "complete_livekit_webhook_event",
    "report_reporter_live_recording_reconciliation",
    "resolve_quarantined_live_recording",
  ]) {
    assert.match(compact, new RegExp(`revoke all on function public\\.${name}[^;]* from public, anon, authenticated, service_role`, "u"));
    assert.match(compact, new RegExp(`grant execute on function public\\.${name}[^;]* to service_role`, "u"));
  }
  assert.doesNotMatch(compact, /raw_body|provider_payload|p_provider_error|p_location/u);

  assert.equal(types.match(/\bterminal_reconciliation_status[?:]*: string \| null/gu)?.length, 3);
  assert.match(types, /resolve_quarantined_live_recording:/u);
  assert.match(verification, /terminal_reconciliation_status/u);
  assert.match(verification, /live_recordings_terminal_reconciliation_status_check/u);
  assert.match(verification, /live_recordings_terminal_reconciliation_is_monotonic/u);
  assert.match(verification, /reserve_reporter_live_recording/u);
  assert.match(verification, /fail_reporter_live_recording_start/u);
  assert.match(verification, /live_recording\.reconciliation_required/u);
  assert.match(verification, /quarantine_legacy_live_recording_reconciliations/u);
  assert.doesNotMatch(verification, /LIVE_RECORDING_RECONCILIATION_UPGRADE_REQUIRES_OPERATOR_REMEDIATION/u);
  assert.match(verification, /LIVEKIT_WEBHOOK_TERMINAL_MISMATCH/u);
  assert.match(verification, /pending\/recording\/failed quarantine runtime failed/u);
  assert.match(verification, /provider-confirmed completed resolution runtime failed/u);
  assert.match(verification, /provider-confirmed failed resolution runtime failed/u);
  assert.match(verification, /provider-confirmed failed retry runtime failed/u);
  assert.match(verification, /provider resolution exact retry runtime failed/u);
  assert.match(verification, /provider resolution conflict was accepted/u);
  assert.match(verification, /quarantined nonterminal receipt was not stale/u);
  assert.match(verification, /reconciliation_resolved/u);
  assert.doesNotMatch(verification, /delete from public\.audit_events/u);
  assert.match(verification, /information_schema\.column_privileges/u);
  assert.match(verification, /privilege_type in \('INSERT', 'UPDATE'\)/u);
  assert.match(verificationCompact, /table_name = 'live_recordings' and grantee = 'service_role' and privilege_type in \('INSERT', 'UPDATE'\)/u);
});
