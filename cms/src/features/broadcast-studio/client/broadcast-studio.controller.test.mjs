import assert from "node:assert/strict";
import test from "node:test";

import { createBroadcastStudioController } from "./broadcast-studio.controller.ts";

function setup(options = {}) {
  const calls = [];
  let roomEvents = {};
  const preview = { camera: { id: "camera" }, microphone: { id: "microphone" } };
  const media = {
    async listDevices() {
      return {
        cameras: [{ id: "cam-1", label: "Camera" }, { id: "cam-2", label: "Camera 2" }],
        microphones: [{ id: "mic-1", label: "Microphone" }, { id: "mic-2", label: "Microphone 2" }],
      };
    },
    async createPreview(selection) {
      calls.push(["createPreview", selection]);
      if (options.previewError) throw options.previewError;
      return preview;
    },
    async refreshDevices() {
      calls.push(["refreshDevices"]);
      return options.refreshedDevices ?? {
        cameras: [{ id: "cam-2", label: "Camera 2" }],
        microphones: [{ id: "mic-2", label: "Microphone 2" }],
      };
    },
    watchDevices(handler) {
      options.onDeviceChange = handler;
      return () => calls.push(["unwatchDevices"]);
    },
    async switchCamera(_track, id) { calls.push(["previewCamera", id]); },
    async switchMicrophone(_track, id) { calls.push(["previewMicrophone", id]); },
    stopPreview(value) { calls.push(["stopPreview", value]); },
  };
  const livekit = {
    async connect(credentials, tracks, events) {
      calls.push(["connect", credentials, tracks]);
      if (options.connectError) throw options.connectError;
      roomEvents = events;
    },
    async switchCamera(id) { calls.push(["liveCamera", id]); },
    async switchMicrophone(id) { calls.push(["liveMicrophone", id]); },
    async disconnect() { calls.push(["disconnect"]); },
  };
  const requestSession = options.requestSession ?? (async (language) => ({
    ok: true,
    credentials: {
      serverUrl: "wss://example.livekit.cloud",
      token: "jwt",
      roomName: `broadcast-${language}`,
    },
  }));
  const controller = createBroadcastStudioController({
    media,
    livekit,
    requestSession,
    now: () => 5_000,
  });
  return { calls, controller, getRoomEvents: () => roomEvents, preview };
}

test("controller enumerates devices and selects the first camera and microphone", async () => {
  const { controller } = setup();

  await controller.initialize();

  assert.equal(controller.getSnapshot().cameraId, "cam-1");
  assert.equal(controller.getSnapshot().microphoneId, "mic-1");
  assert.equal(controller.getSnapshot().status, "idle");
});

test("controller reports unavailable devices before preview", async () => {
  const empty = createBroadcastStudioController({
    media: {
      async listDevices() { return { cameras: [], microphones: [] }; },
      async refreshDevices() { return { cameras: [], microphones: [] }; },
      watchDevices() { return () => {}; },
      async createPreview() {},
      async switchCamera() {},
      async switchMicrophone() {},
      stopPreview() {},
    },
    livekit: {
      async connect() {},
      async switchCamera() {},
      async switchMicrophone() {},
      async disconnect() {},
    },
    requestSession: async () => ({ ok: false, error: { code: "token-failure", message: "unused" } }),
    now: () => 0,
  });

  await empty.initialize();

  assert.equal(empty.getSnapshot().status, "error");
  assert.equal(empty.getSnapshot().error.code, "no-devices");
});

test("controller refreshes selectors when devices change", async () => {
  const options = {};
  const { calls, controller } = setup(options);
  await controller.initialize();
  await options.onDeviceChange();
  assert.equal(controller.getSnapshot().cameraId, "cam-2");
  assert.equal(controller.getSnapshot().microphoneId, "mic-2");
  assert.deepEqual(calls, [["refreshDevices"]]);
});

test("controller creates preview and switches selected preview devices", async () => {
  const { calls, controller } = setup();
  await controller.initialize();
  await controller.startPreview();
  await controller.selectCamera("cam-2");
  await controller.selectMicrophone("mic-2");

  assert.equal(controller.getSnapshot().status, "preview");
  assert.deepEqual(calls, [
    ["createPreview", { cameraId: "cam-1", microphoneId: "mic-1" }],
    ["previewCamera", "cam-2"],
    ["previewMicrophone", "mic-2"],
  ]);
});

test("Start Preview acquires and selects devices when mount initialization has not completed", async () => {
  const calls = [];
  const preview = { camera: { id: "camera" }, microphone: { id: "microphone" } };
  const controller = createBroadcastStudioController({
    media: {
      async listDevices() {
        calls.push(["listDevices"]);
        return {
          cameras: [{ id: "cam-1", label: "Camera" }],
          microphones: [{ id: "mic-1", label: "Microphone" }],
        };
      },
      async refreshDevices() { return { cameras: [], microphones: [] }; },
      watchDevices() { return () => {}; },
      async createPreview(selection) {
        calls.push(["createPreview", selection]);
        return preview;
      },
      async switchCamera() {},
      async switchMicrophone() {},
      stopPreview() {},
    },
    livekit: {
      async connect() {},
      async switchCamera() {},
      async switchMicrophone() {},
      async disconnect() {},
    },
    requestSession: async () => ({ ok: false, error: { code: "token-failure", message: "unused" } }),
  });

  await controller.startPreview();

  assert.equal(controller.getSnapshot().cameraId, "cam-1");
  assert.equal(controller.getSnapshot().microphoneId, "mic-1");
  assert.equal(controller.getSnapshot().status, "preview");
  assert.deepEqual(calls, [
    ["listDevices"],
    ["createPreview", { cameraId: "cam-1", microphoneId: "mic-1" }],
  ]);
});

