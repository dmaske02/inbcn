import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260822100000_razorpay_payment_lifecycle.sql",
  import.meta.url,
);
const sql = await readFile(migrationUrl, "utf8");

const signatures = {
  reserve_reporter_order: "uuid, uuid, text, jsonb",
  complete_reporter_order: "uuid, uuid, text",
  fail_reporter_order: "uuid, uuid",
  claim_razorpay_webhook_event: "text, text",
  complete_razorpay_payment_webhook: "text, uuid, text, text, integer, text",
  complete_razorpay_refund_webhook: "text, uuid, text, text, integer, text",
  complete_razorpay_refund_failure_webhook: "text, uuid, text, text, integer, text",
  fail_razorpay_webhook_event: "text, uuid, text",
  reserve_reporter_refund: "uuid, uuid",
  record_reporter_refund_request: "uuid, uuid, text, text, integer, text",
  fail_reporter_refund_request: "uuid, uuid",
  apply_reporter_payment: "text, text, integer, text, timestamptz",
};
const parameterDeclarations = {
  reserve_reporter_order: "p_profile_id uuid, p_application_id uuid, p_purpose text, p_required_consents jsonb",
  complete_reporter_order: "p_payment_id uuid, p_order_creation_token uuid, p_razorpay_order_id text",
  fail_reporter_order: "p_payment_id uuid, p_order_creation_token uuid",
  claim_razorpay_webhook_event: "p_event_id text, p_event_type text",
  complete_razorpay_payment_webhook: "p_event_id text, p_processing_token uuid, p_razorpay_order_id text, p_razorpay_payment_id text, p_amount_paise integer, p_currency text",
  complete_razorpay_refund_webhook: "p_event_id text, p_processing_token uuid, p_razorpay_refund_id text, p_razorpay_payment_id text, p_amount_paise integer, p_currency text",
  complete_razorpay_refund_failure_webhook: "p_event_id text, p_processing_token uuid, p_razorpay_refund_id text, p_razorpay_payment_id text, p_amount_paise integer, p_currency text",
  fail_razorpay_webhook_event: "p_event_id text, p_processing_token uuid, p_failure_detail text",
  reserve_reporter_refund: "p_payment_id uuid, p_actor_id uuid",
  record_reporter_refund_request: "p_payment_id uuid, p_refund_request_token uuid, p_razorpay_refund_id text, p_razorpay_payment_id text, p_amount_paise integer, p_currency text",
  fail_reporter_refund_request: "p_payment_id uuid, p_refund_request_token uuid",
  apply_reporter_payment: "p_razorpay_order_id text, p_razorpay_payment_id text, p_amount_paise integer, p_currency text, p_captured_at timestamptz",
};

function extractRpc(name) {
  const marker = `create or replace function public.${name}(`;
  const start = sql.indexOf(marker);
  assert.notEqual(start, -1, `missing ${name}`);
  const bodyStart = sql.indexOf("\nas $$\n", start);
  assert.notEqual(bodyStart, -1, `missing ${name} body`);
  const end = sql.indexOf("\n$$;", bodyStart);
  assert.notEqual(end, -1, `unterminated ${name}`);
  const definition = sql.slice(start, end + 4);
  const parametersEnd = definition.indexOf(")\nreturns");
  assert.notEqual(parametersEnd, -1, `missing ${name} signature terminator`);
  return {
    definition,
    body: sql.slice(bodyStart + "\nas $$\n".length, end),
    parameters: definition
      .slice(marker.length, parametersEnd)
      .replace(/\s+/gu, " ")
      .trim(),
  };
}

