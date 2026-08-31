import assert from "node:assert/strict";
import test from "node:test";

import { createDemoPaymentWaiverService } from "./demo-payment-waiver.service.ts";

const eligible = {
  demoMode: true,
  actor: {
    state: "applicant",
    profileId: "00000000-0000-4000-8000-000000000001",
    phone: "+919000000829",
    demoMarked: true,
  },
  application: {
    id: "00000000-0000-4000-8000-000000000002",
    profileId: "00000000-0000-4000-8000-000000000001",
    status: "payment_pending",
    consentsComplete: true,
  },
};

function harness() {
  const calls = [];
  return {
    calls,
    service: createDemoPaymentWaiverService({
      waive: async (profileId, applicationId) => {
        calls.push({ profileId, applicationId });
        return { state: "waived", applicationId, status: "kyc_pending", waivedAt: "2026-08-31T10:00:00Z" };
      },
    }),
  };
}

test("canonical marked demo applicant can waive an owned payment boundary", async () => {
  const { calls, service } = harness();
  const result = await service.waive(eligible);

  assert.equal(result.status, "kyc_pending");
  assert.deepEqual(calls, [{ profileId: eligible.actor.profileId, applicationId: eligible.application.id }]);
});

for (const [name, change] of [
  ["demo mode disabled", { demoMode: false }],
  ["alternate phone", { actor: { ...eligible.actor, phone: "+919876543210" } }],
  ["missing demo marker", { actor: { ...eligible.actor, demoMarked: false } }],
  ["non-applicant actor", { actor: { ...eligible.actor, state: "reporter" } }],
  ["wrong owner", { application: { ...eligible.application, profileId: "00000000-0000-4000-8000-000000000099" } }],
  ["wrong state", { application: { ...eligible.application, status: "kyc_pending" } }],
  ["missing consents", { application: { ...eligible.application, consentsComplete: false } }],
]) {
  test(`${name} fails before privileged persistence`, async () => {
    const { calls, service } = harness();
    await assert.rejects(() => service.waive({ ...eligible, ...change }), /demo-payment-waiver-forbidden/u);
    assert.deepEqual(calls, []);
  });
}
