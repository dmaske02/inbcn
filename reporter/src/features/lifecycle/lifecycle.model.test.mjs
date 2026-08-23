import assert from "node:assert/strict";
import test from "node:test";

import {
  nextMembershipState,
  shouldDelete,
  shouldRefundIncomplete,
} from "./lifecycle.model.ts";

const expiresAt = "2026-09-01T00:00:00.000Z";
const graceEndsAt = "2026-09-08T00:00:00.000Z";

test("membership stays active through expiry, then enters grace and expires", () => {
  assert.equal(nextMembershipState({ expiresAt, graceEndsAt, now: expiresAt }), "active");
  assert.equal(nextMembershipState({
    expiresAt,
    graceEndsAt,
    now: "2026-09-01T00:00:00.001Z",
  }), "grace_period");
  assert.equal(nextMembershipState({ expiresAt, graceEndsAt, now: graceEndsAt }), "grace_period");
  assert.equal(nextMembershipState({
    expiresAt,
    graceEndsAt,
    now: "2026-09-08T00:00:00.001Z",
  }), "expired");
});

test("retention deletion requires a reached deadline and no legal hold", () => {
  const now = "2026-09-01T00:00:00.000Z";
  assert.equal(shouldDelete({ deleteAt: now, legalHold: false, now }), true);
  assert.equal(shouldDelete({ deleteAt: now, legalHold: true, now }), false);
  assert.equal(shouldDelete({
    deleteAt: "2026-09-01T00:00:00.001Z",
    legalHold: false,
    now,
  }), false);
});

test("only an incomplete paid application reaches refund eligibility at day 30", () => {
  const paidAt = "2026-08-01T00:00:00.000Z";
  assert.equal(shouldRefundIncomplete({
    paidAt,
    status: "kyc_pending",
    now: "2026-08-31T00:00:00.000Z",
  }), true);
  assert.equal(shouldRefundIncomplete({
    paidAt,
    status: "under_review",
    now: "2026-08-31T00:00:00.000Z",
  }), false);
  assert.equal(shouldRefundIncomplete({
    paidAt,
    status: "kyc_pending",
    now: "2026-08-30T23:59:59.999Z",
  }), false);
});
