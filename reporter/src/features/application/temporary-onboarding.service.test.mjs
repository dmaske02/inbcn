import assert from "node:assert/strict";
import test from "node:test";

import { createTemporaryOnboardingService } from "./temporary-onboarding.service.ts";

test("temporary approval updates Auth claims then records exact sync success", async () => {
  const events = [];
  const service = createTemporaryOnboardingService({
    completePayment: async () => ({ state: "completed" }),
    approve: async () => ({ profileId: "user-1", generation: 1 }),
    claimSync: async () => ({ state: "claimed", profileId: "user-1", generation: 1, claimToken: "claim-1" }),
    getAuthMetadata: async () => ({ plan: "preview" }),
    updateAuthClaims: async (id, metadata) => { events.push(["auth", id, metadata]); },
    completeSync: async (input) => { events.push(["complete", input]); return { state: "succeeded", generation: 1 }; },
    refreshSession: async () => { events.push(["refresh"]); },
  });

  await service.completeKycAndApproval("user-1", "application-1");

  assert.deepEqual(events.map(([name]) => name), ["auth", "complete", "refresh"]);
  assert.deepEqual(events[0][2], { plan: "preview", role: "reporter", reporter_access_generation: 1 });
  assert.equal(events[1][1].succeeded, true);
});

test("Auth claim failure records a retryable safe failure", async () => {
  let completion;
  const service = createTemporaryOnboardingService({
    completePayment: async () => ({ state: "completed" }),
    approve: async () => ({ profileId: "user-1", generation: 1 }),
    claimSync: async () => ({ state: "claimed", profileId: "user-1", generation: 1, claimToken: "claim-1" }),
    getAuthMetadata: async () => ({}),
    updateAuthClaims: async () => { throw new Error("provider detail"); },
    completeSync: async (input) => { completion = input; return { state: "failed", generation: 1 }; },
    refreshSession: async () => { throw new Error("must not refresh failed sync"); },
  });

  await assert.rejects(
    () => service.completeKycAndApproval("user-1", "application-1"),
    /unavailable/u,
  );
  assert.deepEqual(completion, {
    profileId: "user-1",
    generation: 1,
    claimToken: "claim-1",
    succeeded: false,
    failureDetail: "auth-claim-update-failed",
  });
});
