import assert from "node:assert/strict";
import test from "node:test";

import * as paymentModel from "./payment.model.ts";

const prior = {
  membershipStartedAt: "2026-08-22T00:00:00.000Z",
  membershipExpiresAt: "2027-08-22T00:00:00.000Z",
  membershipGraceEndsAt: "2027-08-29T00:00:00.000Z",
};

test("renewal credit keeps the original membership start through every inclusive grace boundary", () => {
  assert.equal(typeof paymentModel.creditRenewal, "function");
  for (const capturedAt of [
    "2027-08-20T00:00:00.000Z",
    "2027-08-22T00:00:00.001Z",
    "2027-08-23T00:00:00.000Z",
    "2027-08-29T00:00:00.000Z",
  ]) {
    assert.deepEqual(paymentModel.creditRenewal(prior, capturedAt), {
      membershipStartedAt: "2026-08-22T00:00:00.000Z",
      creditedMembershipStartedAt: "2027-08-22T00:00:00.000Z",
      membershipExpiresAt: "2028-08-22T00:00:00.000Z",
      membershipGraceEndsAt: "2028-08-29T00:00:00.000Z",
    });
  }
});

test("renewal immediately after grace starts a new membership at provider capture time", () => {
  assert.equal(typeof paymentModel.creditRenewal, "function");
  assert.deepEqual(paymentModel.creditRenewal(prior, "2027-08-29T00:00:00.001Z"), {
    membershipStartedAt: "2027-08-29T00:00:00.001Z",
    creditedMembershipStartedAt: "2027-08-29T00:00:00.001Z",
    membershipExpiresAt: "2028-08-29T00:00:00.001Z",
    membershipGraceEndsAt: "2028-09-05T00:00:00.001Z",
  });
});
