import "server-only";

import { AccessToken } from "livekit-server-sdk";

import {
  isBroadcastOperatorRole,
  parseBroadcastTokenInput,
  toBroadcastRoomName,
} from "./broadcast.model.ts";
import type {
  BroadcastTokenInput,
  LiveKitCredentials,
} from "./broadcast.types.ts";

const TOKEN_TTL = "10m";

export type BroadcastTokenService = {
  generateBroadcasterToken(input: BroadcastTokenInput): Promise<string>;
  generateViewerToken(input: BroadcastTokenInput): Promise<string>;
};

function accessToken(
  credentials: LiveKitCredentials,
  input: BroadcastTokenInput,
) {
  return new AccessToken(credentials.apiKey, credentials.apiSecret, {
    identity: input.identity,
    ttl: TOKEN_TTL,
    attributes: {
      role: input.role,
      language: input.language,
    },
  });
}

export function createBroadcastTokenService(
  credentials: LiveKitCredentials,
): BroadcastTokenService {
  return {
    async generateBroadcasterToken(rawInput) {
      const input = parseBroadcastTokenInput(rawInput);
      if (!isBroadcastOperatorRole(input.role)) {
        throw new Error("Broadcaster tokens require the broadcaster or admin role.");
      }
      const token = accessToken(credentials, input);
      token.addGrant({
        room: toBroadcastRoomName(input.language),
        roomJoin: true,
        roomAdmin: input.role === "admin",
        canPublish: true,
        canPublishData: false,
        canSubscribe: true,
      });
      return token.toJwt();
    },
    async generateViewerToken(rawInput) {
      const input = parseBroadcastTokenInput(rawInput);
      if (input.role !== "viewer") {
        throw new Error("Viewer tokens require the viewer role.");
      }
      const token = accessToken(credentials, input);
      token.addGrant({
        room: toBroadcastRoomName(input.language),
        roomJoin: true,
        canPublish: false,
        canPublishData: false,
        canSubscribe: true,
      });
      return token.toJwt();
    },
  };
}
