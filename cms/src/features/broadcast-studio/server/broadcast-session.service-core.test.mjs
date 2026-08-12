import assert from "node:assert/strict";
import test from "node:test";

import { createBroadcastSessionService } from "./broadcast-session.service-core.ts";

function dependencies(role = "editor") {
  const calls = [];
  return {
    calls,
    dependencies: {
      async authorize() {
        return { id: "user-1", role };
      },
      async createRoom(language) {
        calls.push(["createRoom", language]);
      },
      async generateBroadcasterToken(input) {
        calls.push(["generateBroadcasterToken", input]);
        return "signed-token";
      },
      getServerUrl() {
        return "wss://example.livekit.cloud";
      },
    },
  };
}

test("editor session uses the Phase 1 room and broadcaster token services", async () => {
  const { calls, dependencies: deps } = dependencies("editor");
  const service = createBroadcastSessionService(deps);

  assert.deepEqual(await service.requestSession("hi"), {
    ok: true,
    credentials: {
      serverUrl: "wss://example.livekit.cloud",
      token: "signed-token",
      roomName: "broadcast-hi",
    },
  });
  assert.deepEqual(calls, [
    ["createRoom", "hi"],
    ["generateBroadcasterToken", {
      identity: "user-1",
      language: "hi",
      role: "broadcaster",
    }],
  ]);
});

test("administrator session requests an admin broadcaster token", async () => {
  const { calls, dependencies: deps } = dependencies("admin");
  const service = createBroadcastSessionService(deps);

  await service.requestSession("mr");

  assert.deepEqual(calls.at(-1), ["generateBroadcasterToken", {
    identity: "user-1",
    language: "mr",
    role: "admin",
  }]);
});

test("writer receives access denied before any room or token operation", async () => {
  const { calls, dependencies: deps } = dependencies("writer");
  const service = createBroadcastSessionService(deps);

  assert.deepEqual(await service.requestSession("en"), {
    ok: false,
    error: { code: "access-denied", message: "You do not have access to Broadcast Studio." },
  });
  assert.deepEqual(calls, []);
});

test("token failures retain the provider exception without exposing the token", async () => {
  const { dependencies: deps } = dependencies("editor");
  deps.generateBroadcasterToken = async () => {
    throw new Error("secret provider details");
  };
  const service = createBroadcastSessionService(deps);

  assert.deepEqual(await service.requestSession("en"), {
    ok: false,
    error: {
      code: "token-failure",
      message: "Failed to generate broadcaster token: secret provider details",
    },
  });
});

test("room API failures retain their exact HTTP status", async () => {
  const { dependencies: deps } = dependencies("editor");
  deps.createRoom = async () => {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  };
  const service = createBroadcastSessionService(deps);

  assert.deepEqual(await service.requestSession("en"), {
    ok: false,
    error: {
      code: "token-failure",
      message: "Failed to create room: Unauthorized (status 401)",
    },
  });
});
