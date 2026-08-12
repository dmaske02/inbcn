import assert from "node:assert/strict";
import test from "node:test";

import { RoomEvent } from "livekit-client";
import { createLiveKitViewerClient } from "./viewer-client.ts";

function setupRoom() {
  const handlers = new Map();
  const calls = { connect: [], disconnect: 0 };
  const room = {
    on(event, handler) { handlers.set(event, handler); return room; },
    off(event) { handlers.delete(event); return room; },
    async connect(...args) { calls.connect.push(args); },
    async disconnect() { calls.disconnect += 1; },
  };
  return { room, calls, emit: (event, ...args) => handlers.get(event)?.(...args) };
}

const session = {
  serverUrl: "wss://livekit.example.com",
  token: "viewer-token",
  roomName: "broadcast-en",
  broadcasterIdentity: "reporter-en",
};

test("viewer joins with auto-subscribe and exposes broadcaster media", async () => {
  const fake = setupRoom();
  const tracks = [];
  const client = createLiveKitViewerClient(() => fake.room);
  await client.connect(session, { onTrack: (track) => tracks.push(track) });
  assert.deepEqual(fake.calls.connect, [[session.serverUrl, session.token, { autoSubscribe: true }]]);

  const video = { sid: "TR_video", kind: "video", attach() {}, detach() {} };
  fake.emit(RoomEvent.TrackSubscribed, video, {}, { identity: "reporter-en" });
  fake.emit(RoomEvent.TrackSubscribed, { sid: "viewer", kind: "video" }, {}, { identity: "other" });
  assert.deepEqual(tracks, [video]);
});

test("viewer reports reconnect and network quality changes", async () => {
  const fake = setupRoom();
  const events = [];
  const client = createLiveKitViewerClient(() => fake.room);
  await client.connect(session, {
    onReconnecting: () => events.push("reconnecting"),
    onReconnected: () => events.push("reconnected"),
    onNetworkQuality: (quality) => events.push(quality),
  });
  fake.emit(RoomEvent.Reconnecting);
  fake.emit(RoomEvent.ConnectionQualityChanged, "good", { identity: "viewer" });
  fake.emit(RoomEvent.Reconnected);
  assert.deepEqual(events, ["reconnecting", "good", "reconnected"]);
});

test("broadcaster disconnect and final media unpublish return the viewer offline", async () => {
  const fake = setupRoom();
  let offline = 0;
  const client = createLiveKitViewerClient(() => fake.room);
  await client.connect(session, { onOffline: () => { offline += 1; } });
  const publication = { trackSid: "TR_video", kind: "video" };
  fake.emit(RoomEvent.TrackSubscribed, { sid: "TR_video", kind: "video" }, publication, { identity: "reporter-en" });
  fake.emit(RoomEvent.TrackUnpublished, publication, { identity: "reporter-en" });
  assert.equal(offline, 1);

  fake.emit(RoomEvent.ParticipantDisconnected, { identity: "reporter-en" });
  assert.equal(offline, 2);
});

test("viewer leave and repeated cleanup detach handlers and disconnect once", async () => {
  const fake = setupRoom();
  const client = createLiveKitViewerClient(() => fake.room);
  await client.connect(session, {});
  await client.disconnect();
  await client.disconnect();
  assert.equal(fake.calls.disconnect, 1);
});
