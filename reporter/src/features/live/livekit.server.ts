import "server-only";

import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
} from "livekit-server-sdk";

export type LiveKitRoomInput = Readonly<{
  name: string;
  emptyTimeout: number;
  departureTimeout: number;
  maxParticipants: number;
}>;

export function liveKitUrls(value: string) {
  const parsed = new URL(value);
  if (!["http:", "https:", "ws:", "wss:"].includes(parsed.protocol)
    || parsed.username || parsed.password || parsed.pathname !== "/"
    || parsed.search || parsed.hash
    || (parsed.href !== parsed.origin && parsed.href !== `${parsed.origin}/`)) {
    throw new TypeError("LiveKit URL must be an origin URL.");
  }
  const secure = parsed.protocol === "https:" || parsed.protocol === "wss:";
  return {
    apiUrl: `${secure ? "https" : "http"}://${parsed.host}`,
    serverUrl: `${secure ? "wss" : "ws"}://${parsed.host}`,
  } as const;
}

export function createRoomProvider(client: Pick<RoomServiceClient, "createRoom">) {
  return async (input: LiveKitRoomInput): Promise<void> => {
    await client.createRoom(input);
  };
}

export function createConfiguredRoomProvider(input: Readonly<{
  apiUrl: string;
  apiKey: string;
  apiSecret: string;
}>) {
  return createRoomProvider(new RoomServiceClient(input.apiUrl, input.apiKey, input.apiSecret));
}

export async function generatePublisherToken(input: Readonly<{
  apiKey: string;
  apiSecret: string;
  profileId: string;
  requestId: string;
  roomName: string;
  ttlSeconds: number;
}>): Promise<string> {
  const token = new AccessToken(input.apiKey, input.apiSecret, {
    identity: input.profileId,
    ttl: input.ttlSeconds,
    attributes: { live_request_id: input.requestId },
  });
  token.addGrant({
    room: input.roomName,
    roomJoin: true,
    canPublish: true,
    canPublishSources: [TrackSource.CAMERA, TrackSource.MICROPHONE],
    canSubscribe: false,
    canPublishData: false,
    canUpdateOwnMetadata: false,
  });
  return token.toJwt();
}
