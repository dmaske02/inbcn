import assert from "node:assert/strict";
import test from "node:test";

import {
  canRequestLive,
  validateApprovedWindow,
  validateLiveRequestInput,
} from "./live-request.model.ts";

test("allows live requests only for active trusted reporters", () => {
  assert.equal(canRequestLive({ membership: "active", canBroadcastLive: true }), true);
  assert.equal(canRequestLive({ membership: "grace_period", canBroadcastLive: true }), false);
  assert.equal(canRequestLive({ membership: "active", canBroadcastLive: false }), false);
});

test("accepts only strict chronological approval windows", () => {
  assert.equal(validateApprovedWindow("2026-08-22T10:00:00Z", "2026-08-22T11:00:00Z").ok, true);
  assert.equal(validateApprovedWindow("2026-08-22T11:00:00Z", "2026-08-22T10:00:00Z").ok, false);
  assert.equal(validateApprovedWindow("2026-02-30T10:00:00Z", "2026-02-30T11:00:00Z").ok, false);
});

test("normalizes bounded request fields without coordinates", () => {
  const result = validateLiveRequestInput({
    title: "  Flood response update  ",
    purpose: "  Explain the road closure and relief work.  ",
    intendedLocality: "  Dadar  ",
    expectedStartsAt: "2026-08-22T10:00:00Z",
    expectedDurationMinutes: "60",
    supportingNotes: "  Keep the camera away from affected families.  ",
    latitude: 19.076,
  });
  assert.deepEqual(result, {
    ok: true,
    data: {
      title: "Flood response update",
      purpose: "Explain the road closure and relief work.",
      intendedLocality: "Dadar",
      expectedStartsAt: "2026-08-22T10:00:00.000Z",
      expectedDurationMinutes: 60,
      supportingNotes: "Keep the camera away from affected families.",
    },
  });
});
