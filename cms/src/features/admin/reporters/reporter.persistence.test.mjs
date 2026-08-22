import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../../../../../supabase/migrations/20260822110000_reporter_administration.sql",
    import.meta.url,
  ),
  "utf8",
);
const coordination = await readFile(
  new URL(
    "../../../../../supabase/migrations/20260822120000_reporter_access_sync_coordination.sql",
    import.meta.url,
  ),
  "utf8",
).catch(() => "");

function compact(value) {
  return value.replace(/\s+/gu, " ").trim();
}

function rpc(name, signatureStart = "", source = migration) {
  const marker = `create or replace function public.${name}(${signatureStart}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing ${name}`);
  const end = source.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `unterminated ${name}`);
  return compact(source.slice(start, end + 4));
}

test("approval atomically owns public portrait confirmation and every eligibility check", () => {
  const approval = rpc("approve_reporter_application", "\n  p_application_id uuid,");
  assert.match(approval, /p_public_photo_identity_match boolean/u);
  assert.match(approval, /where id = actor_id and role = 'admin' and is_active/u);
  assert.match(approval, /from public\.reporter_applications .* for update/u);
  assert.match(approval, /kyc_status <> 'verified'/u);
  assert.match(approval, /verified_legal_name is null/u);
  assert.match(approval, /verified_adult is distinct from true/u);
  assert.match(approval, /p_public_photo_identity_match is distinct from true/u);
  assert.match(approval, /from public\.reporter_payments .* for update/u);
  assert.match(approval, /amount_paise <> 10000/u);
  assert.match(approval, /currency <> 'INR'/u);
  assert.match(approval, /payment_status <> 'captured'/u);
  for (const key of [
    "payment_refund",
    "kyc",
    "public_identity",
    "mandatory_location",
    "recording",
    "editorial_terms",
  ]) {
    assert.match(approval, new RegExp(`'${key}', '1\\.0'`, "u"));
  }
  assert.match(approval, /withdrawn_at is null/u);
  assert.match(approval, /public_photo_verified_by = actor_id/u);
  assert.match(approval, /public_photo_verified_at = approval_time/u);
  assert.match(approval, /current_profile\.role <> 'reader'/u);
  assert.match(approval, /access_sync_status.*'pending'/u);
  assert.match(approval, /access_sync_operation.*'approval'/u);
});

test("rejection is reasoned, idempotent, and queues exactly one refundable payment", () => {
  const rejection = rpc("reject_reporter_application", "\n  p_application_id uuid,");
  assert.match(rejection, /where id = actor_id and role = 'admin' and is_active/u);
  assert.match(rejection, /length\(btrim\(p_decision_reason\)\) = 0/u);
  assert.match(rejection, /current_application\.status = 'rejected'/u);
  assert.match(rejection, /return current_payment\.id/u);
  assert.match(rejection, /refund_status = 'refund_pending'/u);
  assert.match(rejection, /refund_eligible_at = rejection_time/u);
  assert.doesNotMatch(rejection, /razorpay\.com|http|refund_requested_at\s*=/u);
});

test("suspension fails closed in one transaction without refunding", () => {
  const suspension = rpc("suspend_reporter", "\n  p_profile_id uuid,");
  assert.match(suspension, /where id = actor_id and role = 'admin' and is_active/u);
  assert.match(suspension, /from public\.reporter_profiles .* for update/u);
  assert.match(suspension, /from public\.profiles .* for update/u);
  assert.match(suspension, /public_status = 'suspended'/u);
  assert.match(suspension, /can_publish_directly = false/u);
  assert.match(suspension, /can_broadcast_live = false/u);
  assert.match(suspension, /access_sync_status = 'pending'/u);
  assert.match(suspension, /access_sync_operation = 'suspension'/u);
  assert.match(suspension, /set is_active = false/u);
  assert.match(suspension, /'session_revocation', 'unsupported-user-id-api'/u);
  assert.doesNotMatch(suspension, /reporter_payments|refund/u);
});

test("reinstatement queues signed access but never restores trust flags", () => {
  const reinstatement = rpc("reinstate_reporter", "p_profile_id uuid");
  assert.match(reinstatement, /membership_expires_at >= reinstatement_time/u);
  assert.match(reinstatement, /membership_grace_ends_at >= reinstatement_time/u);
  assert.match(reinstatement, /'active'.*'grace'.*'expired'/u);
  assert.match(reinstatement, /can_publish_directly = false/u);
  assert.match(reinstatement, /can_broadcast_live = false/u);
  assert.match(reinstatement, /access_sync_status = 'pending'/u);
  assert.match(reinstatement, /access_sync_operation = 'reinstatement'/u);
  assert.match(reinstatement, /set is_active = true/u);
});

