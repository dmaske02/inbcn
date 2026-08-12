import assert from "node:assert/strict";
import test from "node:test";

import { createLiveKitService } from "./livekit.service.ts";

test("LiveKit facade exposes only the approved Phase 1 operations", async () => {
  const calls = [];
  const service = createLiveKitService({
    roomService: {
      async createRoom(language, options) {
        calls.push(["createRoom", language, options]);
        return { name: `broadcast-${language}` };
      },
      async deleteRoom(language) {
        calls.push(["deleteRoom", language]);
      },
      async listActiveRooms() {
        calls.push(["listActiveRooms"]);
        return [];
      },
    },
    tokenService: {
      async generateBroadcasterToken(input) {
        calls.push(["generateBroadcasterToken", input]);
        return "broadcaster-token";
      },
      async generateViewerToken(input) {
        calls.push(["generateViewerToken", input]);
        return "viewer-token";
      },
    },
  });

  assert.deepEqual(await service.createRoom("en"), { name: "broadcast-en" });
  await service.deleteRoom("en");
  assert.deepEqual(await service.listActiveRooms(), []);
  assert.equal(await service.generateBroadcasterToken({ identity: "host", language: "en", role: "broadcaster" }), "broadcaster-token");
  assert.equal(await service.generateViewerToken({ identity: "guest", language: "en", role: "viewer" }), "viewer-token");
  assert.deepEqual(calls, [
    ["createRoom", "en", undefined],
    ["deleteRoom", "en"],
    ["listActiveRooms"],
    ["generateBroadcasterToken", { identity: "host", language: "en", role: "broadcaster" }],
    ["generateViewerToken", { identity: "guest", language: "en", role: "viewer" }],
  ]);
});
