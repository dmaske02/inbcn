import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260822166000_reporter_lifecycle.sql",
  import.meta.url,
);
const migration = await readFile(migrationUrl, "utf8");
const compact = (value) => value.replace(/--.*$/gmu, " ").replace(/\s+/gu, " ").trim();
const sql = compact(migration);

function sqlFunction(name) {
  const match = migration.match(new RegExp(
    `create (?:or replace )?function public\\.${name}\\b[\\s\\S]*?\\$\\$;`,
    "u",
  ));
  assert.ok(match, `missing ${name}`);
  return compact(match[0]);
}

test("schema adds only lifecycle evidence and all-or-none coordinate deletion", () => {
  assert.match(sql, /alter table public\.story_locations alter column latitude drop not null, alter column longitude drop not null, alter column accuracy_meters drop not null, alter column captured_at drop not null/u);
  assert.match(sql, /add column exact_coordinates_deleted_at timestamptz/u);
  assert.match(sql, /latitude is null and longitude is null and accuracy_meters is null and captured_at is null and exact_coordinates_deleted_at is not null/u);
  assert.match(sql, /latitude is not null and longitude is not null and accuracy_meters is not null and captured_at is not null and exact_coordinates_deleted_at is null/u);
  assert.match(sql, /add column storage_deleted_at timestamptz/u);
  assert.match(sql, /add column deletion_lease_token uuid/u);
  assert.match(sql, /add column deletion_attempt_count integer not null default 0/u);
  assert.match(sql, /add column refund_retry_ready_at timestamptz/u);
  assert.match(sql, /add column deletion_retry_ready_at timestamptz/u);
  assert.match(sql, /when refund_status = 'refund_pending'.*razorpay_refund_id is not null.*refund_requested_at \+ interval '15 minutes'/u);
  assert.match(sql, /when refund_status = 'refund_failed'.*updated_at \+ make_interval/u);
  assert.doesNotMatch(sql, /create table public\.reporter_lifecycle/u);
});

test("one bounded service-role claim uses DB time and stable due-at/id ordering", () => {
  const claim = sqlFunction("claim_reporter_lifecycle");
  const signature = claim.slice(0, claim.indexOf("returns jsonb"));
  assert.match(signature, /\(p_limit integer\)/u);
  assert.doesNotMatch(signature, /timestamp|now/u);
  assert.match(claim, /security definer set search_path = ''/u);
  assert.match(claim, /coalesce\(auth\.jwt\(\) ->> 'role', ''\) <> 'service_role'/u);
  assert.match(claim, /p_limit not between 1 and 25/u);
  assert.match(claim, /lifecycle_time timestamptz := clock_timestamp\(\)/u);
  assert.match(claim, /order by due_at, id, kind limit p_limit/u);
  assert.match(claim, /completion_deadline - interval '7 days'/u);
  assert.match(claim, /membership_expires_at - interval '30 days'/u);
});

test("DB-owned retry readiness keeps more than 250 old failures behind other due kinds", () => {
  const claim = sqlFunction("claim_reporter_lifecycle");
  const failRefund = sqlFunction("fail_reporter_lifecycle_refund");
  const failManualRefund = sqlFunction("fail_reporter_refund_request");
  const failDeletion = sqlFunction("fail_reporter_recording_deletion");
  assert.match(claim, /greatest\(\s*reporter_payments\.refund_eligible_at,\s*coalesce\(\s*reporter_payments\.refund_retry_ready_at,\s*reporter_payments\.refund_eligible_at\s*\)\s*\)/u);
  assert.match(claim, /greatest\(\s*live_recordings\.retention_delete_at,\s*coalesce\(\s*live_recordings\.deletion_retry_ready_at,\s*live_recordings\.retention_delete_at\s*\)\s*\)/u);
  assert.match(claim, /coalesce\( reporter_payments\.refund_retry_ready_at, reporter_payments\.refund_eligible_at \) <= lifecycle_time/u);
  assert.match(claim, /coalesce\( live_recordings\.deletion_retry_ready_at, live_recordings\.retention_delete_at \) <= lifecycle_time/u);
  assert.match(failRefund, /refund_retry_ready_at = failure_time \+ make_interval/u);
  assert.match(failManualRefund, /refund_retry_ready_at = failure_time \+ make_interval/u);
  assert.match(failDeletion, /deletion_retry_ready_at = failure_time \+ make_interval/u);
  assert.match(failRefund, /refund_attempt_count/u);
  assert.match(failDeletion, /deletion_attempt_count/u);
  assert.doesNotMatch(failRefund, /refund_eligible_at\s*=/u);
  assert.doesNotMatch(failDeletion, /retention_delete_at\s*=/u);

  const oldFailureRetries = Array.from({ length: 251 }, (_, index) => ({
    dueAt: 1_000,
    id: `retry-${index.toString().padStart(3, "0")}`,
    kind: "refund",
  }));
  const otherKind = { dueAt: 500, id: "coordinate", kind: "coordinate_delete" };
  const firstPage = [...oldFailureRetries, otherKind]
    .sort((left, right) => left.dueAt - right.dueAt || left.id.localeCompare(right.id))
    .slice(0, 25);
  assert.ok(firstPage.includes(otherKind));
});