test("access synchronization is admin-only, auditable, and retryable", () => {
  const completion = rpc("complete_reporter_access_sync", "\n  p_profile_id uuid,");
  assert.match(completion, /where id = actor_id and role = 'admin' and is_active/u);
  assert.match(completion, /from public\.reporter_profiles .* for update/u);
  assert.match(completion, /current_reporter\.access_sync_operation <> p_operation/u);
  assert.match(completion, /access_sync_status = case when p_succeeded then 'succeeded' else 'failed' end/u);
  assert.match(completion, /'reporter\.access_sync_succeeded'|reporter\.access_sync_failed/u);
  const sql = compact(migration);
  assert.match(sql, /grant execute on function public\.complete_reporter_access_sync\(uuid, text, boolean, text\) to authenticated/u);
  assert.doesNotMatch(sql, /grant execute on function public\.complete_reporter_access_sync\([^;]+to (?:anon|public)/u);
});

test("reporter-owned RLS checks current active database state, not a stale role claim", () => {
  assert.match(migration, /drop policy "Applicants can read their own applications"/u);
  assert.match(migration, /drop policy "Applicants can read their own payments"/u);
  assert.match(migration, /drop policy "Applicants can read their own consent receipts"/u);
  assert.match(migration, /drop policy "Reporters can read their own reporter profile"/u);
  assert.match(migration, /profiles\.is_active/u);
  assert.match(migration, /reporter_profiles\.access_sync_status = 'succeeded'/u);
  assert.match(migration, /reporter_profiles\.public_status <> 'suspended'/u);
  assert.match(migration, /drop policy "Reporters can read their own notifications"/u);
  assert.match(migration, /drop policy "Reporters can mark their own notifications read"/u);
});

test("reporter administration reads require both signed and active database admin state", () => {
  for (const policy of [
    "Admins can read reporter applications",
    "Admins can read reporter profiles",
    "Admins can read reporter payments",
    "Admins can read reporter consent receipts",
    "Admins can read reporter notifications",
    "Admins can read audit events",
  ]) {
    assert.match(migration, new RegExp(`drop policy "${policy}"`, "u"));
  }
  assert.match(migration, /auth\.jwt\(\) -> 'app_metadata' ->> 'role'\) = 'admin'/u);
  assert.match(migration, /where profiles\.id = \(select auth\.uid\(\)\)[\s\S]*profiles\.role = 'admin'[\s\S]*profiles\.is_active/u);
});

test("every desired signed-role transition advances state without admitting a second lease holder", () => {
  const approval = rpc("approve_reporter_application", "\n  p_application_id uuid,", coordination);
  const suspension = rpc("suspend_reporter", "\n  p_profile_id uuid,", coordination);
  const reinstatement = rpc("reinstate_reporter", "p_profile_id uuid", coordination);
  assert.match(approval, /access_sync_generation[\s\S]*access_sync_desired_role[\s\S]*access_sync_claim_token/u);
  assert.match(approval, /1,[\s\S]*'reporter',[\s\S]*null,[\s\S]*null,[\s\S]*null/u);
  for (const transition of [suspension, reinstatement]) {
    assert.match(transition, /access_sync_generation = current_reporter\.access_sync_generation \+ 1/u);
    assert.match(transition, /access_sync_status = 'pending'/u);
    assert.doesNotMatch(transition, /access_sync_claim_token = null/u);
    assert.doesNotMatch(transition, /access_sync_claimed_at = null/u);
    assert.doesNotMatch(transition, /access_sync_claim_generation = null/u);
  }
  assert.match(suspension, /access_sync_desired_role = 'none'/u);
  assert.match(reinstatement, /access_sync_desired_role = 'reporter'/u);
});

