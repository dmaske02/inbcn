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
    new RegExp(`create or replace function public\\.${name}\\b[\\s\\S]*?\\$\\$;`, "u"),
  );
  assert.ok(match, `missing replacement for ${name}`);
  return match[0].replace(/\s+/gu, " ").toLowerCase();
}

test("the additive migration closes the terminal-reconciliation callback interleaving", async () => {
  const sql = await sourceOrEmpty(migrationUrl);
  const compact = sql.replace(/\s+/gu, " ").toLowerCase();

  assert.match(compact, /alter table public\.live_recordings add column terminal_reconciliation_status text/u);
  assert.match(compact, /constraint live_recordings_terminal_reconciliation_status_check check \( terminal_reconciliation_status is null or terminal_reconciliation_status in \('completed', 'failed'\) \)/u);

  const reconcile = sqlFunction(sql, "report_reporter_live_recording_reconciliation");
  const completeWebhook = sqlFunction(sql, "complete_livekit_webhook_event");
  const completeStart = sqlFunction(sql, "complete_reporter_live_recording_start");
  const authorize = sqlFunction(sql, "authorize_reporter_live_session");

  assert.match(reconcile, /terminal_reconciliation_status is not null and current_recording\.terminal_reconciliation_status is distinct from p_provider_status.*return false/u);
  assert.match(reconcile, /set egress_id = p_egress_id, terminal_reconciliation_status = coalesce\(terminal_reconciliation_status, p_provider_status\)/u);
  assert.match(reconcile, /terminal_reconciliation_status is null or terminal_reconciliation_status = p_provider_status/u);

  const staleReceipt = completeWebhook.indexOf("terminal_reconciliation_status is not null");
  const pendingToRecording = completeWebhook.indexOf("if p_recording_status = 'recording'");
  assert.ok(staleReceipt >= 0 && pendingToRecording > staleReceipt);
  assert.match(completeWebhook, /terminal_reconciliation_status is not null and p_recording_status = 'recording'.*processing_status = 'processed'.*return jsonb_build_object\('state', 'stale'\)/u);
  assert.match(completeWebhook, /terminal_reconciliation_status is not null and current_recording\.terminal_reconciliation_status is distinct from p_recording_status.*livekit_webhook_terminal_mismatch/u);
  assert.doesNotMatch(completeWebhook, /terminal_reconciliation_status\s*=\s*null/u);

  assert.match(completeStart, /terminal_reconciliation_status is null/u);
  assert.match(authorize, /current_recording\.terminal_reconciliation_status is not null.*reporter_live_session_forbidden/u);
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

  assert.match(compact, /never exposed to browsers, public projections, audit metadata, or notifications/u);
  assert.doesNotMatch(compact, /grant (?:select|insert|update)[^;]*terminal_reconciliation_status[^;]*to (?:public|anon|authenticated)/u);
  for (const name of [
    "complete_reporter_live_recording_start",
    "authorize_reporter_live_session",
    "complete_livekit_webhook_event",
    "report_reporter_live_recording_reconciliation",
  ]) {
    assert.match(compact, new RegExp(`revoke all on function public\\.${name}[^;]* from public, anon, authenticated, service_role`, "u"));
    assert.match(compact, new RegExp(`grant execute on function public\\.${name}[^;]* to service_role`, "u"));
  }
  assert.doesNotMatch(compact, /raw_body|provider_payload|p_provider_error|p_location/u);

  assert.equal(types.match(/\bterminal_reconciliation_status[?:]*: string \| null/gu)?.length, 3);
  assert.match(verification, /terminal_reconciliation_status/u);
  assert.match(verification, /live_recordings_terminal_reconciliation_status_check/u);
  assert.match(verification, /information_schema\.column_privileges/u);
});
