import assert from "node:assert/strict";
import test from "node:test";

import {
  REPORTER_BEATS,
  canTransitionApplication,
  getApplicationDeadline,
  isAtLeast18,
  validateReporterApplication,
} from "./application.model.ts";

test("exports the exact eight supported reporting beats", () => {
  assert.deepEqual(REPORTER_BEATS, [
    "civic",
    "crime",
    "education",
    "environment",
    "health",
    "business",
    "culture",
    "sports",
  ]);
});

test("allows only valid reporter application transitions", () => {
  assert.equal(canTransitionApplication("draft", "payment_pending"), true);
  assert.equal(canTransitionApplication("payment_pending", "kyc_pending"), true);
  assert.equal(canTransitionApplication("kyc_pending", "under_review"), true);
  assert.equal(canTransitionApplication("kyc_pending", "cancelled"), true);
  assert.equal(canTransitionApplication("under_review", "approved"), true);
  assert.equal(canTransitionApplication("under_review", "rejected"), true);
  assert.equal(canTransitionApplication("approved", "rejected"), false);
  assert.equal(canTransitionApplication("draft", "approved"), false);
});

test("starts the completion deadline thirty days after captured payment", () => {
  assert.equal(
    getApplicationDeadline("2026-08-22T00:00:00.000Z"),
    "2026-09-21T00:00:00.000Z",
  );
});

test("checks adulthood by calendar date", () => {
  const today = "2026-08-22";
  assert.equal(isAtLeast18("2008-08-22", today), true);
  assert.equal(isAtLeast18("2008-08-23", today), false);
  assert.equal(isAtLeast18("not-a-date", today), false);
});

test("validates and normalizes only the persisted application fields", () => {
  const result = validateReporterApplication({
    legalName: "  Ananya Patil  ",
    legalNameDeclared: true,
    dateOfBirth: "2000-04-12",
    age18Declared: true,
    homeCity: " Pune ",
    homeDistrict: " Pune ",
    homeState: " Maharashtra ",
    bio: "  Local civic reporter. ",
    beats: ["civic", "health", "civic"],
    ignoredProviderPayload: "must-not-persist",
  }, "2026-08-22");

  assert.deepEqual(result, {
    ok: true,
    data: {
      legalName: "Ananya Patil",
      dateOfBirth: "2000-04-12",
      age18Declared: true,
      homeCity: "Pune",
      homeDistrict: "Pune",
      homeState: "Maharashtra",
      bio: "Local civic reporter.",
      beats: ["civic", "health"],
    },
  });
  assert.equal("ignoredProviderPayload" in result.data, false);
});

test("rejects underage or undeclared applicants using the server calendar", () => {
  const base = {
    legalName: "Ananya Patil",
    legalNameDeclared: true,
    dateOfBirth: "2008-08-23",
    age18Declared: true,
    homeCity: "Pune",
    homeDistrict: "Pune",
    homeState: "Maharashtra",
    bio: "",
    beats: ["civic"],
  };
  assert.equal(validateReporterApplication(base, "2026-08-22").ok, false);
  assert.equal(validateReporterApplication({ ...base, dateOfBirth: "2000-01-01", legalNameDeclared: false }, "2026-08-22").ok, false);
  assert.equal(validateReporterApplication({ ...base, dateOfBirth: "2000-01-01", age18Declared: false }, "2026-08-22").ok, false);
});

test("accepts every supported beat and rejects arbitrary beat values", () => {
  const base = {
    legalName: "Ananya Patil",
    legalNameDeclared: true,
    dateOfBirth: "2000-01-01",
    age18Declared: true,
    homeCity: "Pune",
    homeDistrict: "Pune",
    homeState: "Maharashtra",
    bio: "",
  };

  const accepted = validateReporterApplication({ ...base, beats: REPORTER_BEATS }, "2026-08-22");
  assert.equal(accepted.ok, true);
  assert.equal(
    validateReporterApplication({ ...base, beats: ["civic", "politics"] }, "2026-08-22").ok,
    false,
  );
});
