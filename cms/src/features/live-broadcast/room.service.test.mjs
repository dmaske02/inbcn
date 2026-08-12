import assert from "node:assert/strict";
import test from "node:test";

import { createBroadcastRoomService } from "./room.service.ts";

function repositoryDouble(rooms = []) {
  const calls = [];
  return {
    calls,
    repository: {
      async createRoom(input) {
        calls.push(["createRoom", input]);
        return { sid: "RM_1", name: input.name, participantCount: 0 };
      },
      async deleteRoom(name) {
        calls.push(["deleteRoom", name]);
      },
      async listRooms() {
        calls.push(["listRooms"]);
        return rooms;
      },
    },
  };
}

test("createRoom derives a canonical room name and forwards supported options", async () => {
  const { calls, repository } = repositoryDouble();
  const service = createBroadcastRoomService(repository);

  const room = await service.createRoom("hi", { emptyTimeout: 300, maxParticipants: 250 });

  assert.deepEqual(calls, [["createRoom", {
    name: "broadcast-hi",
    emptyTimeout: 300,
    maxParticipants: 250,
  }]]);
  assert.deepEqual(room, {
    sid: "RM_1",
    name: "broadcast-hi",
    language: "hi",
    participantCount: 0,
  });
});

test("deleteRoom deletes only the canonical room for the requested language", async () => {
  const { calls, repository } = repositoryDouble();
  const service = createBroadcastRoomService(repository);

  await service.deleteRoom("mr");

  assert.deepEqual(calls, [["deleteRoom", "broadcast-mr"]]);
});

test("listActiveRooms returns only supported INBCN broadcast rooms", async () => {
  const { repository } = repositoryDouble([
    { sid: "RM_EN", name: "broadcast-en", participantCount: 10 },
    { sid: "RM_OTHER", name: "meeting-room", participantCount: 2 },
    { sid: "RM_FR", name: "broadcast-fr", participantCount: 4 },
    { sid: "RM_MR", name: "broadcast-mr", participantCount: 3 },
  ]);
  const service = createBroadcastRoomService(repository);

  assert.deepEqual(await service.listActiveRooms(), [
    { sid: "RM_EN", name: "broadcast-en", language: "en", participantCount: 10 },
    { sid: "RM_MR", name: "broadcast-mr", language: "mr", participantCount: 3 },
  ]);
});
