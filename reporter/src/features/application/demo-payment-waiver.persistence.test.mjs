import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260831100000_reporter_demo_payment_waiver.sql",
  import.meta.url,
);
const typesUrl = new URL("../../../../packages/database/src/database.types.ts", import.meta.url);
const compact = (value) => value.replace(/\s+/gu, " ").trim();

function sqlFunction(sql, name) {
  const match = sql.match(new RegExp(`create or replace function public\\.${name}\\b[\\s\\S]*?\\$\\$;`, "u"));
  assert.ok(match, `missing ${name} function`);
  return compact(match[0]);
}

test("demo waivers are private durable evidence separate from reporter payments", async () => {
  const sql = compact(await readFile(migrationUrl, "utf8"));

  assert.match(sql, /create table public\.reporter_demo_payment_waivers/u);
  assert.match(sql, /application_id uuid primary key/u);
  assert.match(sql, /foreign key \(application_id, profile_id\) references public\.reporter_applications \(id, profile_id\)/u);
  assert.match(sql, /waived_at timestamptz not null/u);
  assert.match(sql, /alter table public\.reporter_demo_payment_waivers enable row level security/u);
  assert.match(sql, /revoke all on table public\.reporter_demo_payment_waivers from public, anon, authenticated/u);
  assert.match(sql, /grant select, insert on table public\.reporter_demo_payment_waivers to service_role/u);
  assert.doesNotMatch(sql, /create policy[^;]+reporter_demo_payment_waivers/u);
});

test("demo waiver RPC owns identity, consent, payment, state, audit, and idempotency checks", async () => {
  const sql = compact(await readFile(migrationUrl, "utf8"));
  const waiver = sqlFunction(sql, "waive_demo_reporter_application_payment");

  assert.match(waiver, /security definer set search_path = ''/u);
  assert.match(waiver, /auth\.jwt\(\) ->> 'role'.*'service_role'/u);
  assert.match(waiver, /from public\.reporter_applications .* id = p_application_id and profile_id = p_profile_id .* for update/u);
  assert.match(waiver, /from public\.profiles .*where (?:\w+\.)?id = p_profile_id for update/u);
  assert.match(waiver, /current_profile\.role <> 'reader'/u);
  assert.match(waiver, /not current_profile\.is_active/u);
  assert.match(waiver, /from auth\.users/u);
  assert.match(waiver, /919000000829/u);
  assert.match(waiver, /reporter_demo_identity/u);
  assert.match(waiver, /from public\.reporter_profiles/u);
  assert.match(waiver, /payment_refund.*1\.0.*kyc.*1\.0.*public_identity.*1\.0.*mandatory_location.*1\.0.*recording.*1\.0.*editorial_terms.*1\.0/u);
  assert.match(waiver, /withdrawn_at is null/u);
  assert.match(waiver, /from public\.reporter_payments/u);
  assert.match(waiver, /current_application\.status not in \('draft', 'payment_pending'\)/u);
  assert.match(waiver, /insert into public\.reporter_demo_payment_waivers/u);
  assert.match(waiver, /status = 'kyc_pending'/u);
  assert.match(waiver, /completion_deadline = transition_time \+ interval '30 days'/u);
  assert.match(waiver, /'reporter\.demo_payment_waived'/u);
  assert.match(waiver, /'demo_only', true/u);
  assert.match(waiver, /existing_waiver/u);
  assert.match(waiver, /existing_audit_count <> 1/u);
  assert.doesNotMatch(waiver, /insert into public\.reporter_payments/u);
  assert.doesNotMatch(waiver, /update public\.profiles|update public\.reporter_profiles|update auth\.users/u);
});

test("demo waiver RPC is service-role only and exposed in generated contracts", async () => {
  const [sql, types] = await Promise.all([
    readFile(migrationUrl, "utf8").then(compact),
    readFile(typesUrl, "utf8").then(compact),
  ]);

  assert.match(sql, /revoke all on function public\.waive_demo_reporter_application_payment\(uuid, uuid\) from public, anon, authenticated, service_role/u);
  assert.match(sql, /grant execute on function public\.waive_demo_reporter_application_payment\(uuid, uuid\) to service_role/u);
  assert.doesNotMatch(sql, /grant execute[^;]+to (?:anon|authenticated)/u);
  assert.match(types, /reporter_demo_payment_waivers:/u);
  assert.match(types, /waive_demo_reporter_application_payment: \{ Args: \{ p_profile_id: string; p_application_id: string \}; Returns: Json \}/u);
});