test("application/refund and renewal races recheck locked authoritative state", () => {
  const claim = sqlFunction("claim_reporter_lifecycle");
  const overdue = sqlFunction("mark_overdue_reporter_application");
  assert.match(claim, /reporter_applications\.completion_deadline <= lifecycle_time and exists \( select 1 from public\.reporter_payments/u);
  assert.match(claim, /public\.mark_overdue_reporter_application\(work\.id\)/u);
  assert.match(claim, /from public\.reporter_payments where application_id = current_application\.id for update/u);
  assert.doesNotMatch(overdue, /jsonb_build_object\('payment_id'/u);
  assert.match(overdue, /'\{\}'::jsonb/u);
  assert.match(claim, /from public\.reporter_payments where id = work\.id for update/u);
  assert.match(claim, /refund_status = 'refunded'.*continue/u);
  assert.match(claim, /current_payment\.refund_status = 'refund_pending'.*then current_payment\.refund_attempt_count else current_payment\.refund_attempt_count \+ 1/u);
  assert.match(claim, /from public\.reporter_profiles where profile_id = work\.id for update/u);
  assert.match(claim, /membership_expires_at > lifecycle_time.*continue/u);
  assert.match(claim, /public_status = 'suspended'.*continue/u);
  assert.match(claim, /reporter_profiles\.membership_expires_at < lifecycle_time and reporter_profiles\.membership_grace_ends_at >= lifecycle_time/u);
  assert.match(claim, /set public_status = 'grace'/u);
  assert.match(claim, /set public_status = 'expired'/u);
  assert.doesNotMatch(claim, /can_publish_directly = false|can_broadcast_live = false/u);
});

test("recording claims require terminal private canonical objects without holds or reconciliation", () => {
  const claim = sqlFunction("claim_reporter_lifecycle");
  const guard = sqlFunction("prevent_live_recording_deletion_race");
  assert.match(claim, /recording_status = 'completed'/u);
  assert.match(claim, /replay_status in \('private', 'rejected'\)/u);
  assert.match(claim, /not live_recordings\.legal_hold/u);
  assert.match(claim, /terminal_reconciliation_status is distinct from 'unknown'/u);
  assert.match(claim, /not exists \( select 1 from public\.public_live_replays/u);
  assert.match(claim, /live_recordings\.storage_key = 'reporter-live\/' .* live_recordings\.live_request_id::text .* live_recordings\.id::text \|\| '\.mp4'/u);
  assert.match(claim, /live_recordings\.deletion_lease_token is null or live_recordings\.deletion_lease_claimed_at <= lifecycle_time - interval '5 minutes'/u);
  assert.match(guard, /old\.storage_deleted_at is not null/u);
  assert.match(guard, /old\.deletion_lease_token is not null/u);
  assert.match(guard, /message = 'LIVE_RECORDING_DELETION_IN_PROGRESS'/u);
  assert.match(guard, /old\.deletion_failure_detail = 'provider-not-configured'.*new\.deletion_lease_token := null/u);
});

test("recording completion and failure preserve request-to-recording lock order and exact lease facts", () => {
  for (const name of [
    "complete_reporter_recording_deletion",
    "fail_reporter_recording_deletion",
  ]) {
    const body = sqlFunction(name);
    assert.match(body, /from public\.reporter_live_requests .* for update; .* from public\.live_recordings .* for update/u);
    assert.match(body, /deletion_lease_token is distinct from p_lease_token/u);
    assert.match(body, /storage_key is distinct from p_object_key/u);
    assert.match(body, /p_object_key <> 'reporter-live\/' .* current_recording\.live_request_id::text .* current_recording\.id::text \|\| '\.mp4'/u);
    assert.match(body, /replay_status not in \('private', 'rejected'\)/u);
    assert.match(body, /current_recording\.legal_hold/u);
    assert.match(body, /terminal_reconciliation_status is not distinct from 'unknown'/u);
  }
  const complete = sqlFunction("complete_reporter_recording_deletion");
  assert.match(complete, /p_result not in \('deleted', 'not_found'\)/u);
  assert.match(complete, /storage_deleted_at is not null.*storage_key is null.*p_object_key = 'reporter-live\/'.*return true/u);
  assert.match(complete, /storage_key = null, storage_deleted_at = completion_time/u);
  const fail = sqlFunction("fail_reporter_recording_deletion");
  assert.match(fail, /deletion_lease_token = p_lease_token/u);
  assert.match(fail, /deletion_failure_detail is not distinct from p_failure_code.*return true/u);
  assert.doesNotMatch(fail, /deletion_lease_token = null/u);
});

test("exact provider-failure completion retries do not duplicate audits", () => {
  const failRefund = sqlFunction("fail_reporter_lifecycle_refund");
  assert.match(failRefund, /refund_failure_detail is not distinct from p_failure_code.*return true/u);
});

test("exact refund request completion retries reuse the bound provider refund", () => {
  const recordRefund = sqlFunction("record_reporter_refund_request");
  assert.match(recordRefund, /p_refund_request_token is null/u);
  assert.match(recordRefund, /refund_status in \( 'refund_pending', 'refund_failed', 'refunded' \).*razorpay_refund_id = btrim\(p_razorpay_refund_id\).*refund_request_token is null.*return true/u);
  assert.match(recordRefund, /refund_retry_ready_at = requested_at \+ interval '15 minutes'/u);
});

test("stale bound refunds are claimed by exact id without advancing their attempt", () => {
  const claim = sqlFunction("claim_reporter_lifecycle");
  assert.match(claim, /refund_status in \('refund_pending', 'refund_failed'\)[\s\S]*coalesce\( reporter_payments\.refund_retry_ready_at, reporter_payments\.refund_eligible_at \) <= lifecycle_time/u);
  assert.doesNotMatch(claim, /current_payment\.refund_status = 'refund_pending'[\s\S]{0,120}current_payment\.razorpay_refund_id is not null[\s\S]{0,80}continue/u);
  assert.match(claim, /when current_payment\.refund_status = 'refund_pending' and current_payment\.refund_attempt_count > 0 then current_payment\.refund_attempt_count/u);
  assert.match(claim, /'provider_refund_id', case when current_payment\.refund_status = 'refund_failed' then null else current_payment\.razorpay_refund_id end/u);
  assert.match(claim, /razorpay_refund_id = case[\s\S]*current_payment\.refund_status = 'refund_failed' then null[\s\S]*else current_payment\.razorpay_refund_id/u);
});

test("locked refund reconciliation owns exact identity, money, receipt, and terminal state", () => {
  const reconcile = sqlFunction("reconcile_reporter_refund");
  assert.match(reconcile, /security definer set search_path = ''/u);
  assert.match(reconcile, /coalesce\(auth\.jwt\(\) ->> 'role', ''\) <> 'service_role'/u);
  assert.match(reconcile, /from public\.reporter_payments where id = p_payment_id for update/u);
  assert.match(reconcile, /refund_request_token is distinct from p_lease_token/u);
  assert.match(reconcile, /razorpay_refund_id is distinct from btrim\(p_razorpay_refund_id\)/u);
  assert.match(reconcile, /razorpay_payment_id is distinct from btrim\(p_razorpay_payment_id\)/u);
  assert.match(reconcile, /amount_paise <> p_amount_paise/u);
  assert.match(reconcile, /currency <> p_currency/u);
  assert.match(reconcile, /p_receipt is distinct from current_payment\.id::text \|\| ':' \|\| current_payment\.refund_attempt_count::text/u);
  assert.match(reconcile, /p_provider_status not in \('processed', 'failed'\)/u);
  assert.match(reconcile, /refund_status = 'refunded'/u);
  assert.match(reconcile, /refunded_at = coalesce\(current_payment\.refunded_at, reconciliation_time\)/u);
  assert.match(reconcile, /refund_status = 'refund_failed'/u);
  assert.doesNotMatch(reconcile, /refund_requested_at\s*=/u);
  assert.doesNotMatch(reconcile, /refund_eligible_at\s*=/u);
});

test("signed refund webhooks remain authoritative and idempotent after reconciliation", () => {
  const processed = sqlFunction("complete_razorpay_refund_webhook");
  const failed = sqlFunction("complete_razorpay_refund_failure_webhook");
  for (const body of [processed, failed]) {
    assert.match(body, /where provider = 'razorpay' and provider_event_id = btrim\(p_event_id\) for update/u);
    assert.match(body, /from public\.reporter_payments where razorpay_payment_id = btrim\(p_razorpay_payment_id\) for update/u);
    assert.match(body, /razorpay_refund_id.*btrim\(p_razorpay_refund_id\)/u);
    assert.match(body, /processing_status = 'processed'/u);
    assert.match(body, /refund_attempt_count > 1.*refund_request_token is not null.*razorpay_refund_id is null/u);
  }
  assert.match(processed, /refunded_at = coalesce\(refunded_at, processing_time\)/u);
  assert.match(failed, /refund_status not in \('refund_pending', 'refund_failed'\)/u);
  assert.match(failed, /refund_retry_ready_at = coalesce\( refund_retry_ready_at,/u);
});

test("publication uses request-to-recording locks and rechecks deletion state under both locks", () => {
  const publish = sqlFunction("publish_live_recording");
  const signature = publish.slice(0, publish.indexOf("returns uuid"));
  assert.match(signature, /\( p_recording_id uuid, p_title text, p_description text, p_category_id uuid, p_thumbnail_media_id uuid \)/u);
  assert.match(publish, /select live_request_id into target_request_id from public\.live_recordings where id = p_recording_id/u);
  assert.match(publish, /from public\.reporter_live_requests where id = target_request_id for update; .* from public\.live_recordings where id = p_recording_id for update/u);
  assert.match(publish, /current_recording\.live_request_id <> current_request\.id/u);
  assert.match(publish, /current_recording\.deletion_lease_token is not null/u);
  assert.match(publish, /current_recording\.storage_deleted_at is not null/u);
  assert.match(publish, /current_recording\.storage_key is null/u);
  assert.match(publish, /current_recording\.replay_status = 'published'/u);
});

test("coordinate deletion keeps locality and requires final-story evidence under lock", () => {
  const claim = sqlFunction("claim_reporter_lifecycle");
  assert.match(claim, /from public\.story_locations where story_locations\.retention_due_at is not null.*and exists \( select 1 from public\.stories where stories\.id = story_locations\.story_id and stories\.status in \('published', 'rejected', 'archived'\)/u);
  assert.match(claim, /from public\.stories where id = target_story_id for update/u);
  assert.match(claim, /from public\.story_locations where id = work\.id for update/u);
  assert.match(claim, /current_story\.status not in \('published', 'rejected', 'archived'\)/u);
  assert.match(claim, /current_location\.retention_due_at > lifecycle_time/u);
  assert.match(claim, /current_location\.legal_hold/u);
  assert.match(claim, /set latitude = null, longitude = null, accuracy_meters = null, captured_at = null, exact_coordinates_deleted_at = lifecycle_time/u);
  assert.doesNotMatch(claim, /locality = null|received_at = null/u);
});

test("coordinate consumers tolerate expired exact evidence while retaining locality", async () => {
  const [reporterRepository, cmsModel, cmsPanel] = await Promise.all([
    readFile(new URL("../submissions/submission.repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../../cms/src/features/admin/stories/story.model.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../../cms/src/features/admin/stories/reporter-revision-panel.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(reporterRepository, /data\.latitude !== null[\s\S]*data\.captured_at !== null/u);
  assert.match(cmsModel, /latitude: z\.number\(\)\.nullable\(\)[\s\S]*captured_at: z\.string\(\)\.nullable\(\)/u);
  assert.match(cmsPanel, /exactLocationAvailable/u);
  assert.match(cmsPanel, /review\.private_location\.locality/u);
});

test("notifications and audits are atomic, idempotent, and contain no private/provider facts", () => {
  for (const type of [
    "application_completion_reminder",
    "application_cancelled",
    "membership_renewal_reminder",
    "membership_grace_started",
    "membership_expired",
    "recording_deleted",
  ]) assert.match(sql, new RegExp(`'${type}'`, "u"));
  assert.match(sql, /completion_reminded_at is null/u);
  assert.match(sql, /reporter_profiles\.renewal_reminded_for is distinct from reporter_profiles\.membership_expires_at/u);
  assert.match(sql, /set renewal_reminded_for = current_reporter\.membership_expires_at/u);
  const auditStatements = [...migration.matchAll(
    /insert into public\.audit_events[\s\S]*?;/gu,
  )].map((match) => match[0]);
  assert.ok(auditStatements.length > 0);
  for (const statement of auditStatements) {
    assert.doesNotMatch(statement, /razorpay|object_key|storage_key|latitude|longitude|provider_payment/iu);
  }
});

test("exact RPC grants are service-role only", () => {
  for (const signature of [
    "claim_reporter_lifecycle(integer)",
    "fail_reporter_lifecycle_refund(uuid, uuid, text)",
    "reconcile_reporter_refund(uuid, uuid, text, text, text, integer, text, text)",
    "record_reporter_refund_request(uuid, uuid, text, text, integer, text)",
    "fail_reporter_refund_request(uuid, uuid)",
    "complete_razorpay_refund_webhook(text, uuid, text, text, integer, text)",
    "complete_razorpay_refund_failure_webhook(text, uuid, text, text, integer, text)",
    "complete_reporter_recording_deletion(uuid, uuid, text, text)",
    "fail_reporter_recording_deletion(uuid, uuid, text, text)",
  ]) {
    const escaped = signature.replace(/[()]/gu, "\\$&").replace(/, /gu, ", ");
    assert.match(sql, new RegExp(`revoke all on function public\\.${escaped} from public, anon, authenticated, service_role`, "u"));
    assert.match(sql, new RegExp(`grant execute on function public\\.${escaped} to service_role`, "u"));
    assert.doesNotMatch(sql, new RegExp(`grant execute on function public\\.${escaped} to (?:public|anon|authenticated)`, "u"));
  }
  assert.match(sql, /revoke all on function public\.publish_live_recording\(uuid, text, text, uuid, uuid\) from public, anon, authenticated, service_role/u);
  assert.match(sql, /grant execute on function public\.publish_live_recording\(uuid, text, text, uuid, uuid\) to authenticated/u);
  assert.doesNotMatch(sql, /grant execute on function public\.publish_live_recording\(uuid, text, text, uuid, uuid\) to (?:public|anon|service_role)/u);
});

test("manual types, docs, and rollback-only verification ship with the migration", async () => {
  const [types, databaseDocs, rlsDocs, verifier] = await Promise.all([
    readFile(new URL("../../../../packages/database/src/database.types.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../../docs/database-schema.md", import.meta.url), "utf8"),
    readFile(new URL("../../../../docs/row-level-security.md", import.meta.url), "utf8"),
    readFile(new URL("../../../../supabase/verification/reporter-lifecycle-verification.sql", import.meta.url), "utf8"),
  ]);
  assert.match(compact(types), /claim_reporter_lifecycle: \{ Args: \{ p_limit: number \} ;?Returns: Json \}/u);
  assert.match(compact(types), /exact_coordinates_deleted_at: string \| null/u);
  assert.match(compact(types), /storage_deleted_at: string \| null/u);
  assert.match(compact(types), /refund_retry_ready_at: string \| null/u);
  assert.match(compact(types), /deletion_retry_ready_at: string \| null/u);
  assert.match(compact(types), /reconcile_reporter_refund: \{ Args:/u);
  assert.match(databaseDocs, /20260822166000_reporter_lifecycle\.sql/u);
  assert.match(databaseDocs, /refund_retry_ready_at/u);
  assert.match(databaseDocs, /deletion_retry_ready_at/u);
  assert.match(rlsDocs, /claim_reporter_lifecycle/u);
  assert.match(compact(verifier), /public\.reconcile_reporter_refund\(uuid,uuid,text,text,text,integer,text,text\)/u);
  assert.match(compact(verifier), /public\.publish_live_recording\(uuid,text,text,uuid,uuid\)/u);
  assert.match(compact(verifier), /(?:^|ON_ERROR_STOP on )begin;/u);
  assert.match(compact(verifier), /rollback;$/u);
});
