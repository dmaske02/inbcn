import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260822100000_razorpay_payment_lifecycle.sql",
  import.meta.url,
);

test("payment lifecycle migration owns order, webhook, and refund races", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  for (const name of [
    "reserve_reporter_order",
    "complete_reporter_order",
    "fail_reporter_order",
    "claim_razorpay_webhook_event",
    "complete_razorpay_payment_webhook",
    "complete_razorpay_refund_webhook",
    "complete_razorpay_refund_failure_webhook",
    "fail_razorpay_webhook_event",
    "reserve_reporter_refund",
    "record_reporter_refund_request",
    "fail_reporter_refund_request",
  ]) {
    assert.match(sql, new RegExp(`function public\\.${name}\\(`, "u"));
  }
  assert.match(sql, /payment_status[^;]+order_creating/su);
  assert.match(sql, /processing_token/u);
  assert.match(sql, /interval '5 minutes'/u);
  assert.match(sql, /greatest\(current_reporter\.membership_expires_at, p_captured_at\)/u);
  assert.match(sql, /grant execute[\s\S]+to service_role/u);
  assert.doesNotMatch(sql, /raw_body|payload json|provider_error/iu);
});

test("order reservation checks every current persisted consent before gateway work", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const reservation = sql.slice(
    sql.indexOf("function public.reserve_reporter_order"),
    sql.indexOf("function public.complete_reporter_order"),
  );

  assert.match(reservation, /reporter_consents/u);
  assert.match(reservation, /withdrawn_at is null/u);
  assert.match(reservation, /p_required_consents/u);
  assert.match(reservation, /for update/u);
});
