import assert from "node:assert/strict";
import test from "node:test";

import { createLiveRequestService, getLiveRequest, LiveRequestError } from "./live-request.service.ts";

const profileId = "11111111-1111-4111-8111-111111111111";
const input = {
  title: "Flood update", purpose: "Explain closures", intendedLocality: "Dadar",
  expectedStartsAt: "2026-08-22T10:00:00.000Z", expectedDurationMinutes: 30, supportingNotes: null,
};

test("active live-trusted reporter can create only under their own profile", async () => {
  let createdFor = null;
  const service = createLiveRequestService({
    getAccess: async () => ({ status: "active", canBroadcastLive: true }),
    create: async (id, value) => { createdFor = id; return { id: "22222222-2222-4222-8222-222222222222", ...value, status: "pending", decisionReason: null, approvedStartsAt: null, approvedEndsAt: null, terminationReason: null, createdAt: "2026-08-22T09:00:00.000Z" }; },
    list: async (id) => { createdFor = id; return []; },
  });
  await service.create(profileId, input);
  assert.equal(createdFor, profileId);
  await service.list(profileId);
  assert.equal(createdFor, profileId);
});

test("grace membership cannot create a live request", async () => {
  const service = createLiveRequestService({
    getAccess: async () => ({ status: "grace_period", canBroadcastLive: true }),
    create: async () => { throw new Error("must not create"); },
    list: async () => [],
  });
  await assert.rejects(() => service.create(profileId, input), (error) => error instanceof LiveRequestError && error.code === "FORBIDDEN");
});

test("reporter live studio lookup remains scoped to the current reporter", async () => {
  let received;
  const service = createLiveRequestService({
    getAccess: async () => ({ status: "active", canBroadcastLive: true }),
    create: async () => { throw new Error("unused"); },
    get: async (profileId, requestId) => { received = { profileId, requestId }; return null; },
    list: async () => [],
  });
  await service.get(profileId, "22222222-2222-4222-8222-222222222222");
  assert.deepEqual(received, { profileId, requestId: "22222222-2222-4222-8222-222222222222" });
  assert.equal(await getLiveRequest(profileId, "not-a-uuid"), null);
});