function assertSecured(name) {
  const rpc = extractRpc(name);
  assert.match(rpc.definition, /language plpgsql\s+security definer\s+set search_path = ''/u);
  assert.match(rpc.body, /if coalesce\(auth\.jwt\(\) ->> 'role', ''\) <> 'service_role'/u);
  return rpc.body;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

test("every Razorpay RPC has its exact signature and service-role-only privileges", () => {
  for (const [name, signature] of Object.entries(signatures)) {
    const rpc = extractRpc(name);
    assert.equal(rpc.parameters, parameterDeclarations[name]);
    const escapedName = escapeRegExp(name);
    const escapedSignature = escapeRegExp(signature);
    const statements = [...sql.matchAll(new RegExp(
      `(?:revoke|grant)[^;]*on function public\\.${escapedName}\\(${escapedSignature}\\)[^;]*;`,
      "gu",
    ))].map(([statement]) => statement.replace(/\s+/gu, " "));
    assert.deepEqual(statements, [
      `revoke all on function public.${name}(${signature}) from public, anon, authenticated, service_role;`,
      `grant execute on function public.${name}(${signature}) to service_role;`,
    ], `${name} must revoke every default/Data API role and grant only service_role`);
  }
});

test("order reservation alone owns actor purpose, state, consent, money, and lease checks", () => {
  const body = assertSecured("reserve_reporter_order");

  assert.match(body, /p_purpose not in \('application', 'renewal'\)/u);
  assert.match(body, /where id = p_application_id and profile_id = p_profile_id\s+for update/u);
  assert.match(body, /jsonb_array_length\(p_required_consents\) <> 6/u);
  assert.match(body, /reporter_consents\.notice_key = required ->> 'key'/u);
  assert.match(body, /reporter_consents\.notice_version = required ->> 'version'/u);
  assert.match(body, /reporter_consents\.withdrawn_at is null/u);
  assert.match(body, /current_application\.status not in \('draft', 'payment_pending'\)/u);
  assert.match(body, /current_payment\.payment_status = 'captured'[\s\S]*'state', 'paid'/u);
  assert.match(body, /current_payment\.payment_status = 'order_created'[\s\S]*'state', 'existing'/u);
  assert.match(body, /order_creation_reserved_at > reservation_time - interval '5 minutes'/u);
  assert.match(body, /current_reporter\.public_status = 'suspended'/u);
  assert.match(body, /10000,\s*'INR',\s*'order_creating'/u);
  assert.doesNotMatch(body, /apply_reporter_payment|refund_status = 'refunded'/u);
});

test("order completion and release each use their own row lock and reservation-token CAS", () => {
  const complete = assertSecured("complete_reporter_order");
  assert.match(complete, /where id = p_payment_id\s+for update/u);
  assert.match(complete, /payment_status <> 'order_creating'/u);
  assert.match(complete, /order_creation_token <> p_order_creation_token/u);
  assert.match(complete, /payment_status = 'order_created'/u);
  assert.match(complete, /order_creation_token = null/u);
  assert.match(complete, /length\(btrim\(p_razorpay_order_id\)\) > 100/u);

  const fail = assertSecured("fail_reporter_order");
  assert.match(fail, /where id = p_payment_id\s+for update/u);
  assert.match(fail, /payment_status <> 'order_creating'/u);
  assert.match(fail, /order_creation_token <> p_order_creation_token/u);
  assert.match(fail, /payment_status = 'failed'/u);
  assert.match(fail, /set status = 'draft'/u);
  assert.doesNotMatch(fail, /razorpay_payment_id\s*=/u);
});

test("Razorpay webhook claim owns durable insert, concurrency, and stale-crash recovery", () => {
  const body = assertSecured("claim_razorpay_webhook_event");

  assert.match(body, /p_event_type not in \(\s*'payment\.captured', 'order\.paid', 'refund\.processed', 'refund\.failed'\s*\)/u);
  assert.match(body, /insert into public\.webhook_events/u);
  assert.match(body, /'razorpay',[\s\S]*'pending',[\s\S]*claim_token/u);
  assert.match(body, /on conflict \(provider, provider_event_id\) do nothing/u);
  assert.match(body, /where provider = 'razorpay' and provider_event_id = btrim\(p_event_id\)\s+for update/u);
  assert.match(body, /current_event\.event_type <> p_event_type/u);
  assert.match(body, /processing_status = 'processed'[\s\S]*'state', 'processed'/u);
  assert.match(body, /processing_status = 'pending'[\s\S]*interval '5 minutes'[\s\S]*'state', 'busy'/u);
  assert.match(body, /processing_token = claim_token/u);
  assert.match(body, /attempt_count = current_event\.attempt_count \+ 1/u);
});

test("the initial captured-webhook function token-CASes its receipt around the atomic SQL payment owner", () => {
  const body = assertSecured("complete_razorpay_payment_webhook");

  assert.match(body, /where provider = 'razorpay' and provider_event_id = btrim\(p_event_id\)\s+for update/u);
  assert.match(body, /processing_status <> 'pending'/u);
  assert.match(body, /processing_token <> p_processing_token/u);
  assert.match(body, /event_type not in \('payment\.captured', 'order\.paid'\)/u);
  assert.match(body, /internal_payment_id := public\.apply_reporter_payment\(\s*p_razorpay_order_id,\s*p_razorpay_payment_id,\s*p_amount_paise,\s*p_currency,\s*processing_time\s*\)/u);
  assert.match(body, /processing_status = 'processed'/u);
  assert.match(body, /subject_type = 'reporter_payment'/u);
  assert.doesNotMatch(body, /membership_expires_at\s*=/u);
});

test("webhook failure owns only the current receipt token and safe failure vocabulary", () => {
  const body = assertSecured("fail_razorpay_webhook_event");

  assert.match(body, /p_failure_detail not in \(\s*'payload-mismatch', 'processing-failed'\s*\)/u);
  assert.match(body, /processing_status = 'failed'/u);
  assert.match(body, /processing_token = p_processing_token/u);
  assert.match(body, /processing_status = 'pending'/u);
  assert.doesNotMatch(body, /reporter_payments/u);
});

test("refund reservation alone owns admin, eligibility, stable-attempt, and lease checks", () => {
  const body = assertSecured("reserve_reporter_refund");

  assert.match(body, /where id = p_actor_id and role = 'admin' and is_active/u);
  assert.match(body, /where id = p_payment_id\s+for update/u);
  assert.match(body, /payment_status <> 'captured'/u);
  assert.match(body, /purpose <> 'application'/u);
  assert.match(body, /refund_eligible_at > reservation_time/u);
  assert.match(body, /refund_status not in \('refund_pending', 'refund_failed'\)/u);
  assert.match(body, /refund_status = 'refund_pending'[\s\S]*razorpay_refund_id is not null[\s\S]*'state', 'pending'/u);
  assert.match(body, /refund_request_reserved_at > reservation_time - interval '5 minutes'/u);
  assert.match(body, /refund_attempt_count = 0[\s\S]*refund_status = 'refund_failed'[\s\S]*refund_attempt_count \+ 1[\s\S]*else current_payment\.refund_attempt_count/u);
  assert.match(body, /refund_status = 'refund_pending'/u);
  assert.match(body, /refund_attempt_count = next_attempt/u);
  assert.match(body, /'amount_paise', current_payment\.amount_paise/u);
  assert.match(body, /'currency', current_payment\.currency/u);
});

test("refund request recording verifies exact fixed money and reservation-token CAS", () => {
  const body = assertSecured("record_reporter_refund_request");

  assert.match(body, /p_amount_paise <> 10000 or p_currency <> 'INR'/u);
  assert.match(body, /length\(btrim\(p_razorpay_refund_id\)\) > 100/u);
  assert.match(body, /where id = p_payment_id\s+for update/u);
  assert.match(body, /current_payment\.razorpay_payment_id <> btrim\(p_razorpay_payment_id\)/u);
  assert.match(body, /refund_status <> 'refund_pending'/u);
  assert.match(body, /refund_request_token <> p_refund_request_token/u);
  assert.match(body, /razorpay_refund_id is not null/u);
  assert.match(body, /set razorpay_refund_id = btrim\(p_razorpay_refund_id\)/u);
  assert.doesNotMatch(body, /set\s+refund_status = 'refunded'/u);
});

test("definite local refund release changes only the exact unaccepted reservation", () => {
  const body = assertSecured("fail_reporter_refund_request");

  assert.match(body, /refund_status = 'refund_failed'/u);
  assert.match(body, /where id = p_payment_id/u);
  assert.match(body, /refund_status = 'refund_pending'/u);
  assert.match(body, /razorpay_refund_id is null/u);
  assert.match(body, /refund_request_token = p_refund_request_token/u);
  assert.doesNotMatch(body, /payment_status\s*=|refunded_at\s*=/u);
});

test("processed refund confirmation verifies event token, identifiers, money, and pending state", () => {
  const body = assertSecured("complete_razorpay_refund_webhook");

  assert.match(body, /p_amount_paise <> 10000 or p_currency <> 'INR'/u);
  assert.match(body, /where provider = 'razorpay' and provider_event_id = btrim\(p_event_id\)\s+for update/u);
  assert.match(body, /processing_status <> 'pending'/u);
  assert.match(body, /processing_token <> p_processing_token/u);
  assert.match(body, /event_type <> 'refund\.processed'/u);
  assert.match(body, /where razorpay_payment_id = btrim\(p_razorpay_payment_id\)\s+for update/u);
  assert.match(body, /payment_status <> 'captured'/u);
  assert.match(body, /refund_status not in \('refund_pending', 'refund_failed', 'refunded'\)/u);
  assert.match(body, /razorpay_refund_id <> btrim\(p_razorpay_refund_id\)/u);
  assert.match(body, /refund_status = 'refunded'/u);
  assert.match(body, /processing_status = 'processed'/u);
});

test("failed refund confirmation verifies the same exact event/payment boundary", () => {
  const body = assertSecured("complete_razorpay_refund_failure_webhook");

  assert.match(body, /p_amount_paise <> 10000 or p_currency <> 'INR'/u);
  assert.match(body, /processing_status <> 'pending'/u);
  assert.match(body, /processing_token <> p_processing_token/u);
  assert.match(body, /event_type <> 'refund\.failed'/u);
  assert.match(body, /where razorpay_payment_id = btrim\(p_razorpay_payment_id\)\s+for update/u);
  assert.match(body, /payment_status <> 'captured'/u);
  assert.match(body, /refund_status <> 'refund_pending'/u);
  assert.match(body, /refund_status = 'refund_failed'/u);
  assert.match(body, /refund_failure_detail = 'provider-confirmed-failure'/u);
});

test("the initial apply_reporter_payment owns fixed money, capture deadline, and atomic state changes", () => {
  const body = assertSecured("apply_reporter_payment");

  assert.match(body, /p_amount_paise <> 10000 or p_currency <> 'INR'/u);
  assert.match(body, /where razorpay_order_id = p_razorpay_order_id\s+for update/u);
  assert.match(body, /payment_status = 'captured'[\s\S]*razorpay_payment_id = p_razorpay_payment_id[\s\S]*return current_payment\.id/u);
  assert.match(body, /payment_status <> 'order_created'/u);
  assert.match(body, /where id = current_payment\.application_id\s+for update/u);
  assert.match(body, /current_application\.status <> 'payment_pending'/u);
  assert.match(body, /status = 'kyc_pending'/u);
  assert.match(body, /completion_deadline = p_captured_at \+ interval '30 days'/u);
  assert.match(body, /where profile_id = current_payment\.profile_id\s+for update/u);
  assert.match(body, /current_reporter\.public_status = 'suspended'/u);
  assert.match(body, /credited_expiry := credited_start \+ interval '1 year'/u);
  assert.match(body, /membership_expires_at = credited_expiry/u);
  assert.match(body, /'reporter\.payment_captured'/u);
});

test("provider payloads and errors are absent from every payment lifecycle RPC", () => {
  for (const name of Object.keys(signatures)) {
    const { body } = extractRpc(name);
    assert.doesNotMatch(body, /raw_body|payload json|provider_error/iu, name);
  }
});
