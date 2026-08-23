import assert from "node:assert/strict";
import test from "node:test";

import { createLiveKitTerminationProvider } from "./live-termination.provider.ts";

test("provider removes the DB-owned reporter identity before deleting the exact room", async () => {
  const calls = [];
  const provider = createLiveKitTerminationProvider({
    async removeParticipant(room, identity, options) { calls.push(["remove", room, identity, options]); },
    async deleteRoom(room) { calls.push(["delete", room]); },
  }, () => 1_700_000_000);
  await provider({ roomName: "reporter-live-22222222222242228222222222222222", profileId: "11111111-1111-4111-8111-111111111111" });
  assert.deepEqual(calls, [
    ["remove", "reporter-live-22222222222242228222222222222222", "11111111-1111-4111-8111-111111111111", { revokeTokenTs: 1_700_000_000n }],
    ["delete", "reporter-live-22222222222242228222222222222222"],
  ]);
});

test("provider treats already-absent participants and rooms as completed cleanup", async () => {
  const provider = createLiveKitTerminationProvider({
    async removeParticipant() { throw Object.assign(new Error("gone"), { status: 404 }); },
    async deleteRoom() { throw Object.assign(new Error("gone"), { status: 404 }); },
  });
  await provider({ roomName: "reporter-live-22222222222242228222222222222222", profileId: "11111111-1111-4111-8111-111111111111" });
  assert.ok(true);
});

test("provider still deletes the exact room when participant cleanup must be retried", async () => {
  const calls = [];
  const provider = createLiveKitTerminationProvider({
    async removeParticipant(room, identity) { calls.push(["remove", room, identity]); throw new Error("provider unavailable"); },
    async deleteRoom(room) { calls.push(["delete", room]); },
  });
  await assert.rejects(() => provider({ roomName: "reporter-live-22222222222242228222222222222222", profileId: "11111111-1111-4111-8111-111111111111" }));
  assert.deepEqual(calls, [
    ["remove", "reporter-live-22222222222242228222222222222222", "11111111-1111-4111-8111-111111111111"],
    ["delete", "reporter-live-22222222222242228222222222222222"],
  ]);
});
