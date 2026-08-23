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