test("claim RPC serializes a current generation with a reclaimable single-holder lease", () => {
  const claim = rpc("claim_reporter_access_sync", "p_profile_id uuid", coordination);
  assert.match(coordination, /create table public\.reporter_access_sync_attempts/u);
  assert.match(coordination, /alter table public\.reporter_access_sync_attempts enable row level security/u);
  assert.match(compact(coordination), /revoke all on table public\.reporter_access_sync_attempts from public, anon, authenticated, service_role/u);
  assert.match(claim, /where id = actor_id and role = 'admin' and is_active/u);
  assert.match(claim, /from public\.reporter_profiles[\s\S]*for update/u);
  assert.match(claim, /access_sync_claimed_at > claim_time - interval '5 minutes'/u);
  assert.match(claim, /jsonb_build_object\(\s*'state', 'busy'/u);
  assert.match(claim, /claim_token uuid := gen_random_uuid\(\)/u);
  assert.match(claim, /access_sync_claim_token = claim_token/u);
  assert.match(claim, /access_sync_claim_generation = current_reporter\.access_sync_generation/u);
  assert.match(claim, /insert into public\.reporter_access_sync_attempts/u);
  assert.match(claim, /current_reporter\.access_sync_desired_role/u);
  assert.match(claim, /'generation', current_reporter\.access_sync_generation/u);
  assert.match(claim, /'desired_role', current_reporter\.access_sync_desired_role/u);
  const sql = compact(coordination);
  assert.match(sql, /revoke all on function public\.claim_reporter_access_sync\(uuid\) from public, anon, authenticated, service_role/u);
  assert.match(sql, /grant execute on function public\.claim_reporter_access_sync\(uuid\) to authenticated/u);
});

test("completion is generation-and-token CAS with monotonic terminal success", () => {
  const completion = rpc("complete_reporter_access_sync", "\n  p_profile_id uuid,", coordination);
  assert.match(coordination, /add column access_sync_completed_token uuid/u);
  assert.match(completion, /p_generation bigint/u);
  assert.match(completion, /p_claim_token uuid/u);
  assert.match(completion, /from public\.reporter_access_sync_attempts[\s\S]*claim_token = p_claim_token[\s\S]*for update/u);
  assert.match(completion, /current_attempt\.completion_status = 'succeeded'[\s\S]*'state', 'succeeded'/u);
  assert.match(completion, /current_reporter\.access_sync_claim_token is not distinct from p_claim_token/u);
  assert.match(completion, /current_reporter\.access_sync_claim_generation is not distinct from p_generation/u);
  assert.match(completion, /current_reporter\.access_sync_generation \+ 1[\s\S]*access_sync_status = 'pending'/u);
  assert.match(completion, /access_sync_claim_token = null/u);
  assert.match(completion, /access_sync_claimed_at = null/u);
  assert.match(completion, /access_sync_completed_token = case when p_succeeded then p_claim_token else null end/u);
  assert.match(completion, /'reporter\.access_sync_succeeded'/u);
  assert.match(completion, /'reporter\.access_sync_failed'/u);
  assert.match(completion, /'reporter\.access_sync_stale_succeeded'/u);
  assert.match(completion, /'reporter\.access_sync_stale_failed'/u);
  const sql = compact(coordination);
  assert.match(sql, /revoke all on function public\.complete_reporter_access_sync\(uuid, bigint, uuid, boolean, text\) from public, anon, authenticated, service_role/u);
  assert.match(sql, /grant execute on function public\.complete_reporter_access_sync\(uuid, bigint, uuid, boolean, text\) to authenticated/u);
});

test("suspension audit is truthful and access-sync audit owns claim outcome", () => {
  const suspension = rpc("suspend_reporter", "\n  p_profile_id uuid,", coordination);
  const completion = rpc("complete_reporter_access_sync", "\n  p_profile_id uuid,", coordination);
  assert.match(suspension, /'database_access', 'disabled'/u);
  assert.match(suspension, /'trust_flags', 'disabled'/u);
  assert.match(suspension, /'signed_claim_sync', 'pending'/u);
  assert.doesNotMatch(suspension, /database-and-signed-claim|claim_revoked/u);
  assert.match(completion, /'generation', p_generation/u);
  assert.match(completion, /'desired_role', current_attempt\.desired_role/u);
});

test("suspension provenance prevents reactivating independently inactive profiles", () => {
  const suspension = rpc("suspend_reporter", "\n  p_profile_id uuid,", coordination);
  const reinstatement = rpc("reinstate_reporter", "p_profile_id uuid", coordination);
  assert.match(coordination, /add column reporter_suspension_token uuid/u);
  assert.match(coordination, /add column suspension_token uuid/u);
  assert.match(suspension, /if not current_profile\.is_active then/u);
  assert.match(suspension, /new_suspension_token uuid := gen_random_uuid\(\)/u);
  assert.match(suspension, /reporter_suspension_token = new_suspension_token/u);
  assert.match(reinstatement, /current_profile\.reporter_suspension_token is distinct from current_reporter\.suspension_token/u);
  assert.match(reinstatement, /current_profile\.reporter_suspension_reason <> current_reporter\.suspension_reason/u);
  assert.match(reinstatement, /reporter_suspension_token = null/u);
  assert.match(reinstatement, /suspension_token = null/u);
  assert.match(coordination, /revoke update on table public\.profiles from authenticated/u);
});
