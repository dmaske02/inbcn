import assert from "node:assert/strict";
import test from "node:test";

import {
  canAccessBroadcastStudio,
  formatBroadcastDuration,
  initialBroadcastStudioState,
  reduceBroadcastStudioState,
} from "./broadcast-session.model.ts";

test("only editors and administrators may access Broadcast Studio", () => {
  assert.equal(canAccessBroadcastStudio("writer"), false);
  assert.equal(canAccessBroadcastStudio("editor"), true);
  assert.equal(canAccessBroadcastStudio("admin"), true);
});

test("studio state follows idle, preview, connecting, live, and disconnected", () => {
  const preview = reduceBroadcastStudioState(initialBroadcastStudioState, {
    type: "preview-ready",
  });
  const connecting = reduceBroadcastStudioState(preview, { type: "connecting" });
  const live = reduceBroadcastStudioState(connecting, {
    type: "connected",
    startedAt: 1_000,
  });
  const disconnected = reduceBroadcastStudioState(live, {
    type: "disconnected",
  });

  assert.equal(preview.status, "preview");
  assert.equal(connecting.status, "connecting");
  assert.deepEqual(live, {
    status: "live",
    networkStatus: "connected",
    startedAt: 1_000,
    error: null,
  });
  assert.equal(disconnected.status, "disconnected");
  assert.equal(disconnected.startedAt, null);
});

test("reconnect events preserve the live start time", () => {
  const live = {
    status: "live",
    networkStatus: "connected",
    startedAt: 1_000,
    error: null,
  };

  const reconnecting = reduceBroadcastStudioState(live, { type: "reconnecting" });
  const reconnected = reduceBroadcastStudioState(reconnecting, { type: "reconnected" });

  assert.equal(reconnecting.status, "connecting");
  assert.equal(reconnecting.networkStatus, "reconnecting");
  assert.equal(reconnecting.startedAt, 1_000);
  assert.equal(reconnected.status, "live");
  assert.equal(reconnected.networkStatus, "connected");
  assert.equal(reconnected.startedAt, 1_000);
});

test("studio failures retain an actionable safe error", () => {
  const state = reduceBroadcastStudioState(initialBroadcastStudioState, {
    type: "failed",
    error: { code: "camera-denied", message: "Allow camera access and try again." },
  });

  assert.equal(state.status, "error");
  assert.deepEqual(state.error, {
    code: "camera-denied",
    message: "Allow camera access and try again.",
  });
});

test("formatBroadcastDuration formats elapsed live time without going negative", () => {
  assert.equal(formatBroadcastDuration(null, 99_000), "00:00:00");
  assert.equal(formatBroadcastDuration(10_000, 9_000), "00:00:00");
  assert.equal(formatBroadcastDuration(1_000, 3_662_000), "01:01:01");
});
