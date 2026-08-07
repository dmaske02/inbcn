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
  const service = createMediaDeviceService({
    async getLocalDevices(kind) {
      return kind === "videoinput"
        ? [{ deviceId: "cam-1", kind, label: "" }]
        : [{ deviceId: "mic-1", kind, label: "Desk microphone" }];
    },
    createLocalVideoTrack() {},
    createLocalAudioTrack() {},
  });

  assert.deepEqual(await service.listDevices(), {
    cameras: [{ id: "cam-1", label: "Camera 1" }],
    microphones: [{ id: "mic-1", label: "Desk microphone" }],
  });
});

test("preview requests the selected camera and microphone and cleans up both tracks", async () => {
  const calls = [];
  const camera = track("video", calls);
  const microphone = track("audio", calls);
  const service = createMediaDeviceService({
    async getLocalDevices() { return []; },
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
    async getLocalDevices() { return []; },
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
    async getLocalDevices() { return []; },
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
    async getLocalDevices() { return []; },
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
