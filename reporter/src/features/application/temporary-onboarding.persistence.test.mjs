import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260824170000_temporary_reporter_onboarding.sql",
  import.meta.url,
);
const typesUrl = new URL("../../../../packages/database/src/database.types.ts", import.meta.url);
const verificationUrl = new URL(
  "../../../../supabase/verification/reporter-lifecycle-verification.sql",
  import.meta.url,
);
const compact = (value) => value.replace(/\s+/gu, " ").trim();

function sqlFunction(sql, name) {
  const match = sql.match(new RegExp(`create or replace function public\\.${name}\\b[\\s\\S]*?\\$\\$;`, "u"));
  assert.ok(match, `missing ${name} function`);
  return compact(match[0]);
}

test("temporary onboarding records explicit evidence and preserves editorial gates", async () => {
  const sql = compact(await readFile(migrationUrl, "utf8"));
  const payment = sqlFunction(sql, "complete_temporary_reporter_payment");
  const approval = sqlFunction(sql, "complete_temporary_reporter_kyc_approval");

  assert.match(payment, /auth\.jwt\(\) ->> 'role'.*'service_role'/u);
  assert.match(payment, /amount_paise[^;]+10000/u);
  assert.match(payment, /payment_provider[^;]+'temporary'/u);
  assert.match(approval, /kyc_provider[^;]+'temporary'/u);
  assert.match(approval, /can_publish_directly[^;]+false/u);
  assert.match(approval, /can_broadcast_live[^;]+true/u);
  assert.match(approval, /access_sync_status[^;]+'pending'/u);
  assert.match(sql, /to service_role/u);
  assert.doesNotMatch(sql, /to (?:anon|authenticated)/u);
});

test("temporary access synchronization is service-only and generation-fenced", async () => {
  const sql = compact(await readFile(migrationUrl, "utf8"));
  const claim = sqlFunction(sql, "claim_temporary_reporter_access_sync");
  const complete = sqlFunction(sql, "complete_temporary_reporter_access_sync");

  assert.match(claim, /access_sync_operation is distinct from 'approval'/u);
  assert.match(claim, /access_sync_desired_role is distinct from 'reporter'/u);
  assert.match(claim, /'state', 'claimed'/u);
  assert.match(claim, /'state', 'busy'/u);
  assert.match(complete, /access_sync_generation <> p_generation/u);
  assert.match(complete, /access_sync_claim_token is distinct from p_claim_token/u);
  assert.match(complete, /auth-claim-update-failed/u);
});

test("database contracts expose temporary provenance and RPCs", async () => {
  const types = compact(await readFile(typesUrl, "utf8"));

  assert.match(types, /review_mode: string/u);
  assert.match(types, /payment_provider: string/u);
  assert.match(types, /public_photo_verification_mode: string/u);
  assert.match(types, /live_broadcast_grant_mode: string/u);
  assert.match(types, /claim_temporary_reporter_access_sync: \{ Args: \{ p_profile_id: string \}; Returns: Json \}/u);
  assert.match(types, /complete_temporary_reporter_payment: \{ Args: \{ p_profile_id: string; p_application_id: string \} Returns: Json \}/u);
});

test("rollback verification proves temporary retries and editorial defaults", async () => {
  const verification = compact(await readFile(verificationUrl, "utf8"));

  assert.match(verification, /complete_temporary_reporter_payment/u);
  assert.match(verification, /complete_temporary_reporter_kyc_approval/u);
  assert.match(verification, /temporary onboarding retries duplicated evidence/u);
  assert.match(verification, /reporter\.can_publish_directly/u);
  assert.match(verification, /not reporter\.can_broadcast_live/u);
  assert.match(verification, /rollback;/u);
});
