import assert from "node:assert/strict";
import test from "node:test";

import {
  canReviewReporter,
  membershipAccess,
  membershipStatusAt,
} from "./reporter.model.ts";

test("only administrators can review reporters", () => {
  assert.equal(canReviewReporter("admin"), true);
  assert.equal(canReviewReporter("editor"), false);
  assert.equal(canReviewReporter("writer"), false);
});

test("grace and expiry override reporter trust flags", () => {
  assert.equal(
    membershipAccess({ status: "grace_period", direct: true, live: true }),
    "reviewed-submissions-only",
  );
  assert.equal(
    membershipAccess({ status: "expired", direct: true, live: true }),
    "read-only",
  );
  assert.equal(
    membershipAccess({ status: "suspended", direct: true, live: true }),
    "read-only",
  );
});

test("active membership respects direct-publish and live trust independently", () => {
  assert.equal(
    membershipAccess({ status: "active", direct: false, live: false }),
    "reviewed-submissions-only",
  );
  assert.equal(
    membershipAccess({ status: "active", direct: true, live: false }),
    "direct-publish",
  );
  assert.equal(
    membershipAccess({ status: "active", direct: false, live: true }),
    "reviewed-submissions-and-live",
  );
  assert.equal(
    membershipAccess({ status: "active", direct: true, live: true }),
    "direct-publish-and-live",
  );
});

test("server time derives active, seven-day grace, expiry, and suspension", () => {
  const dates = {
    publicStatus: "active",
    expiresAt: "2026-08-22T00:00:00.000Z",
    graceEndsAt: "2026-08-29T00:00:00.000Z",
  };
  assert.equal(membershipStatusAt(dates, "2026-08-21T23:59:59.000Z"), "active");
  assert.equal(membershipStatusAt(dates, "2026-08-25T00:00:00.000Z"), "grace_period");
  assert.equal(membershipStatusAt(dates, "2026-08-30T00:00:00.000Z"), "expired");
  assert.equal(
    membershipStatusAt({ ...dates, publicStatus: "suspended" }, "2026-08-21T00:00:00.000Z"),
    "suspended",
  );
});
