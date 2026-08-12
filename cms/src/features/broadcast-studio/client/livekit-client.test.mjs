import assert from "node:assert/strict";
import test from "node:test";

import { createLiveKitBroadcastClient } from "./livekit-client.ts";

function roomDouble() {
  const calls = [];
  const handlers = new Map();
  const room = {
    localParticipant: {
      async publishTrack(track) {
        calls.push(["publishTrack", track]);
      },
    },
    on(event, handler) {
      handlers.set(event, handler);
      return room;
    },
    off(event) {
      handlers.delete(event);
      return room;
    },
    async connect(url, token, options) {
      calls.push(["connect", url, token, options]);
    },
    async disconnect(stopTracks) {
      calls.push(["disconnect", stopTracks]);
    },
    async switchActiveDevice(kind, id, exact) {
      calls.push(["switchActiveDevice", kind, id, exact]);
      return true;
    },
  };
  return { calls, handlers, room };
}

test("client joins without subscriptions and publishes the preview camera and microphone", async () => {
  const { calls, room } = roomDouble();
  const client = createLiveKitBroadcastClient(() => room);
  const tracks = { camera: { id: "camera" }, microphone: { id: "microphone" } };

  await client.connect(
    { serverUrl: "wss://example.livekit.cloud", token: "jwt", roomName: "broadcast-en" },
    tracks,
    {},
  );

  assert.deepEqual(calls, [
    ["connect", "wss://example.livekit.cloud", "jwt", { autoSubscribe: false }],
    ["publishTrack", tracks.camera],
    ["publishTrack", tracks.microphone],
  ]);
});

test("client forwards reconnect and disconnect events", async () => {
  const { handlers, room } = roomDouble();
  const events = [];
  const client = createLiveKitBroadcastClient(() => room);

  await client.connect(
    { serverUrl: "wss://example.livekit.cloud", token: "jwt", roomName: "broadcast-hi" },
    { camera: {}, microphone: {} },
    {
      onReconnecting: () => events.push("reconnecting"),
      onReconnected: () => events.push("reconnected"),
      onDisconnected: () => events.push("disconnected"),
    },
  );
  handlers.get("reconnecting")?.();
  handlers.get("reconnected")?.();
  handlers.get("disconnected")?.();

  assert.deepEqual(events, ["reconnecting", "reconnected", "disconnected"]);
});

test("client switches published devices and disconnects with track cleanup", async () => {
  const { calls, room } = roomDouble();
  const client = createLiveKitBroadcastClient(() => room);
  await client.connect(
    { serverUrl: "wss://example.livekit.cloud", token: "jwt", roomName: "broadcast-mr" },
    { camera: {}, microphone: {} },
    {},
  );

  await client.switchCamera("cam-2");
  await client.switchMicrophone("mic-2");
  await client.disconnect();

  assert.deepEqual(calls.slice(-3), [
    ["switchActiveDevice", "videoinput", "cam-2", true],
    ["switchActiveDevice", "audioinput", "mic-2", true],
    ["disconnect", true],
  ]);
});

test("client disconnects when publishing fails", async () => {
  const { calls, room } = roomDouble();
  room.localParticipant.publishTrack = async () => {
    throw new Error("publish failed");
  };
  const client = createLiveKitBroadcastClient(() => room);

  await assert.rejects(
    client.connect(
      { serverUrl: "wss://example.livekit.cloud", token: "jwt", roomName: "broadcast-en" },
      { camera: {}, microphone: {} },
      {},
    ),
    /publish failed/u,
  );
  assert.deepEqual(calls.at(-1), ["disconnect", true]);
});
