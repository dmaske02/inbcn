import assert from "node:assert/strict";
import test from "node:test";

import {
  createBroadcastController,
  initialBroadcastState,
  recordingAnnouncement,
  reduceBroadcast,
} from "./broadcast-controller.ts";

function setup(options = {}) {
  const calls = [];
  let events = {};
  const preview = { camera: { id: "camera" }, microphone: { id: "microphone" } };
  const controller = createBroadcastController({
    media: {
      async createPreview() {
        calls.push(["preview"]);
        if (options.previewError) throw options.previewError;
        return preview;
      },
      stopPreview(value) { calls.push(["stop-preview", value]); },
    },
    livekit: {
      async connect(credentials, tracks, nextEvents) {
        calls.push(["connect", credentials, tracks]);
        events = nextEvents;
        if (options.connectError) throw options.connectError;
      },
      async disconnect() { calls.push(["disconnect"]); },
    },
    requestSession: options.requestSession ?? (async () => ({
      ok: true,
      credentials: {
        serverUrl: "wss://livekit.example.test",
        token: "signed-token",
        roomName: "reporter-live-22222222222242228222222222222222",
        startsAt: "2026-08-22T10:00:00.000Z",
        endsAt: "2026-08-22T10:30:00.000Z",
        recordingState: "recording",
      },
    })),
  });
  return { calls, controller, events: () => events, preview };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((next, fail) => { resolve = next; reject = fail; });
  return { promise, resolve, reject };
}

test("permissions-granted enters preview and recording status has a fixed disclosure", () => {
  assert.equal(reduceBroadcast(initialBroadcastState, { type: "permissions-granted" }).phase, "preview");
  assert.equal(recordingAnnouncement("recording"), "This live broadcast is being recorded.");
});

test("permission denial maps to a safe camera message", async () => {
  const { controller } = setup({ previewError: new DOMException("private detail", "NotAllowedError") });
  await controller.startPreview();
  assert.deepEqual(controller.getSnapshot().error, {
    code: "camera-denied",
    message: "Allow camera and microphone access in your browser settings, then try again.",
  });
});

test("cleanup stops an active preview once", async () => {
  const { calls, controller, preview } = setup();
  await controller.startPreview();
  await controller.cleanup();
  await controller.cleanup();
  assert.deepEqual(calls, [["preview"], ["disconnect"], ["stop-preview", preview]]);
});

test("join publishes a server-authorized session and leave releases local media", async () => {
  const { calls, controller, preview } = setup();
  await controller.startPreview();
  await controller.startBroadcast();
  await controller.leave();
  assert.deepEqual(calls, [
    ["preview"],
    ["connect", {
      serverUrl: "wss://livekit.example.test",
      token: "signed-token",
      roomName: "reporter-live-22222222222242228222222222222222",
      startsAt: "2026-08-22T10:00:00.000Z",
      endsAt: "2026-08-22T10:30:00.000Z",
      recordingState: "recording",
    }, preview],
    ["disconnect"],
    ["stop-preview", preview],
  ]);
  assert.equal(controller.getSnapshot().phase, "idle");
});

test("native reconnecting remains recoverable without requesting another token", async () => {
  const { controller, events } = setup();
  await controller.startPreview();
  await controller.startBroadcast();
  events().onReconnecting();
  assert.equal(controller.getSnapshot().phase, "reconnecting");
  events().onReconnected();
  assert.equal(controller.getSnapshot().phase, "live");
});

test("room deletion and participant removal end the reporter broadcast explicitly", async () => {
  const { controller, events } = setup();
  await controller.startPreview();
  await controller.startBroadcast();
  events().onDisconnected("admin-terminated");
  assert.equal(controller.getSnapshot().phase, "ended");
  assert.equal(controller.getSnapshot().message, "This broadcast was ended by the newsroom.");
});

test("unrecoverable non-admin disconnect releases preview without minting another token", async () => {
  let sessions = 0;
  const { controller, events } = setup({ requestSession: async () => {
    sessions += 1;
    return { ok: true, credentials: { serverUrl: "wss://livekit.example.test", token: "signed-token", roomName: "room", startsAt: "start", endsAt: "end", recordingState: "recording" } };
  } });
  await controller.startPreview();
  await controller.startBroadcast();
  events().onDisconnected("disconnected");
  assert.equal(controller.getSnapshot().phase, "idle");
  assert.equal(controller.getSnapshot().preview, null);
  assert.equal(sessions, 1);
});

