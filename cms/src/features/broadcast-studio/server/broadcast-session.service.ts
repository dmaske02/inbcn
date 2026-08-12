"use server";

import { env } from "@/config/env";
import { requireAdminUser } from "@/features/admin/auth/server";
import {
  createRoom,
  generateBroadcasterToken,
} from "@/features/live-broadcast/livekit.service";
import type { BroadcastLanguage } from "@/features/live-broadcast/broadcast.types";

import { createBroadcastSessionService } from "./broadcast-session.service-core";

const service = createBroadcastSessionService({
  authorize: requireAdminUser,
  createRoom,
  generateBroadcasterToken,
  getServerUrl() {
    const url = env.server.liveKit.url;
    if (!url) throw new Error("LiveKit is not configured.");
    return url;
  },
});

export async function requestBroadcastSession(language: BroadcastLanguage) {
  return service.requestSession(language);
}
