import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizeReporterIdentity,
  otpProviderErrorMessage,
  validateIndianPhone,
} from "./authorization.model.ts";

test("authorizes an applicant without a reporter role", () => {
  assert.deepEqual(authorizeReporterIdentity({ id: "u1", role: null }, null), {
    ok: true,
    state: "applicant",
    userId: "u1",
  });
});

test("authorizes an active reporter with matching signed and persisted roles", () => {
  assert.deepEqual(
    authorizeReporterIdentity(
      { id: "u1", role: "reporter" },
      { id: "u1", role: "reporter", isActive: true, accessSyncStatus: "succeeded" },
    ),
    { ok: true, state: "reporter", userId: "u1" },
  );
});

test("denies staff roles and inactive reporters", () => {
  assert.deepEqual(authorizeReporterIdentity({ id: "u1", role: "admin" }, null), {
    ok: false,
    reason: "forbidden",
  });
  assert.deepEqual(
    authorizeReporterIdentity(
      { id: "u1", role: "reporter" },
      { id: "u1", role: "reporter", isActive: false, accessSyncStatus: "failed" },
    ),
    { ok: false, reason: "profile-inactive" },
  );
});

test("denies old or newly signed reporter claims until database access sync succeeds", () => {
  assert.deepEqual(
    authorizeReporterIdentity(
      { id: "u1", role: "reporter" },
      { id: "u1", role: "reporter", isActive: true, accessSyncStatus: "pending" },
    ),
    { ok: false, reason: "access-sync-pending" },
  );
  assert.deepEqual(
    authorizeReporterIdentity(
      { id: "u1", role: null },
      { id: "u1", role: "reporter", isActive: true, accessSyncStatus: "failed" },
    ),
    { ok: false, reason: "access-sync-pending" },
  );
});

test("accepts only Indian E.164 mobile numbers", () => {
  assert.equal(validateIndianPhone("+919876543210"), true);
  assert.equal(validateIndianPhone("9876543210"), false);
  assert.equal(validateIndianPhone("+915876543210"), false);
});

test("redacts OTP provider errors", () => {
  assert.equal(otpProviderErrorMessage("provider secret: no"), "We could not send a code. Please try again.");
});
