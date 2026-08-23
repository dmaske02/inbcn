import assert from "node:assert/strict";
import test from "node:test";

import { ServerError, TokenVerifier } from "livekit-server-sdk";

import {
  LiveSessionError,
  createLiveSessionService,
} from "./live-session.service.ts";
import { generatePublisherToken, liveKitUrls } from "./livekit.server.ts";
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
    requestId,
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
  const calls = { authorizeFinal: 0, complete: 0, createRoom: 0, fail: [], list: 0, reconcile: [], start: 0 };
  return {
    calls,
    value: {
      getConfig: () => config,
      now: () => now,
      reserve: async () => reservation(),
      authorizeFinal: async () => {
        calls.authorizeFinal += 1;
        return { requestId, roomName, startsAt, endsAt, recordingState: "recording" };
      },
      complete: async () => { calls.complete += 1; return true; },
      fail: async (input) => { calls.fail.push(input.failureCode); return true; },
      createRoom: async (input) => { calls.createRoom += 1; calls.room = input; },
      listRoomRecordings: async () => { calls.list += 1; return []; },
      reportTerminalReconciliation: async (input) => { calls.reconcile.push(input); return true; },
      startRecording: async (input) => {
        calls.start += 1;
        calls.recording = input;
        return { state: "started", egressId: "EG_1" };
      },
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

  assert.deepEqual(await provider.startRecording({ roomName, storageKey }), {
    state: "started",
    egressId: "EG_1",
  });
  assert.equal(received[0], roomName);
  assert.equal(received[1].fileType, 1);
  assert.equal(received[1].filepath, storageKey);
  assert.equal(received[1].output.case, "s3");
  assert.equal(received[1].output.value.bucket, config.storage.bucket);
  assert.equal(received[1].output.value.accessKey, config.storage.accessKey);
  assert.equal(received[1].output.value.secret, config.storage.secret);
  assert.deepEqual(received[2], { encodingOptions: 0 });
});

test("Egress adapter classifies only terminal non-retryable 4xx responses as definitive", async () => {
  for (const status of [400, 401, 403, 404, 422]) {
    const provider = createEgressProvider({
      startRoomCompositeEgress: async () => { throw new ServerError("terminal", "private", status); },
      listEgress: async () => [],
    }, config.storage);
    assert.deepEqual(await provider.startRecording({ roomName, storageKey: "private.mp4" }), {
      state: "definitive-failure",
    });
  }
});

test("Egress adapter preserves transport, response-loss, retryable HTTP, parse, and invalid-id outcomes as ambiguous", async () => {
  const errors = [
    new Error("transport or parse detail"),
    new ServerError("timeout", "private", 408),
    new ServerError("conflict", "private", 409),
    new ServerError("misdirected", "private", 421),
    new ServerError("locked", "private", 423),
    new ServerError("dependency", "private", 424),
    new ServerError("too early", "private", 425),
    new ServerError("throttle", "private", 429),
    new ServerError("client closed", "private", 499),
    new ServerError("upstream", "private", 500),
  ];
  for (const error of errors) {
    const provider = createEgressProvider({
      startRoomCompositeEgress: async () => { throw error; },
      listEgress: async () => [],
    }, config.storage);
    assert.deepEqual(await provider.startRecording({ roomName, storageKey: "private.mp4" }), {
      state: "ambiguous",
    });
  }
  for (const egressId of ["", "   ", "EG/bad", "x".repeat(256)]) {
    const provider = createEgressProvider({
      startRoomCompositeEgress: async () => ({ egressId }),
      listEgress: async () => [],
    }, config.storage);
    assert.deepEqual(await provider.startRecording({ roomName, storageKey: "private.mp4" }), {
      state: "ambiguous",
    });
  }
});

