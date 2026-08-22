import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizeReporterIdentity,
  otpProviderErrorMessage,
  validateIndianPhone,
} from "./authorization.model.ts";

test("authorizes an applicant without reporter role or generation", () => {
  assert.deepEqual(authorizeReporterIdentity({ id: "u1", role: null, accessGeneration: null }, null), {
    ok: true,
    state: "applicant",
    userId: "u1",
  });
});

test("authorizes an active reporter with matching signed and persisted roles", () => {
  assert.deepEqual(
    authorizeReporterIdentity(
      { id: "u1", role: "reporter", accessGeneration: 7 },
      { id: "u1", role: "reporter", isActive: true, accessSyncStatus: "succeeded", accessSyncGeneration: 7 },
    ),
    { ok: true, state: "reporter", userId: "u1" },
  );
});

test("denies staff roles and inactive reporters", () => {
  assert.deepEqual(authorizeReporterIdentity({ id: "u1", role: "admin", accessGeneration: null }, null), {
    ok: false,
    reason: "forbidden",
  });
  assert.deepEqual(
    authorizeReporterIdentity(
      { id: "u1", role: "reporter", accessGeneration: 7 },
      { id: "u1", role: "reporter", isActive: false, accessSyncStatus: "failed", accessSyncGeneration: 7 },
    ),
    { ok: false, reason: "profile-inactive" },
  );
});

test("denies old or newly signed reporter claims until database access sync succeeds", () => {
  assert.deepEqual(
    authorizeReporterIdentity(
      { id: "u1", role: "reporter", accessGeneration: 7 },
      { id: "u1", role: "reporter", isActive: true, accessSyncStatus: "pending", accessSyncGeneration: 7 },
    ),
    { ok: false, reason: "access-sync-pending" },
  );
  assert.deepEqual(
    authorizeReporterIdentity(
      { id: "u1", role: null, accessGeneration: 7 },
      { id: "u1", role: "reporter", isActive: true, accessSyncStatus: "failed", accessSyncGeneration: 7 },
    ),
    { ok: false, reason: "access-sync-pending" },
  );
});

test("denies an old reporter JWT generation after the database advances", () => {
  assert.deepEqual(
    authorizeReporterIdentity(
      { id: "u1", role: "reporter", accessGeneration: 6 },
      { id: "u1", role: "reporter", isActive: true, accessSyncStatus: "succeeded", accessSyncGeneration: 7 },
    ),
    { ok: false, reason: "access-generation-mismatch" },
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