test("only one preview operation is in flight and stale preview media is released after cleanup", async () => {
  const gate = deferred();
  const calls = [];
  const preview = { camera: { id: "camera" }, microphone: { id: "microphone" } };
  const controller = createBroadcastController({
    media: {
      async createPreview() { calls.push("preview"); return gate.promise; },
      stopPreview(value) { calls.push(["stop", value]); },
    },
    livekit: { async connect() {}, async disconnect() { calls.push("disconnect"); } },
    requestSession: async () => ({ ok: false, error: { code: "unused", message: "unused" } }),
  });
  const first = controller.startPreview();
  const second = controller.startPreview();
  await controller.cleanup();
  gate.resolve(preview);
  await Promise.all([first, second]);
  assert.deepEqual(calls, ["preview", "disconnect", ["stop", preview]]);
  assert.equal(controller.getSnapshot().preview, null);
  assert.equal(controller.getSnapshot().phase, "idle");
});

test("leave invalidates a pending session request before it can connect", async () => {
  const session = deferred();
  let connects = 0;
  const preview = { camera: { id: "camera" }, microphone: { id: "microphone" } };
  const controller = createBroadcastController({
    media: { async createPreview() { return preview; }, stopPreview() {} },
    livekit: { async connect() { connects += 1; }, async disconnect() {} },
    requestSession: async () => session.promise,
  });
  await controller.startPreview();
  const start = controller.startBroadcast();
  await controller.leave();
  session.resolve({ ok: true, credentials: { serverUrl: "wss://livekit.example.test", token: "token", roomName: "room", startsAt: "start", endsAt: "end", recordingState: "recording" } });
  await start;
  assert.equal(connects, 0);
  assert.equal(controller.getSnapshot().phase, "idle");
});

test("leave during an in-flight connect disconnects the stale room without restoring live state", async () => {
  const connect = deferred();
  const calls = [];
  const preview = { camera: { id: "camera" }, microphone: { id: "microphone" } };
  const controller = createBroadcastController({
    media: { async createPreview() { return preview; }, stopPreview(value) { calls.push(["stop", value]); } },
    livekit: { async connect() { calls.push("connect"); await connect.promise; }, async disconnect() { calls.push("disconnect"); } },
    requestSession: async () => ({ ok: true, credentials: { serverUrl: "wss://livekit.example.test", token: "token", roomName: "room", startsAt: "start", endsAt: "end", recordingState: "recording" } }),
  });
  await controller.startPreview();
  const start = controller.startBroadcast();
  await Promise.resolve();
  await controller.leave();
  connect.resolve();
  await start;
  assert.deepEqual(calls, ["connect", "disconnect", ["stop", preview], "disconnect"]);
  assert.equal(controller.getSnapshot().phase, "idle");
});

test("a session failure preserves preview and permits an actual retry", async () => {
  let attempts = 0;
  const { controller } = setup({ requestSession: async () => {
    attempts += 1;
    return attempts === 1
      ? { ok: false, error: { code: "session-unavailable", message: "Retry now." } }
      : { ok: true, credentials: { serverUrl: "wss://livekit.example.test", token: "token", roomName: "room", startsAt: "start", endsAt: "end", recordingState: "recording" } };
  } });
  await controller.startPreview();
  await controller.startBroadcast();
  assert.equal(controller.getSnapshot().phase, "preview");
  assert.equal(controller.getSnapshot().error?.message, "Retry now.");
  await controller.startBroadcast();
  assert.equal(attempts, 2);
  assert.equal(controller.getSnapshot().phase, "live");
});

test("a thrown session failure also permits a retry", async () => {
  let attempts = 0;
  const { controller } = setup({ requestSession: async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("transport failure");
    return { ok: true, credentials: { serverUrl: "wss://livekit.example.test", token: "token", roomName: "room", startsAt: "start", endsAt: "end", recordingState: "recording" } };
  } });
  await controller.startPreview();
  await controller.startBroadcast();
  assert.equal(controller.getSnapshot().phase, "preview");
  await controller.startBroadcast();
  assert.equal(attempts, 2);
});

test("recording status events update the indicator and disconnect clears it", async () => {
  const { controller, events } = setup();
  await controller.startPreview();
  await controller.startBroadcast();
  events().onRecordingStatusChanged(true);
  assert.equal(controller.getSnapshot().recordingState, "recording");
  events().onRecordingStatusChanged(false);
  assert.equal(controller.getSnapshot().recordingState, "failed");
  events().onDisconnected("admin-terminated");
  assert.equal(controller.getSnapshot().recordingState, null);
});

