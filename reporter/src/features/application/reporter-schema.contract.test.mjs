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
