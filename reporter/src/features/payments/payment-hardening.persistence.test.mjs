import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const migrationsDirectory = new URL("../../../../supabase/migrations/", import.meta.url);
const names = (await readdir(migrationsDirectory))
  .filter((name) => name.endsWith(".sql"))
  .sort();
const sql = (await Promise.all(names.map((name) => readFile(new URL(name, migrationsDirectory), "utf8"))))
  .join("\n");

function latestFunction(name) {
  const marker = `create or replace function public.${name}(`;
  const start = sql.lastIndexOf(marker);
  assert.notEqual(start, -1, `missing ${name}`);
  const end = sql.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `unterminated ${name}`);
  return sql.slice(start, end + 4).replace(/\s+/gu, " ");
}

test("signed provider capture time reaches the single atomic payment owner", () => {
  const webhook = latestFunction("complete_razorpay_payment_webhook");
  const payment = latestFunction("apply_reporter_payment");

  assert.match(webhook, /p_captured_at timestamptz/u);
  assert.match(webhook, /public\.apply_reporter_payment\( p_razorpay_order_id, p_razorpay_payment_id, p_amount_paise, p_currency, p_captured_at \)/u);
  assert.doesNotMatch(webhook, /public\.apply_reporter_payment\([^)]*processing_time/u);
  assert.match(payment, /capture_recorded_at timestamptz := clock_timestamp\(\)/u);
  assert.match(payment, /p_captured_at < current_payment\.created_at - interval '15 minutes'/u);
  assert.match(payment, /p_captured_at > capture_recorded_at \+ interval '5 minutes'/u);
  assert.match(payment, /completion_deadline = p_captured_at \+ interval '30 days'/u);
});

test("an exact already-captured payment preserves its first verified captured_at", () => {
  const payment = latestFunction("apply_reporter_payment");
  const idempotentReturn = payment.indexOf("return current_payment.id");
  const timestampValidation = payment.indexOf("p_captured_at < current_payment.created_at");

  assert.ok(idempotentReturn > -1 && timestampValidation > idempotentReturn);
  assert.doesNotMatch(
    payment.slice(0, idempotentReturn),
    /set captured_at = p_captured_at/u,
  );
});

test("renewals extend from prior expiry through the inclusive grace boundary and reset only after grace", () => {
  const payment = latestFunction("apply_reporter_payment");

  assert.match(payment, /when p_captured_at <= current_reporter\.membership_grace_ends_at then current_reporter\.membership_expires_at/u);
  assert.match(payment, /when p_captured_at > current_reporter\.membership_grace_ends_at then p_captured_at else current_reporter\.membership_started_at/u);
  assert.doesNotMatch(payment, /greatest\(current_reporter\.membership_expires_at, p_captured_at\)/u);
});

test("first approval still owns the first membership start, year, and grace dates", () => {
  const approval = latestFunction("approve_reporter_application");

  assert.match(approval, /approval_time timestamptz := clock_timestamp\(\)/u);
  assert.match(approval, /expiry_time timestamptz := approval_time \+ interval '1 year'/u);
  assert.match(approval, /approval_time, expiry_time, expiry_time \+ interval '7 days'/u);
});

test("replaced payment functions revoke every Data API role and grant only service_role", () => {
  const compact = sql.replace(/\s+/gu, " ");
  for (const signature of [
    "complete_razorpay_payment_webhook(text, uuid, text, text, integer, text, timestamptz)",
    "apply_reporter_payment(text, text, integer, text, timestamptz)",
  ]) {
    const escaped = signature.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    assert.match(compact, new RegExp(`revoke all on function public\\.${escaped} from public, anon, authenticated, service_role;`, "u"));
    assert.match(compact, new RegExp(`grant execute on function public\\.${escaped} to service_role;`, "u"));
    assert.doesNotMatch(compact, new RegExp(`grant execute on function public\\.${escaped} to (?:public|anon|authenticated);`, "u"));
  }
});