test("room deletion during a pending connect remains terminal after connect resolves", async () => {
  const gate = deferred();
  let events;
  const preview = { camera: { id: "camera" }, microphone: { id: "microphone" } };
  const controller = createBroadcastController({
    media: { async createPreview() { return preview; }, stopPreview() {} },
    livekit: { async connect(_credentials, _tracks, nextEvents) { events = nextEvents; await gate.promise; }, async disconnect() {} },
    requestSession: async () => ({ ok: true, credentials: { serverUrl: "wss://livekit.example.test", token: "token", roomName: "room", startsAt: "start", endsAt: "end", recordingState: "recording" } }),
  });
  await controller.startPreview();
  const start = controller.startBroadcast();
  await Promise.resolve();
  events.onDisconnected("admin-terminated");
  gate.resolve();
  await start;
  assert.equal(controller.getSnapshot().phase, "ended");
  assert.equal(controller.getSnapshot().error, null);
});

test("room deletion during a pending connect remains terminal after connect rejects", async () => {
  const gate = deferred();
  let events;
  const preview = { camera: { id: "camera" }, microphone: { id: "microphone" } };
  const controller = createBroadcastController({
    media: { async createPreview() { return preview; }, stopPreview() {} },
    livekit: { async connect(_credentials, _tracks, nextEvents) { events = nextEvents; await gate.promise; }, async disconnect() {} },
    requestSession: async () => ({ ok: true, credentials: { serverUrl: "wss://livekit.example.test", token: "token", roomName: "room", startsAt: "start", endsAt: "end", recordingState: "recording" } }),
  });
  await controller.startPreview();
  const start = controller.startBroadcast();
  await Promise.resolve();
  events.onDisconnected("admin-terminated");
  gate.reject(new Error("late provider failure"));
  await start;
  assert.equal(controller.getSnapshot().phase, "ended");
  assert.equal(controller.getSnapshot().error, null);
});

test("leave contains disconnect failure and still releases preview into idle", async () => {
  const calls = [];
  const preview = { camera: { id: "camera" }, microphone: { id: "microphone" } };
  const controller = createBroadcastController({
    media: { async createPreview() { return preview; }, stopPreview(value) { calls.push(value); } },
    livekit: { async connect() {}, async disconnect() { throw new Error("provider detail"); } },
    requestSession: async () => ({ ok: false, error: { code: "unused", message: "unused" } }),
  });
  await controller.startPreview();
  await assert.doesNotReject(() => controller.leave());
  assert.deepEqual(calls, [preview]);
  assert.equal(controller.getSnapshot().phase, "idle");
});

test("cleanup contains disconnect failure and still releases preview into idle", async () => {
  const calls = [];
  const preview = { camera: { id: "camera" }, microphone: { id: "microphone" } };
  const controller = createBroadcastController({
    media: { async createPreview() { return preview; }, stopPreview(value) { calls.push(value); } },
    livekit: { async connect() {}, async disconnect() { throw new Error("provider detail"); } },
    requestSession: async () => ({ ok: false, error: { code: "unused", message: "unused" } }),
  });
  await controller.startPreview();
  await assert.doesNotReject(() => controller.cleanup());
  assert.deepEqual(calls, [preview]);
  assert.equal(controller.getSnapshot().phase, "idle");
});

test("recording callbacks during a pending connect win over stale session recording state", async (context) => {
  for (const [providerValue, sessionState, expected] of [[false, "recording", "failed"], [true, "failed", "recording"]]) {
    await context.test(String(providerValue), async () => {
      const gate = deferred();
      const preview = { camera: { id: "camera" }, microphone: { id: "microphone" } };
      const controller = createBroadcastController({
        media: { async createPreview() { return preview; }, stopPreview() {} },
        livekit: { async connect(_credentials, _tracks, events) { events.onRecordingStatusChanged(providerValue); await gate.promise; }, async disconnect() {} },
        requestSession: async () => ({ ok: true, credentials: { serverUrl: "wss://livekit.example.test", token: "token", roomName: "room", startsAt: "start", endsAt: "end", recordingState: sessionState } }),
      });
      await controller.startPreview();
      const start = controller.startBroadcast();
      await Promise.resolve();
      gate.resolve();
      await start;
      assert.equal(controller.getSnapshot().recordingState, expected);
    });
  }
});