test("LiveKit URL conversion accepts only origin URLs and returns origins", () => {
  assert.deepEqual(liveKitUrls("wss://livekit.example.test/"), {
    apiUrl: "https://livekit.example.test",
    serverUrl: "wss://livekit.example.test",
  });
  assert.deepEqual(liveKitUrls("https://livekit.example.test"), {
    apiUrl: "https://livekit.example.test",
    serverUrl: "wss://livekit.example.test",
  });
  for (const value of [
    "https://user:secret@livekit.example.test",
    "https://livekit.example.test/private",
    "https://livekit.example.test/?secret=value",
    "https://livekit.example.test/#secret",
    "https://livekit.example.test/?",
    "https://livekit.example.test/#",
  ]) assert.throws(() => liveKitUrls(value));
});

test("Egress reconciliation lists active and historical exact-room requests without trusting fileResults", async () => {
  const storageKey = `reporter-live/${requestId}/${recordingId}.mp4`;
  let filter;
  const provider = createEgressProvider({
    startRoomCompositeEgress: async () => ({ egressId: "unused" }),
    listEgress: async (input) => { filter = input; return [{
      egressId: "EG_CURRENT",
      roomName,
      status: 3,
      fileResults: [{ filename: `${storageKey}.untrusted` }],
      request: {
        case: "egress",
        value: {
          roomName,
          outputs: [{ config: { case: "file", value: { filepath: storageKey, fileType: 1 } } }],
        },
      },
    }]; },
  }, config.storage);

  assert.deepEqual(await provider.listRoomRecordings(roomName), [
    { egressId: "EG_CURRENT", storageKey, status: 3 },
  ]);
  assert.deepEqual(filter, { roomName });
});

