import assert from "node:assert/strict";
import test from "node:test";

import { TokenVerifier } from "livekit-server-sdk";

import {
  LiveSessionError,
  createLiveSessionService,
} from "./live-session.service.ts";
import { generatePublisherToken } from "./livekit.server.ts";
import { createEgressProvider } from "./egress.server.ts";

const profileId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const recordingId = "33333333-3333-4333-8333-333333333333";
const roomName = "reporter-live-22222222222242228222222222222222";
const startsAt = "2026-08-22T10:00:00.000Z";
const endsAt = "2026-08-22T10:30:00.000Z";
const now = "2026-08-22T10:05:00.000Z";
const config = {
  serverUrl: "wss://livekit.example.test",
  apiUrl: "https://livekit.example.test",
  apiKey: "test-api-key",
  apiSecret: "test-api-secret-that-is-long-enough",
  storage: {
    accessKey: "storage-access",
    secret: "storage-secret",
    bucket: "private-recordings",
  },
};

function reservation(overrides = {}) {
  return {
    state: "claimed",
    recordingId,
    claimToken: "44444444-4444-4444-8444-444444444444",
    reclaimed: false,
    roomName,
    startsAt,
    endsAt,
    ...overrides,
  };
}

function dependencies(overrides = {}) {
  const calls = { complete: 0, createRoom: 0, fail: [], list: 0, start: 0 };
  return {
    calls,
    value: {
      getConfig: () => config,
      now: () => now,
      reserve: async () => reservation(),
      complete: async () => { calls.complete += 1; return true; },
      fail: async (input) => { calls.fail.push(input.failureCode); return true; },
      createRoom: async (input) => { calls.createRoom += 1; calls.room = input; },
      listActiveRecordings: async () => { calls.list += 1; return []; },
      startRecording: async (input) => { calls.start += 1; calls.recording = input; return "EG_1"; },
      generateToken: async () => "publisher-token",
      ...overrides,
    },
  };
}

test("publisher token is exact-room, camera/microphone-only, and request-bound", async () => {
  const token = await generatePublisherToken({
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
    profileId,
    requestId,
    roomName,
    ttlSeconds: 1_560,
  });
  const claims = await new TokenVerifier(config.apiKey, config.apiSecret).verify(token);

  assert.equal(claims.sub, profileId);
  assert.equal(claims.attributes.live_request_id, requestId);
  assert.deepEqual(claims.video, {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishSources: ["camera", "microphone"],
    canSubscribe: false,
    canPublishData: false,
    canUpdateOwnMetadata: false,
  });
  assert.equal(claims.exp - claims.nbf, 1_560);
});

test("Egress adapter requests one MP4 Room Composite output in private S3 storage", async () => {
  let received;
  const provider = createEgressProvider({
    startRoomCompositeEgress: async (...args) => { received = args; return { egressId: "EG_1" }; },
    listEgress: async () => [],
  }, config.storage);
  const storageKey = `reporter-live/${requestId}/${recordingId}.mp4`;

  assert.equal(await provider.startRecording({ roomName, storageKey }), "EG_1");
  assert.equal(received[0], roomName);
  assert.equal(received[1].fileType, 1);
  assert.equal(received[1].filepath, storageKey);
  assert.equal(received[1].output.case, "s3");
  assert.equal(received[1].output.value.bucket, config.storage.bucket);
  assert.equal(received[1].output.value.accessKey, config.storage.accessKey);
  assert.equal(received[1].output.value.secret, config.storage.secret);
  assert.deepEqual(received[2], { encodingOptions: 0 });
});

test("Egress reconciliation reads the exact path from the current provider request shape", async () => {
  const storageKey = `reporter-live/${requestId}/${recordingId}.mp4`;
  const provider = createEgressProvider({
    startRoomCompositeEgress: async () => ({ egressId: "unused" }),
    listEgress: async () => [{
      egressId: "EG_CURRENT",
      fileResults: [],
      request: {
        case: "egress",
        value: { outputs: [{ config: { case: "file", value: { filepath: storageKey } } }] },
      },
    }],
  }, config.storage);

  assert.deepEqual(await provider.listActiveRecordings(roomName), [
    { egressId: "EG_CURRENT", storageKey },
  ]);
});

test("new reservation creates one bounded room and starts one private recording", async () => {
  const setup = dependencies();
  const result = await createLiveSessionService(setup.value).request({
    profileId,
    accessGeneration: 7,
    requestId,
  });

  assert.deepEqual(result, {
    serverUrl: config.serverUrl,
    token: "publisher-token",
    roomName,
    startsAt,
    endsAt,
    recordingState: "recording",
  });
  assert.deepEqual(setup.calls.room, {
    name: roomName,
    emptyTimeout: 60,
    departureTimeout: 60,
    maxParticipants: 4,
  });
  assert.equal(setup.calls.start, 1);
  assert.equal(setup.calls.complete, 1);
  assert.equal(setup.calls.recording.storageKey, `reporter-live/${requestId}/${recordingId}.mp4`);
  assert.equal(JSON.stringify(result).includes(recordingId), false);
});

