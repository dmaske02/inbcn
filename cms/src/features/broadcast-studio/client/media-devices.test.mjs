import assert from "node:assert/strict";
import test from "node:test";

import {
  StudioMediaError,
  createMediaDeviceService,
} from "./media-devices.ts";

function track(kind, calls) {
  return {
    kind,
    mediaStreamTrack: { kind },
    async setDeviceId(deviceId) {
      calls.push([`${kind}:switch`, deviceId]);
      return true;
    },
    stop() {
      calls.push([`${kind}:stop`]);
    },
  };
}

test("device enumeration returns cameras and microphones with useful fallback labels", async () => {
  const calls = [];
  const service = createMediaDeviceService({
    mediaDevices: {
      ondevicechange: null,
      async getUserMedia(constraints) {
        calls.push(["permission", constraints]);
        return { getTracks: () => [{ stop: () => calls.push(["permission-track:stop"]) }] };
      },
      async enumerateDevices() {
        calls.push(["enumerate"]);
        return [
          { deviceId: "cam-1", kind: "videoinput", label: "" },
          { deviceId: "mic-1", kind: "audioinput", label: "Desk microphone" },
          { deviceId: "speaker-1", kind: "audiooutput", label: "Speaker" },
        ];
      },
    },
    isSecureContext: () => true,
    getHostname: () => "localhost",
    createLocalVideoTrack() {},
    createLocalAudioTrack() {},
  });

  assert.deepEqual(await service.listDevices(), {
    cameras: [{ id: "cam-1", label: "Camera 1" }],
    microphones: [{ id: "mic-1", label: "Desk microphone" }],
  });
  assert.deepEqual(calls, [
    ["permission", { video: true, audio: true }],
    ["permission-track:stop"],
    ["enumerate"],
  ]);
});

test("device refresh enumerates without requesting permission again", async () => {
  const calls = [];
  const service = createMediaDeviceService({
    mediaDevices: {
      ondevicechange: null,
      async getUserMedia() { calls.push("permission"); return { getTracks: () => [] }; },
      async enumerateDevices() { calls.push("enumerate"); return []; },
    },
    isSecureContext: () => true,
    getHostname: () => "localhost",
    createLocalVideoTrack() {},
    createLocalAudioTrack() {},
  });
  await service.refreshDevices();
  assert.deepEqual(calls, ["enumerate"]);
});

test("device change listener refreshes devices and is removed during cleanup", () => {
  const mediaDevices = { ondevicechange: null, async getUserMedia() {}, async enumerateDevices() { return []; } };
  const service = createMediaDeviceService({
    mediaDevices,
    isSecureContext: () => true,
    getHostname: () => "localhost",
    createLocalVideoTrack() {},
    createLocalAudioTrack() {},
  });
  let changes = 0;
  const unsubscribe = service.watchDevices(() => { changes += 1; });
  mediaDevices.ondevicechange();
  assert.equal(changes, 1);
  unsubscribe();
  assert.equal(mediaDevices.ondevicechange, null);
});

test("localhost is accepted while an insecure remote origin is rejected", async () => {
  const create = (hostname) => createMediaDeviceService({
    mediaDevices: { ondevicechange: null, async getUserMedia() { return { getTracks: () => [] }; }, async enumerateDevices() { return []; } },
    isSecureContext: () => false,
    getHostname: () => hostname,
    createLocalVideoTrack() {},
    createLocalAudioTrack() {},
  });
  await assert.doesNotReject(create("localhost").listDevices());
  await assert.rejects(
    create("news.example.com").listDevices(),
    (error) => error instanceof StudioMediaError && error.code === "insecure-context",
  );
});