test("Egress reconciliation rejects noncanonical room/output requests and ambiguous provider records", async () => {
  const storageKey = `reporter-live/${requestId}/${recordingId}.mp4`;
  const provider = createEgressProvider({
    startRoomCompositeEgress: async () => ({ egressId: "unused" }),
    listEgress: async () => [{
      egressId: "EG_WRONG_ROOM",
      roomName: `${roomName}-other`,
      status: 2,
      fileResults: [{ filename: storageKey }],
      request: {
        case: "roomComposite",
        value: {
          roomName: `${roomName}-other`,
          output: { case: "file", value: { filepath: storageKey, fileType: 1 } },
          fileOutputs: [], streamOutputs: [], segmentOutputs: [], imageOutputs: [],
        },
      },
    }, {
      egressId: "EG_WRONG_OUTPUT",
      roomName,
      status: 2,
      fileResults: [{ filename: storageKey }],
      request: {
        case: "egress",
        value: {
          roomName,
          outputs: [{ config: { case: "file", value: { filepath: `${storageKey}.bak`, fileType: 1 } } }],
        },
      },
    }],
  }, config.storage);

  assert.deepEqual(await provider.listRoomRecordings(roomName), [
    { egressId: null, storageKey: null, status: null },
    { egressId: "EG_WRONG_OUTPUT", storageKey: `${storageKey}.bak`, status: 2 },
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

test("publisher TTL is capped at 120 seconds when the approved window remains longer", async () => {
  let clock = now;
  let issuedTtl = null;
  const setup = dependencies({
    now: () => clock,
    startRecording: async () => {
      clock = "2026-08-22T10:10:00.000Z";
      return { state: "started", egressId: "EG_1" };
    },
    generateToken: async (input) => { issuedTtl = input.ttlSeconds; return "publisher-token"; },
  });

  await createLiveSessionService(setup.value).request({ profileId, accessGeneration: 7, requestId });

  assert.equal(issuedTtl, 120);
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
  assert.equal(setup.calls.authorizeFinal, 2);
});

test("active duplicate issues no token when final DB authorization is revoked", async () => {
  let tokenCalls = 0;
  const setup = dependencies({
    reserve: async () => reservation({
      state: "existing",
      recordingState: "recording",
      claimToken: undefined,
      reclaimed: undefined,
    }),
    authorizeFinal: async () => { throw new LiveSessionError("FORBIDDEN", 403); },
    generateToken: async () => { tokenCalls += 1; return "must-not-return"; },
  });

  await assert.rejects(
    () => createLiveSessionService(setup.value).request({ profileId, accessGeneration: 7, requestId }),
    (error) => error instanceof LiveSessionError && error.code === "FORBIDDEN",
  );
  assert.equal(tokenCalls, 0);
  assert.equal(setup.calls.start, 0);
});

test("a terminated existing reservation cannot mint a cached-token refresh", async () => {
  let tokenCalls = 0;
  const setup = dependencies({
    reserve: async () => reservation({
      state: "existing",
      recordingState: "recording",
      claimToken: undefined,
      reclaimed: undefined,
    }),
    authorizeFinal: async () => { throw new LiveSessionError("FORBIDDEN", 403); },
    generateToken: async () => { tokenCalls += 1; return "must-not-return"; },
  });

  await assert.rejects(
    () => createLiveSessionService(setup.value).request({ profileId, accessGeneration: 7, requestId }),
    (error) => error instanceof LiveSessionError && error.code === "FORBIDDEN",
  );
  assert.equal(tokenCalls, 0);
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
    listRoomRecordings: async () => [{ egressId: "EG_RECOVERED", storageKey, status: 2 }],
  });

  const result = await createLiveSessionService(setup.value).request({ profileId, accessGeneration: 7, requestId });

  assert.equal(result.recordingState, "recording");
  assert.equal(setup.calls.start, 0);
  assert.equal(setup.calls.complete, 1);
});

test("stale completed or failed exact Egress is bound for operator reconciliation without a restart or token", async (context) => {
  const storageKey = `reporter-live/${requestId}/${recordingId}.mp4`;
  for (const [providerStatus, status] of [[3, "completed"], [4, "failed"]]) {
    await context.test(status, async () => {
      let tokenCalls = 0;
      const setup = dependencies({
        reserve: async () => reservation({ reclaimed: true }),
        listRoomRecordings: async () => [{ egressId: `EG_${status.toUpperCase()}`, storageKey, status: providerStatus }],
        generateToken: async () => { tokenCalls += 1; return "must-not-return"; },
      });

      await assert.rejects(
        () => createLiveSessionService(setup.value).request({ profileId, accessGeneration: 7, requestId }),
        (error) => error instanceof LiveSessionError && error.code === "STARTING",
      );
      assert.equal(setup.calls.start, 0);
      assert.equal(setup.calls.complete, 0);
      assert.equal(tokenCalls, 0);
      assert.deepEqual(setup.calls.reconcile, [{
        recordingId,
        claimToken: "44444444-4444-4444-8444-444444444444",
        egressId: `EG_${status.toUpperCase()}`,
        providerStatus: status,
      }]);
    });
  }
});

test("stale multiple or conflicting room Egresses fail closed without binding, starting, or issuing a token", async (context) => {
  const storageKey = `reporter-live/${requestId}/${recordingId}.mp4`;
  for (const [name, roomRecordings] of [
    ["multiple exact", [
      { egressId: "EG_ONE", storageKey, status: 2 },
      { egressId: "EG_TWO", storageKey, status: 2 },
    ]],
    ["conflicting output", [{ egressId: "EG_OTHER", storageKey: `${storageKey}.bak`, status: 2 }]],
    ["unknown status", [{ egressId: "EG_UNKNOWN", storageKey, status: null }]],
  ]) {
    await context.test(name, async () => {
      let tokenCalls = 0;
      const setup = dependencies({
        reserve: async () => reservation({ reclaimed: true }),
        listRoomRecordings: async () => roomRecordings,
        generateToken: async () => { tokenCalls += 1; return "must-not-return"; },
      });
      await assert.rejects(
        () => createLiveSessionService(setup.value).request({ profileId, accessGeneration: 7, requestId }),
        (error) => error instanceof LiveSessionError && error.code === "STARTING",
      );
      assert.equal(setup.calls.start, 0);
      assert.equal(setup.calls.complete, 0);
      assert.deepEqual(setup.calls.reconcile, []);
      assert.equal(tokenCalls, 0);
    });
  }
});

test("response loss followed by provider completion never starts a second Egress", async () => {
  const storageKey = `reporter-live/${requestId}/${recordingId}.mp4`;
  let attempts = 0;
  let starts = 0;
  const setup = dependencies({
    reserve: async () => reservation({ reclaimed: attempts++ > 0 }),
    listRoomRecordings: async () => [{ egressId: "EG_RESPONSE_LOST", storageKey, status: 3 }],
    startRecording: async () => { starts += 1; return { state: "ambiguous" }; },
  });
  const service = createLiveSessionService(setup.value);

  await assert.rejects(() => service.request({ profileId, accessGeneration: 7, requestId }), LiveSessionError);
  await assert.rejects(
    () => service.request({ profileId, accessGeneration: 7, requestId }),
    (error) => error instanceof LiveSessionError && error.code === "STARTING",
  );
  assert.equal(starts, 1);
  assert.equal(setup.calls.complete, 0);
  assert.equal(setup.calls.reconcile.length, 1);
});

test("stale reconciliation with no room Egress match starts exactly one new recording", async () => {
  const setup = dependencies({
    reserve: async () => reservation({ reclaimed: true }),
    listRoomRecordings: async () => [],
  });

  await createLiveSessionService(setup.value).request({ profileId, accessGeneration: 7, requestId });
  assert.equal(setup.calls.start, 1);
  assert.equal(setup.calls.complete, 1);
});

test("stale exact-path reconciliation with an invalid Egress id is ambiguous and starts nothing", async () => {
  let tokenCalls = 0;
  const storageKey = `reporter-live/${requestId}/${recordingId}.mp4`;
  const setup = dependencies({
    reserve: async () => reservation({ reclaimed: true }),
    listRoomRecordings: async () => [{ egressId: "   ", storageKey, status: 2 }],
    generateToken: async () => { tokenCalls += 1; return "must-not-return"; },
  });

  await assert.rejects(
    () => createLiveSessionService(setup.value).request({ profileId, accessGeneration: 7, requestId }),
    (error) => error instanceof LiveSessionError && error.code === "STARTING",
  );
  assert.equal(setup.calls.start, 0);
  assert.equal(setup.calls.complete, 0);
  assert.equal(tokenCalls, 0);
});

test("unavailable stale reconciliation starts no second Egress", async () => {
  const setup = dependencies({
    reserve: async () => reservation({ reclaimed: true }),
    listRoomRecordings: async () => { throw new Error("raw provider detail"); },
  });

  await assert.rejects(
    () => createLiveSessionService(setup.value).request({ profileId, accessGeneration: 7, requestId }),
    (error) => error instanceof LiveSessionError && error.code === "STARTING" && !error.message.includes("raw"),
  );
  assert.equal(setup.calls.start, 0);
  assert.deepEqual(setup.calls.fail, []);
});

test("definitive Egress failure is safely recorded and returns a token only after final authorization", async () => {
  const setup = dependencies({
    startRecording: async () => ({ state: "definitive-failure" }),
    authorizeFinal: async () => {
      setup.calls.authorizeFinal += 1;
      return { requestId, roomName, startsAt, endsAt, recordingState: "failed" };
    },
  });

  const result = await createLiveSessionService(setup.value).request({ profileId, accessGeneration: 7, requestId });

  assert.equal(result.recordingState, "failed");
  assert.deepEqual(setup.calls.fail, ["egress-start-failed"]);
  assert.equal(result.token, "publisher-token");
  assert.equal(setup.calls.authorizeFinal, 1);
});

test("Egress failure returns no token until the failed-state alert CAS is confirmed", async (context) => {
  for (const failure of [
    { name: "false CAS", fail: async () => false },
    { name: "throwing CAS", fail: async () => { throw new Error("private database detail"); } },
  ]) {
    await context.test(failure.name, async () => {
      let tokenCalls = 0;
      const setup = dependencies({
        startRecording: async () => ({ state: "definitive-failure" }),
        fail: failure.fail,
        generateToken: async () => { tokenCalls += 1; return "must-not-return"; },
      });

      await assert.rejects(
        () => createLiveSessionService(setup.value).request({ profileId, accessGeneration: 7, requestId }),
        (error) => error instanceof LiveSessionError && error.code === "STARTING",
      );
      assert.equal(tokenCalls, 0);
    });
  }
});

test("ambiguous Egress start retains the pending claim and returns retryably with no token or alert", async () => {
  let tokenCalls = 0;
  const setup = dependencies({
    startRecording: async () => ({ state: "ambiguous" }),
    generateToken: async () => { tokenCalls += 1; return "must-not-return"; },
  });

  await assert.rejects(
    () => createLiveSessionService(setup.value).request({ profileId, accessGeneration: 7, requestId }),
    (error) => error instanceof LiveSessionError && error.code === "STARTING",
  );
  assert.deepEqual(setup.calls.fail, []);
  assert.equal(setup.calls.complete, 0);
  assert.equal(tokenCalls, 0);
});

test("provider success persists but termination, trust, generation, or membership revocation returns no token", async (context) => {
  for (const change of ["termination", "trust", "generation", "membership"]) {
    await context.test(change, async () => {
      let tokenCalls = 0;
      const setup = dependencies({
        authorizeFinal: async () => { throw new LiveSessionError("FORBIDDEN", 403); },
        generateToken: async () => { tokenCalls += 1; return "must-not-return"; },
      });

      await assert.rejects(
        () => createLiveSessionService(setup.value).request({ profileId, accessGeneration: 7, requestId }),
        (error) => error instanceof LiveSessionError && error.code === "FORBIDDEN",
      );
      assert.equal(setup.calls.complete, 1);
      assert.equal(tokenCalls, 0);
    });
  }
});

test("definitive failure persists but startup revocation returns no token", async () => {
  let tokenCalls = 0;
  const setup = dependencies({
    startRecording: async () => ({ state: "definitive-failure" }),
    authorizeFinal: async () => { throw new LiveSessionError("FORBIDDEN", 403); },
    generateToken: async () => { tokenCalls += 1; return "must-not-return"; },
  });

  await assert.rejects(
    () => createLiveSessionService(setup.value).request({ profileId, accessGeneration: 7, requestId }),
    (error) => error instanceof LiveSessionError && error.code === "FORBIDDEN",
  );
  assert.deepEqual(setup.calls.fail, ["egress-start-failed"]);
  assert.equal(tokenCalls, 0);
});

test("canonical DB request id drives the storage key, token attribute, and stale reconciliation", async () => {
  const mixedRequestId = "22222222-2222-4222-8222-2222222222AA";
  const canonicalRequestId = mixedRequestId.toLowerCase();
  const expectedKey = `reporter-live/${canonicalRequestId}/${recordingId}.mp4`;
  let tokenInput;
  const setup = dependencies({
    reserve: async () => reservation({ requestId: canonicalRequestId, reclaimed: true }),
    authorizeFinal: async () => ({
      requestId: canonicalRequestId,
      roomName,
      startsAt,
      endsAt,
      recordingState: "recording",
    }),
    listRoomRecordings: async () => [{ egressId: "EG_CANONICAL", storageKey: expectedKey, status: 2 }],
    generateToken: async (input) => { tokenInput = input; return "publisher-token"; },
  });

  await createLiveSessionService(setup.value).request({
    profileId,
    accessGeneration: 7,
    requestId: mixedRequestId,
  });

  assert.equal(setup.calls.start, 0);
  assert.equal(tokenInput.requestId, canonicalRequestId);
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