test("publisher TTL is calculated at token issuance after provider startup", async () => {
  let clock = now;
  let issuedTtl = null;
  const setup = dependencies({
    now: () => clock,
    startRecording: async () => { clock = "2026-08-22T10:10:00.000Z"; return "EG_1"; },
    generateToken: async (input) => { issuedTtl = input.ttlSeconds; return "publisher-token"; },
  });

  await createLiveSessionService(setup.value).request({ profileId, accessGeneration: 7, requestId });

  assert.equal(issuedTtl, 1_260);
});

test("sequential duplicate reuses recording and issues a fresh token without provider work", async () => {
  let tokenCount = 0;
  const setup = dependencies({
    reserve: async () => reservation({
      state: "existing",
      recordingState: "recording",
      claimToken: undefined,
      reclaimed: undefined,
    }),
    generateToken: async () => `publisher-token-${++tokenCount}`,
  });
  const service = createLiveSessionService(setup.value);

  assert.equal((await service.request({ profileId, accessGeneration: 7, requestId })).token, "publisher-token-1");
  assert.equal((await service.request({ profileId, accessGeneration: 7, requestId })).token, "publisher-token-2");
  assert.equal(setup.calls.createRoom, 0);
  assert.equal(setup.calls.start, 0);
});

test("fresh concurrent reservation is retryable and starts no provider work", async () => {
  const setup = dependencies({ reserve: async () => ({ state: "busy" }) });

  await assert.rejects(
    () => createLiveSessionService(setup.value).request({ profileId, accessGeneration: 7, requestId }),
    (error) => error instanceof LiveSessionError && error.code === "STARTING",
  );
  assert.equal(setup.calls.createRoom, 0);
  assert.equal(setup.calls.start, 0);
});

test("stale reservation reconciles one exact active Egress without starting another", async () => {
  const storageKey = `reporter-live/${requestId}/${recordingId}.mp4`;
  const setup = dependencies({
    reserve: async () => reservation({ reclaimed: true }),
    listActiveRecordings: async () => [{ egressId: "EG_RECOVERED", storageKey }],
  });

  const result = await createLiveSessionService(setup.value).request({ profileId, accessGeneration: 7, requestId });

  assert.equal(result.recordingState, "recording");
  assert.equal(setup.calls.start, 0);
  assert.equal(setup.calls.complete, 1);
});

test("unavailable stale reconciliation starts no second Egress", async () => {
  const setup = dependencies({
    reserve: async () => reservation({ reclaimed: true }),
    listActiveRecordings: async () => { throw new Error("raw provider detail"); },
  });

  await assert.rejects(
    () => createLiveSessionService(setup.value).request({ profileId, accessGeneration: 7, requestId }),
    (error) => error instanceof LiveSessionError && error.code === "STARTING" && !error.message.includes("raw"),
  );
  assert.equal(setup.calls.start, 0);
  assert.deepEqual(setup.calls.fail, []);
});

test("configured Egress failure is safely recorded but still returns publisher token", async () => {
  const setup = dependencies({ startRecording: async () => { throw new Error("secret endpoint detail"); } });

  const result = await createLiveSessionService(setup.value).request({ profileId, accessGeneration: 7, requestId });

  assert.equal(result.recordingState, "failed");
  assert.deepEqual(setup.calls.fail, ["egress-start-failed"]);
  assert.equal(result.token, "publisher-token");
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("Egress failure returns no token until the failed-state alert CAS is confirmed", async () => {
  let tokenCalls = 0;
  const setup = dependencies({
    startRecording: async () => { throw new Error("provider unavailable"); },
    fail: async () => false,
    generateToken: async () => { tokenCalls += 1; return "must-not-return"; },
  });

  await assert.rejects(
    () => createLiveSessionService(setup.value).request({ profileId, accessGeneration: 7, requestId }),
    (error) => error instanceof LiveSessionError && error.code === "STARTING",
  );
  assert.equal(tokenCalls, 0);
});

test("room creation failure is safely failed and returns no token", async () => {
  let tokenCalls = 0;
  const setup = dependencies({
    createRoom: async () => { throw new Error("provider hostname"); },
    generateToken: async () => { tokenCalls += 1; return "must-not-return"; },
  });

  await assert.rejects(
    () => createLiveSessionService(setup.value).request({ profileId, accessGeneration: 7, requestId }),
    (error) => error instanceof LiveSessionError && error.code === "UNAVAILABLE" && !error.message.includes("hostname"),
  );
  assert.deepEqual(setup.calls.fail, ["room-create-failed"]);
  assert.equal(tokenCalls, 0);
});

test("missing configuration fails closed before reservation and provider calls", async () => {
  let reservations = 0;
  const setup = dependencies({
    getConfig: () => { throw new LiveSessionError("CONFIGURATION", 503); },
    reserve: async () => { reservations += 1; return reservation(); },
  });

  await assert.rejects(
    () => createLiveSessionService(setup.value).request({ profileId, accessGeneration: 7, requestId }),
    (error) => error instanceof LiveSessionError && error.code === "CONFIGURATION",
  );
  assert.equal(reservations, 0);
  assert.equal(setup.calls.createRoom, 0);
});
