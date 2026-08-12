import "server-only";

import type { RoomServiceClient } from "livekit-server-sdk";

import type {
  BroadcastRepository,
  BroadcastRoomRecord,
} from "./broadcast.types.ts";

type RoomClient = Pick<
  RoomServiceClient,
  "createRoom" | "deleteRoom" | "listRooms"
>;

type LiveKitRoom = Awaited<ReturnType<RoomClient["createRoom"]>>;

function toBroadcastRoomRecord(room: LiveKitRoom): BroadcastRoomRecord {
  return {
    sid: room.sid,
    name: room.name,
    participantCount: room.numParticipants,
  };
}

export function createLiveKitBroadcastRepository(
  client: RoomClient,
): BroadcastRepository {
  return {
    async createRoom(input) {
      return toBroadcastRoomRecord(await client.createRoom(input));
    },
    async deleteRoom(name) {
      await client.deleteRoom(name);
    },
    async listRooms() {
      return (await client.listRooms()).map(toBroadcastRoomRecord);
    },
  };
}