test("controller requests credentials, joins, publishes preview tracks, and starts timing", async () => {
  const { calls, controller, preview } = setup();
  await controller.initialize();
  await controller.startPreview();
  controller.selectLanguage("hi");
  await controller.startBroadcast();

  assert.deepEqual(calls.at(-1), [
    "connect",
    { serverUrl: "wss://example.livekit.cloud", token: "jwt", roomName: "broadcast-hi" },
    preview,
  ]);
  assert.equal(controller.getSnapshot().status, "live");
  assert.equal(controller.getSnapshot().startedAt, 5_000);
});

test("controller switches active devices while live", async () => {
  const { calls, controller } = setup();
  await controller.initialize();
  await controller.startPreview();
  await controller.startBroadcast();
  await controller.selectCamera("cam-2");
  await controller.selectMicrophone("mic-2");

  assert.deepEqual(calls.slice(-2), [
    ["liveCamera", "cam-2"],
    ["liveMicrophone", "mic-2"],
  ]);
});

test("controller reflects reconnecting, reconnected, and disconnected events", async () => {
  const { controller, getRoomEvents } = setup();
  await controller.initialize();
  await controller.startPreview();
  await controller.startBroadcast();

  getRoomEvents().onReconnecting();
  assert.equal(controller.getSnapshot().networkStatus, "reconnecting");
  getRoomEvents().onReconnected();
  assert.equal(controller.getSnapshot().status, "live");
  getRoomEvents().onDisconnected();
  assert.equal(controller.getSnapshot().status, "disconnected");
});

test("controller ends the room and cleans up preview media", async () => {
  const { calls, controller, preview } = setup();
  await controller.initialize();
  await controller.startPreview();
  await controller.startBroadcast();
  await controller.stopBroadcast();

  assert.deepEqual(calls.slice(-2), [["disconnect"], ["stopPreview", preview]]);
  assert.equal(controller.getSnapshot().status, "disconnected");
});

test("controller cleanup is idempotent for unload and component unmount", async () => {
  const { calls, controller } = setup();
  await controller.initialize();
  await controller.startPreview();
  await controller.startBroadcast();
  await controller.cleanup();
  await controller.cleanup();

  assert.equal(calls.filter(([name]) => name === "disconnect").length, 1);
  assert.equal(calls.filter(([name]) => name === "stopPreview").length, 1);
  assert.equal(calls.filter(([name]) => name === "unwatchDevices").length, 1);
});

test("Strict Mode cleanup does not permanently detach React state updates", async () => {
  const { calls, controller } = setup();
  let updates = 0;
  const unsubscribe = controller.subscribe(() => { updates += 1; });

  await controller.initialize();
  await controller.cleanup();
  const updatesAfterCleanup = updates;
  await controller.initialize();

  assert.ok(updates > updatesAfterCleanup, "second initialization must notify React subscribers");
  assert.equal(controller.getSnapshot().cameraId, "cam-1");
  assert.equal(controller.getSnapshot().microphoneId, "mic-1");

  await controller.cleanup();
  assert.equal(calls.filter(([name]) => name === "disconnect").length, 2);
  unsubscribe();
});

test("controller exposes permission and token errors as safe error states", async () => {
  const permission = setup({
    previewError: { code: "camera-denied", message: "Allow camera access and try again." },
  });
  await permission.controller.initialize();
  await permission.controller.startPreview();
  assert.equal(permission.controller.getSnapshot().error.code, "camera-denied");

  const token = setup({
    requestSession: async () => ({
      ok: false,
      error: { code: "token-failure", message: "Broadcast credentials could not be created. Try again." },
    }),
  });
  await token.controller.initialize();
  await token.controller.startPreview();
  await token.controller.startBroadcast();
  assert.equal(token.controller.getSnapshot().error.code, "token-failure");
});

test("controller exposes the original LiveKit connection exception", async () => {
  const failure = setup({ connectError: new Error("WebSocket closed 401: Unauthorized") });
  await failure.controller.initialize();
  await failure.controller.startPreview();
  await failure.controller.startBroadcast();

  assert.equal(failure.controller.getSnapshot().error.code, "connection-failure");
  assert.equal(
    failure.controller.getSnapshot().error.message,
    "WebSocket closed 401: Unauthorized",
  );
});

test("controller exposes the original video playback exception", () => {
  const { controller } = setup();
  controller.reportPreviewError(new Error("video.play() failed: NotAllowedError"));

  assert.equal(controller.getSnapshot().error.code, "camera-unavailable");
  assert.equal(
    controller.getSnapshot().error.message,
    "video.play() failed: NotAllowedError",
  );
});
