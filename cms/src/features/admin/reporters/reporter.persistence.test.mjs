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

function compact(value) {
  return value.replace(/\s+/gu, " ").trim();
}

function rpc(name, signatureStart = "") {
  const marker = `create or replace function public.${name}(${signatureStart}`;
  const start = migration.indexOf(marker);
  assert.notEqual(start, -1, `missing ${name}`);
  const end = migration.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `unterminated ${name}`);
  return compact(migration.slice(start, end + 4));
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
