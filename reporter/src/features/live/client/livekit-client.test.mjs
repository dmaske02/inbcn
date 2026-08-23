import assert from "node:assert/strict";
import test from "node:test";

import { createLiveKitBroadcastClient } from "./livekit-client.ts";

function roomDouble() {
  const calls = [];
  const handlers = new Map();
  return {
    calls,
    handlers,
    room: {
      localParticipant: { async publishTrack(track) { calls.push(["publish", track]); } },
      on(event, handler) { handlers.set(event, handler); return this; },
      off(event) { handlers.delete(event); return this; },
      async connect(url, token, options) { calls.push(["connect", url, token, options]); },
      async disconnect(stopTracks) { calls.push(["disconnect", stopTracks]); },
    },
  };
}

test("client publishes only preview camera and microphone without subscriptions", async () => {
  const { calls, room } = roomDouble();
  const client = createLiveKitBroadcastClient(() => room);
  const tracks = { camera: { id: "camera" }, microphone: { id: "microphone" } };
  await client.connect({ serverUrl: "wss://livekit.example.test", token: "token", roomName: "room", startsAt: "start", endsAt: "end", recordingState: "recording" }, tracks, {});
  assert.deepEqual(calls, [
    ["connect", "wss://livekit.example.test", "token", { autoSubscribe: false }],
    ["publish", tracks.camera],
    ["publish", tracks.microphone],
  ]);
});

test("client maps LiveKit room deletion and participant removal to an admin terminal signal", async () => {
  const { handlers, room } = roomDouble();
  const received = [];
  const client = createLiveKitBroadcastClient(() => room);
  await client.connect({ serverUrl: "wss://livekit.example.test", token: "token", roomName: "room", startsAt: "start", endsAt: "end", recordingState: "recording" }, { camera: {}, microphone: {} }, {
    onDisconnected: (reason) => received.push(reason),
  });
  handlers.get("disconnected")?.(5);
  handlers.get("disconnected")?.(4);
  assert.deepEqual(received, ["admin-terminated", "admin-terminated"]);
});

test("client forwards LiveKit recording status changes", async () => {
  const { handlers, room } = roomDouble();
  const received = [];
  const client = createLiveKitBroadcastClient(() => room);
  await client.connect({ serverUrl: "wss://livekit.example.test", token: "token", roomName: "room", startsAt: "start", endsAt: "end", recordingState: "recording" }, { camera: {}, microphone: {} }, {
    onRecordingStatusChanged: (isRecording) => received.push(isRecording),
  });
  handlers.get("recordingStatusChanged")?.(true);
  handlers.get("recordingStatusChanged")?.(false);
  assert.deepEqual(received, [true, false]);
});