test("permission and hardware failures map to user-friendly errors", async () => {
  const cases = [
    ["NotAllowedError", "camera-denied", "Camera permission denied"],
    ["NotFoundError", "no-devices", "No camera or microphone was found."],
    ["NotReadableError", "camera-unavailable", "Camera or microphone is already in use or unavailable."],
    ["SecurityError", "insecure-context", "Camera and microphone access requires a secure connection."],
  ];
  for (const [name, code, message] of cases) {
    const service = createMediaDeviceService({
      mediaDevices: {
        ondevicechange: null,
        async getUserMedia() { throw new DOMException("failed", name); },
        async enumerateDevices() { throw new Error("must not enumerate"); },
      },
      isSecureContext: () => true,
      getHostname: () => "localhost",
      createLocalVideoTrack() {},
      createLocalAudioTrack() {},
    });
    await assert.rejects(
      service.listDevices(),
      (error) => error instanceof StudioMediaError && error.code === code && error.message === message,
    );
  }
});

test("preview requests the selected camera and microphone and cleans up both tracks", async () => {
  const calls = [];
  const camera = track("video", calls);
  const microphone = track("audio", calls);
  const service = createMediaDeviceService({
    mediaDevices: { ondevicechange: null, async getUserMedia() {}, async enumerateDevices() { return []; } },
    isSecureContext: () => true,
    getHostname: () => "localhost",
    async createLocalVideoTrack(options) {
      calls.push(["createVideo", options]);
      return camera;
    },
    async createLocalAudioTrack(options) {
      calls.push(["createAudio", options]);
      return microphone;
    },
  });

  const preview = await service.createPreview({ cameraId: "cam-2", microphoneId: "mic-2" });
  service.stopPreview(preview);

  assert.deepEqual(preview, { camera, microphone });
  assert.deepEqual(calls, [
    ["createVideo", { deviceId: { exact: "cam-2" } }],
    ["createAudio", { deviceId: { exact: "mic-2" } }],
    ["video:stop"],
    ["audio:stop"],
  ]);
});

test("camera and microphone selection switch the active preview tracks", async () => {
  const calls = [];
  const service = createMediaDeviceService({
    mediaDevices: { ondevicechange: null, async getUserMedia() {}, async enumerateDevices() { return []; } },
    isSecureContext: () => true,
    getHostname: () => "localhost",
    createLocalVideoTrack() {},
    createLocalAudioTrack() {},
  });

  await service.switchCamera(track("video", calls), "cam-3");
  await service.switchMicrophone(track("audio", calls), "mic-3");

  assert.deepEqual(calls, [
    ["video:switch", "cam-3"],
    ["audio:switch", "mic-3"],
  ]);
});

test("preview reports camera denial without requesting the microphone", async () => {
  let microphoneRequested = false;
  const service = createMediaDeviceService({
    mediaDevices: { ondevicechange: null, async getUserMedia() {}, async enumerateDevices() { return []; } },
    isSecureContext: () => true,
    getHostname: () => "localhost",
    async createLocalVideoTrack() {
      throw new DOMException("denied", "NotAllowedError");
    },
    async createLocalAudioTrack() {
      microphoneRequested = true;
    },
  });

  await assert.rejects(
    service.createPreview({ cameraId: "cam", microphoneId: "mic" }),
    (error) => error instanceof StudioMediaError && error.code === "camera-denied",
  );
  assert.equal(microphoneRequested, false);
});

test("preview stops the camera when microphone permission is denied", async () => {
  const calls = [];
  const service = createMediaDeviceService({
    mediaDevices: { ondevicechange: null, async getUserMedia() {}, async enumerateDevices() { return []; } },
    isSecureContext: () => true,
    getHostname: () => "localhost",
    async createLocalVideoTrack() { return track("video", calls); },
    async createLocalAudioTrack() {
      throw new DOMException("denied", "NotAllowedError");
    },
  });

  await assert.rejects(
    service.createPreview({ cameraId: "cam", microphoneId: "mic" }),
    (error) => error instanceof StudioMediaError && error.code === "microphone-denied",
  );
  assert.deepEqual(calls, [["video:stop"]]);
});
