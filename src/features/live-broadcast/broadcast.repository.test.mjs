import assert from "node:assert/strict";
import test from "node:test";

import { createLiveKitBroadcastRepository } from "./broadcast.repository.ts";

test("repository maps the LiveKit room API to the domain contract", async () => {
  const calls = [];
  const client = {
    async createRoom(input) {
      calls.push(["createRoom", input]);
      return { sid: "RM_HI", name: input.name, numParticipants: 1 };
    },
    async deleteRoom(name) {
      calls.push(["deleteRoom", name]);
    },
    async listRooms() {
      calls.push(["listRooms"]);
      return [{ sid: "RM_EN", name: "broadcast-en", numParticipants: 7 }];
    },
  };
  const repository = createLiveKitBroadcastRepository(client);

  assert.deepEqual(
    await repository.createRoom({ name: "broadcast-hi", maxParticipants: 100 }),
    { sid: "RM_HI", name: "broadcast-hi", participantCount: 1 },
  );
  await repository.deleteRoom("broadcast-hi");
  assert.deepEqual(await repository.listRooms(), [
    { sid: "RM_EN", name: "broadcast-en", participantCount: 7 },
  ]);
  assert.deepEqual(calls, [
    ["createRoom", { name: "broadcast-hi", maxParticipants: 100 }],
    ["deleteRoom", "broadcast-hi"],
    ["listRooms"],
  ]);
});
