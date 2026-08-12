import assert from "node:assert/strict";
import test from "node:test";

import {
  isActiveBroadcaster,
  toViewerRoomName,
} from "./viewer.model.ts";

const participant = (overrides = {}) => ({
  identity: "reporter-1",
  state: 2,
  attributes: { role: "broadcaster" },
  tracks: [{ type: 1 }],
  ...overrides,
});

test("language maps to the existing Phase 1 rooms", () => {
  assert.equal(toViewerRoomName("en"), "broadcast-en");
  assert.equal(toViewerRoomName("hi"), "broadcast-hi");
  assert.equal(toViewerRoomName("mr"), "broadcast-mr");
  assert.throws(() => toViewerRoomName("fr"));
});

test("active broadcaster requires a broadcaster or admin role", () => {
  assert.equal(isActiveBroadcaster(participant()), true);
  assert.equal(isActiveBroadcaster(participant({ attributes: { role: "admin" } })), true);
  assert.equal(isActiveBroadcaster(participant({ attributes: { role: "viewer" } })), false);
  assert.equal(isActiveBroadcaster(participant({ attributes: {} })), false);
});

test("disconnected and not-yet-active broadcasters are not live", () => {
  assert.equal(isActiveBroadcaster(participant({ state: 0 })), false);
  assert.equal(isActiveBroadcaster(participant({ state: 1 })), false);
  assert.equal(isActiveBroadcaster(participant({ state: 3 })), false);
});

test("broadcaster must publish an audio or video track", () => {
  assert.equal(isActiveBroadcaster(participant({ tracks: [] })), false);
  assert.equal(isActiveBroadcaster(participant({ tracks: [{ type: 2 }] })), false);
  assert.equal(isActiveBroadcaster(participant({ tracks: [{ type: 0 }] })), true);
  assert.equal(isActiveBroadcaster(participant({ tracks: [{ type: 1 }] })), true);
});
