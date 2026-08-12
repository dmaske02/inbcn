import assert from "node:assert/strict";
import test from "node:test";

import {
  parseBroadcastTokenInput,
  toBroadcastRoomName,
} from "./broadcast.model.ts";

test("toBroadcastRoomName creates the approved language-scoped room names", () => {
  assert.equal(toBroadcastRoomName("en"), "broadcast-en");
  assert.equal(toBroadcastRoomName("hi"), "broadcast-hi");
  assert.equal(toBroadcastRoomName("mr"), "broadcast-mr");
});

test("toBroadcastRoomName rejects unsupported languages", () => {
  assert.throws(() => toBroadcastRoomName("fr"), /language/i);
});

test("parseBroadcastTokenInput trims identities and accepts all Phase 1 roles", () => {
  for (const role of ["broadcaster", "viewer", "admin"]) {
    assert.deepEqual(
      parseBroadcastTokenInput({ identity: "  participant-1  ", language: "en", role }),
      { identity: "participant-1", language: "en", role },
    );
  }
});

test("parseBroadcastTokenInput rejects empty participant identities", () => {
  assert.throws(
    () => parseBroadcastTokenInput({ identity: "   ", language: "en", role: "viewer" }),
    /identity/i,
  );
});
