import "server-only";

import { RoomServiceClient } from "livekit-server-sdk";

import { env } from "../../config/env.ts";
import { createLiveKitBroadcastRepository } from "./broadcast.repository.ts";
import {
  createBroadcastRoomService,
  type BroadcastRoomService,
} from "./room.service.ts";
import {
  createBroadcastTokenService,
  type BroadcastTokenService,
} from "./token.service.ts";
import type {
  BroadcastLanguage,
  BroadcastRoomOptions,
  BroadcastTokenInput,
} from "./broadcast.types.ts";

type LiveKitServiceDependencies = {
  roomService: BroadcastRoomService;
  tokenService: BroadcastTokenService;
};

export function createLiveKitService({
  roomService,
  tokenService,
}: LiveKitServiceDependencies) {
  return {
    createRoom(language: BroadcastLanguage, options?: BroadcastRoomOptions) {
      return roomService.createRoom(language, options);
    },
    deleteRoom(language: BroadcastLanguage) {
      return roomService.deleteRoom(language);
    },
    listActiveRooms() {
      return roomService.listActiveRooms();
    },
    generateBroadcasterToken(input: BroadcastTokenInput) {
      return tokenService.generateBroadcasterToken(input);
    },
    generateViewerToken(input: BroadcastTokenInput) {
      return tokenService.generateViewerToken(input);
    },
  };
}

function configuredService() {
  const { url, apiKey, apiSecret } = env.server.liveKit;
  if (!url || !apiKey || !apiSecret) {
    throw new Error(
      "LiveKit is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.",
    );
  }
  const repository = createLiveKitBroadcastRepository(
    new RoomServiceClient(url, apiKey, apiSecret),
  );
  return createLiveKitService({
    roomService: createBroadcastRoomService(repository),
    tokenService: createBroadcastTokenService({ apiKey, apiSecret }),
  });
}

export function createRoom(
  language: BroadcastLanguage,
  options?: BroadcastRoomOptions,
) {
  return configuredService().createRoom(language, options);
}

export function deleteRoom(language: BroadcastLanguage) {
  return configuredService().deleteRoom(language);
}

export function listActiveRooms() {
  return configuredService().listActiveRooms();
}

export function generateBroadcasterToken(input: BroadcastTokenInput) {
  return configuredService().generateBroadcasterToken(input);
}

export function generateViewerToken(input: BroadcastTokenInput) {
  return configuredService().generateViewerToken(input);
}
