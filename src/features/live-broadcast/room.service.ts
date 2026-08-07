import "server-only";

import {
  parseBroadcastRoomName,
  parseBroadcastRoomOptions,
  toBroadcastRoomName,
} from "./broadcast.model.ts";
import type {
  BroadcastLanguage,
  BroadcastRepository,
  BroadcastRoom,
  BroadcastRoomOptions,
} from "./broadcast.types.ts";

export type BroadcastRoomService = {
  createRoom(
    language: BroadcastLanguage,
    options?: BroadcastRoomOptions,
  ): Promise<BroadcastRoom>;
  deleteRoom(language: BroadcastLanguage): Promise<void>;
  listActiveRooms(): Promise<BroadcastRoom[]>;
};

export function createBroadcastRoomService(
  repository: BroadcastRepository,
): BroadcastRoomService {
  return {
    async createRoom(language, options = {}) {
      const name = toBroadcastRoomName(language);
      const validatedOptions = parseBroadcastRoomOptions(options);
      const room = await repository.createRoom({ name, ...validatedOptions });
      return { ...room, name, language };
    },
    async deleteRoom(language) {
      await repository.deleteRoom(toBroadcastRoomName(language));
    },
    async listActiveRooms() {
      const rooms = await repository.listRooms();
      return rooms.flatMap((room) => {
        const language = parseBroadcastRoomName(room.name);
        if (!language) return [];
        return [{ ...room, name: toBroadcastRoomName(language), language }];
      });
    },
  };
}
