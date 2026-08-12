import "server-only";

import { randomUUID } from "node:crypto";
import { RoomServiceClient } from "livekit-server-sdk";

import { env } from "@/config/env";
import {
  generateViewerToken,
  listActiveRooms,
} from "@/features/live-broadcast/livekit.service";
import type { BroadcastLanguage } from "@/features/live-broadcast/broadcast.types";

import { createViewerSessionService } from "./viewer.service-core";

function configuredRoomClient() {
  const { url, apiKey, apiSecret } = env.server.liveKit;
  if (!url || !apiKey || !apiSecret) {
    throw new Error("LiveKit is not configured.");
  }
  return new RoomServiceClient(url, apiKey, apiSecret);
}

const service = createViewerSessionService({
  listActiveRooms,
  listParticipants(roomName) {
    return configuredRoomClient().listParticipants(roomName);
  },
  generateViewerToken,
  getServerUrl() {
    const url = env.server.liveKit.url;
    if (!url) throw new Error("LiveKit is not configured.");
    return url;
  },
  createViewerIdentity() {
    return `viewer-${randomUUID()}`;
  },
});

export function getInternalBroadcastViewerSession(language: BroadcastLanguage) {
  return service.getViewerSession(language);
}
