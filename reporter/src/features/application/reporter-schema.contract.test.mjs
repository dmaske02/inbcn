import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../../../../supabase/migrations/20260822090000_reporter_foundation.sql",
    import.meta.url,
  ),
  "utf8",
);
const databaseTypes = await readFile(
  new URL("../../../../packages/database/src/database.types.ts", import.meta.url),
  "utf8",
);

const compact = (value) => value.replace(/\s+/gu, " ").trim();

function sqlFunction(name) {
  const match = migration.match(
    new RegExp(
      `create or replace function public\\.${name}\\b[\\s\\S]*?\\$\\$;`,
      "u",
    ),
  );
  assert.ok(match, `missing ${name} function`);
  return compact(match[0]);
}

function sqlSection(start, end) {
  const startAt = migration.indexOf(start);
  const endAt = migration.indexOf(end, startAt);
  assert.notEqual(startAt, -1, `missing section start: ${start}`);
  assert.notEqual(endAt, -1, `missing section end: ${end}`);
  return migration.slice(startAt, endAt);
}

test("reporter foundation enables RLS and protects provider identifiers", () => {
  for (const table of [
    "reporter_applications",
    "reporter_profiles",
    "reporter_payments",
    "reporter_consents",
    "webhook_events",
    "reporter_notifications",
    "audit_events",
  ]) {
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} enable row level security`, "u"),
    );
  }
  assert.match(migration, /unique \(razorpay_order_id\)/u);
  assert.match(migration, /unique \(provider, provider_event_id\)/u);
  assert.doesNotMatch(migration, /aadhaar_number|aadhaar_otp|raw_xml/iu);
});

test("reporter payments enforce the fixed fee and generated reporter role", () => {
  const sql = compact(migration);
  assert.match(
    sql,
    /amount_paise integer not null default 10000 check \(amount_paise = 10000\)/u,
  );
  assert.match(
    sql,
    /currency text not null default 'INR' check \(currency = 'INR'\)/u,
  );
  assert.match(
    databaseTypes,
    /profile_role: "admin" \| "editor" \| "writer" \| "broadcaster" \| "reader" \| "reporter"/u,
  );
  assert.match(
    compact(databaseTypes),
    /profile_role: \["admin", "editor", "writer", "broadcaster", "reader", "reporter"\]/u,
  );
});

test("paid incomplete applications become refund pending atomically after deadline", () => {
  const overdue = sqlFunction("mark_overdue_reporter_application");
  const signature = overdue.slice(0, overdue.indexOf("returns uuid"));

  assert.match(signature, /\(\s*p_application_id uuid\s*\)/u);
  assert.doesNotMatch(signature, /timestamp/iu);
  assert.match(overdue, /security definer set search_path = ''/u);
  assert.match(overdue, /auth\.jwt\(\) ->> 'role'.*'service_role'/u);
  assert.match(
    overdue,
    /transition_time timestamptz := clock_timestamp\(\)/u,
  );
  assert.match(overdue, /from public\.reporter_applications .* for update/u);
  assert.match(overdue, /from public\.reporter_payments .* for update/u);
  assert.match(overdue, /status <> 'kyc_pending'/u);
  assert.match(overdue, /completion_deadline > transition_time/u);
  assert.match(overdue, /payment_status <> 'captured'/u);
  assert.match(overdue, /refund_status <> 'not_eligible'/u);
  assert.match(overdue, /status = 'cancelled'/u);
  assert.match(overdue, /refund_status = 'refund_pending'/u);
  assert.match(overdue, /refund_eligible_at = transition_time/u);
  assert.match(overdue, /insert into public\.audit_events/u);
  assert.match(
    compact(migration),
    /revoke all on function public\.mark_overdue_reporter_application\(uuid\) from public, anon, authenticated, service_role;/u,
  );
  assert.match(
    compact(migration),
    /grant execute on function public\.mark_overdue_reporter_application\(uuid\) to service_role;/u,
  );
  assert.doesNotMatch(
    compact(migration),
    /grant execute on function public\.mark_overdue_reporter_application\(uuid\) to (?:public|anon|authenticated)/u,
  );
  assert.match(
    compact(databaseTypes),
    /mark_overdue_reporter_application: \{ Args: \{ p_application_id: string \}; Returns: string \}/u,
  );
});

test("first approval starts a one-year membership with seven days of grace", () => {
  const approval = sqlFunction("approve_reporter_application");

  assert.match(approval, /approval_time timestamptz := clock_timestamp\(\)/u);
  assert.match(
    approval,
    /expiry_time timestamptz := approval_time \+ interval '1 year'/u,
  );
  assert.match(
    approval,
    /insert into public\.reporter_profiles \(.*membership_started_at, membership_expires_at, membership_grace_ends_at.*\) values \(.*approval_time, expiry_time, expiry_time \+ interval '7 days'/u,
  );
});

test("KYC references are unique and required once processing starts", () => {
  const sql = compact(migration);
  assert.match(
    sql,
    /create unique index reporter_applications_kyc_reference_key on public\.reporter_applications \(kyc_provider, kyc_reference\) where kyc_provider is not null and kyc_reference is not null;/u,
  );
  assert.match(
    sql,
    /kyc_status not in \('pending', 'verified'\).*kyc_provider is not null.*kyc_reference is not null/u,
  );
  assert.match(
    sql,
    /\(kyc_provider is null and kyc_reference is null\)/u,
  );
});

test("KYC webhook claims use an atomic lease and token-CAS completion", () => {
  const claim = sqlFunction("claim_kyc_webhook_event");
  const complete = sqlFunction("complete_kyc_webhook_event");
  const fail = sqlFunction("fail_kyc_webhook_event");
  const sql = compact(migration);

  assert.match(sql, /processing_token uuid/u);
  assert.match(claim, /from public\.webhook_events .* for update/u);
  assert.match(claim, /processing_status = 'processed'/u);
  assert.match(claim, /processing_status = 'pending'.*interval '5 minutes'/u);
  assert.match(claim, /attempt_count = current_event\.attempt_count \+ 1/u);
  assert.match(claim, /processing_token = claim_token/u);
  assert.match(claim, /'state', 'busy'/u);
  assert.match(claim, /'state', 'claimed'.*'token', claim_token/u);
  for (const transition of [complete, fail]) {
    assert.match(transition, /processing_token = p_processing_token/u);
    assert.match(transition, /processing_status = 'pending'/u);
  }
  assert.match(complete, /processing_status = 'processed'/u);
  assert.match(fail, /processing_status = 'failed'/u);
  assert.match(
    compact(databaseTypes),
    /claim_kyc_webhook_event: \{ Args: \{ p_event_id: string; p_event_type: string \}; Returns: Json \}/u,
  );
});

test("KYC session creation is serialized by a stale-safe reservation token", () => {
  const reserve = sqlFunction("reserve_reporter_kyc_start");
  const complete = sqlFunction("complete_reporter_kyc_start");
  const release = sqlFunction("release_reporter_kyc_start");

  assert.match(reserve, /from public\.reporter_applications .* for update/u);
  assert.match(reserve, /status <> 'kyc_pending'/u);
  assert.match(reserve, /kyc_start_reserved_at > reservation_time - interval '5 minutes'/u);
  assert.match(reserve, /kyc_start_token = reservation_token/u);
  for (const transition of [complete, release]) {
    assert.match(transition, /kyc_start_token = p_reservation_token/u);
    assert.match(transition, /status = 'kyc_pending'/u);
  }
  assert.match(complete, /kyc_reference = btrim\(p_reference\)/u);
  assert.match(complete, /kyc_start_token = null/u);
  assert.match(release, /kyc_start_token = null/u);
});

test("public reporter view contains only the approved projection", () => {
  const view = sqlSection(
    "create view public.public_reporter_profiles",
    "alter table public.reporter_applications enable row level security",
  );
  const reporterFields = [
    ...view.matchAll(/reporter_profiles\.([a-z_]+)/gu),
  ]
    .map((match) => match[1])
    .sort();

  assert.deepEqual(reporterFields, [
    "avatar_url",
    "beats",
    "bio",
    "home_district",
    "legal_display_name",
    "profile_id",
    "public_slug",
    "public_status",
  ]);
  assert.match(view, /as published_story_count/u);
  assert.doesNotMatch(
    view,
    /date_of_birth|home_city|home_state|kyc_|razorpay_|reviewed_|decision_reason|can_publish|can_broadcast/iu,
  );
});

test("service grants preserve audit history and webhook identity", () => {
  const grants = sqlSection(
    "revoke all on table",
    'create policy "Applicants can create their own draft application"',
  );
  const statements = grants
    .split(";")
    .map(compact)
    .filter(Boolean)
    .map((statement) => `${statement};`);
  const serviceRevokes = statements.filter(
    (statement) =>
      statement.startsWith("revoke all on table") &&
      statement.endsWith("from service_role;"),
  );
  const auditGrants = statements.filter(
    (statement) =>
      statement.startsWith("grant") &&
      statement.includes("public.audit_events") &&
      statement.endsWith("to service_role;"),
  );
  const webhookGrants = statements.filter(
    (statement) =>
      statement.startsWith("grant") &&
      statement.includes("public.webhook_events") &&
      statement.endsWith("to service_role;"),
  );
  const serviceGrants = statements.filter(
    (statement) =>
      statement.startsWith("grant") && statement.endsWith("to service_role;"),
  );

  assert.equal(serviceRevokes.length, 1);
  assert.match(serviceRevokes[0], /public\.audit_events/u);
  assert.match(serviceRevokes[0], /public\.webhook_events/u);
  assert.deepEqual(auditGrants, [
    "grant select, insert on table public.audit_events to service_role;",
  ]);
  assert.deepEqual(webhookGrants, [
    "grant select, insert on table public.webhook_events to service_role;",
    "grant update ( processing_status, attempt_count, failure_detail, subject_type, subject_id, processed_at, updated_at ) on table public.webhook_events to service_role;",
  ]);
  assert.doesNotMatch(serviceGrants.join(" "), /grant all|\bdelete\b/iu);
});
