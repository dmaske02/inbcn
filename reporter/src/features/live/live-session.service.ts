import "server-only";

import type { Json } from "@inbcn/database";

import type { PrivateStorageConfig, RecordingStartResult } from "./egress.server.ts";
import type { LiveKitRoomInput } from "./livekit.server.ts";

type LiveSessionErrorCode =
  | "CONFIGURATION"
  | "FORBIDDEN"
  | "STARTING"
  | "UNAVAILABLE";

export class LiveSessionError extends Error {
  readonly code: LiveSessionErrorCode;
  readonly httpStatus: 403 | 503;

  constructor(
    code: LiveSessionErrorCode,
    httpStatus: 403 | 503,
  ) {
    super("The live session could not be created.");
    this.name = "LiveSessionError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

type LiveConfiguration = Readonly<{
  serverUrl: string;
  apiUrl: string;
  apiKey: string;
  apiSecret: string;
  storage: PrivateStorageConfig;
}>;

type ReservationFacts = Readonly<{
  requestId: string;
  recordingId: string;
  roomName: string;
  startsAt: string;
  endsAt: string;
}>;

type Reservation =
  | Readonly<{ state: "busy" }>
  | (ReservationFacts & Readonly<{
      state: "existing";
      recordingState: "recording";
    }>)
  | (ReservationFacts & Readonly<{
      state: "claimed";
      claimToken: string;
      reclaimed: boolean;
    }>);

type FinalAuthorizationFacts = Readonly<{
  requestId: string;
  roomName: string;
  startsAt: string;
  endsAt: string;
  recordingState: "failed" | "recording";
}>;

type Dependencies = Readonly<{
  getConfig(): LiveConfiguration;
  now(): string;
  reserve(input: Readonly<{
    profileId: string;
    accessGeneration: number;
    requestId: string;
  }>): Promise<Reservation>;
  authorizeFinal(input: Readonly<{
    profileId: string;
    accessGeneration: number;
    requestId: string;
    recordingId: string;
  }>): Promise<FinalAuthorizationFacts>;
  complete(input: Readonly<{
    recordingId: string;
    claimToken: string;
    egressId: string;
  }>): Promise<boolean>;
  fail(input: Readonly<{
    recordingId: string;
    claimToken: string;
    failureCode: "egress-start-failed" | "room-create-failed";
  }>): Promise<boolean>;
  createRoom(input: LiveKitRoomInput): Promise<void>;
  startRecording(input: Readonly<{ roomName: string; storageKey: string }>): Promise<RecordingStartResult>;
  listActiveRecordings(roomName: string): Promise<readonly Readonly<{
    egressId: string | null;
    storageKey: string | null;
  }>[]>;
  generateToken(input: Readonly<{
    apiKey: string;
    apiSecret: string;
    profileId: string;
    requestId: string;
    roomName: string;
    ttlSeconds: number;
  }>): Promise<string>;
}>;

export type ReporterLiveSession = Readonly<{
  serverUrl: string;
  token: string;
  roomName: string;
  startsAt: string;
  endsAt: string;
  recordingState: "failed" | "recording";
}>;

const ROOM_OPTIONS = Object.freeze({
  emptyTimeout: 60,
  departureTimeout: 60,
  maxParticipants: 4,
});
const MAX_INITIAL_PUBLISHER_TTL_SECONDS = 120;

function ttlSeconds(endsAt: string, now: string): number {
  const remaining = Date.parse(endsAt) - Date.parse(now);
  if (!Number.isFinite(remaining) || remaining <= 0) {
    throw new LiveSessionError("FORBIDDEN", 403);
  }
  return Math.min(Math.ceil(remaining / 1_000) + 60, MAX_INITIAL_PUBLISHER_TTL_SECONDS);
}

function validEgressId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 1 && value.trim().length <= 255;
}

async function safeFail(
  dependencies: Dependencies,
  reservation: Extract<Reservation, { state: "claimed" }>,
  failureCode: "egress-start-failed" | "room-create-failed",
): Promise<boolean> {
  try {
    return await dependencies.fail({
      recordingId: reservation.recordingId,
      claimToken: reservation.claimToken,
      failureCode,
    });
  } catch {
    // A failed CAS is safe to retry; raw provider/database details never leave the server.
    return false;
  }
}

export function createLiveSessionService(dependencies: Dependencies) {
  return {
    async request(input: Readonly<{
      profileId: string;
      accessGeneration: number;
      requestId: string;
    }>): Promise<ReporterLiveSession> {
      const config = dependencies.getConfig();
      let reservation: Reservation;
      try {
        reservation = await dependencies.reserve(input);
      } catch (error) {
        if (error instanceof LiveSessionError) throw error;
        throw new LiveSessionError("UNAVAILABLE", 503);
      }
      if (reservation.state === "busy") {
        throw new LiveSessionError("STARTING", 503);
      }

      const issueAuthorizedSession = async (): Promise<ReporterLiveSession> => {
        let authorized: FinalAuthorizationFacts;
        try {
          authorized = await dependencies.authorizeFinal({
            profileId: input.profileId,
            accessGeneration: input.accessGeneration,
            requestId: reservation.requestId,
            recordingId: reservation.recordingId,
          });
        } catch (error) {
          if (error instanceof LiveSessionError) throw error;
          throw new LiveSessionError("UNAVAILABLE", 503);
        }
        const token = await dependencies.generateToken({
          apiKey: config.apiKey,
          apiSecret: config.apiSecret,
          profileId: input.profileId,
          requestId: authorized.requestId,
          roomName: authorized.roomName,
          ttlSeconds: ttlSeconds(authorized.endsAt, dependencies.now()),
        });
        return {
          serverUrl: config.serverUrl,
          token,
          roomName: authorized.roomName,
          startsAt: authorized.startsAt,
          endsAt: authorized.endsAt,
          recordingState: authorized.recordingState,
        };
      };
      if (reservation.state === "existing") {
        return issueAuthorizedSession();
      }

      try {
        await dependencies.createRoom({ name: reservation.roomName, ...ROOM_OPTIONS });
      } catch {
        await safeFail(dependencies, reservation, "room-create-failed");
        throw new LiveSessionError("UNAVAILABLE", 503);
      }

      const storageKey = `reporter-live/${reservation.requestId}/${reservation.recordingId}.mp4`;
      let egressId: string | undefined;
      if (reservation.reclaimed) {
        let active;
        try {
          active = await dependencies.listActiveRecordings(reservation.roomName);
        } catch {
          throw new LiveSessionError("STARTING", 503);
        }
        const exact = active.filter((item) => item.storageKey === storageKey);
        if (exact.length === 1) {
          if (!validEgressId(exact[0].egressId)) {
            throw new LiveSessionError("STARTING", 503);
          }
          egressId = exact[0].egressId.trim();
        } else if (active.length > 0) {
          throw new LiveSessionError("STARTING", 503);
        }
      }

      if (!egressId) {
        let startResult: RecordingStartResult;
        try {
          startResult = await dependencies.startRecording({
            roomName: reservation.roomName,
            storageKey,
          });
        } catch {
          throw new LiveSessionError("STARTING", 503);
        }
        if (startResult.state === "ambiguous") {
          throw new LiveSessionError("STARTING", 503);
        }
        if (startResult.state === "definitive-failure") {
          if (!await safeFail(dependencies, reservation, "egress-start-failed")) {
            throw new LiveSessionError("STARTING", 503);
          }
          return issueAuthorizedSession();
        }
        if (!validEgressId(startResult.egressId)) {
          throw new LiveSessionError("STARTING", 503);
        }
        egressId = startResult.egressId.trim();
      }

      let completed = false;
      try {
        completed = await dependencies.complete({
          recordingId: reservation.recordingId,
          claimToken: reservation.claimToken,
          egressId,
        });
      } catch {
        // The active provider item is reconciled after the five-minute DB lease.
      }
      if (!completed) throw new LiveSessionError("STARTING", 503);

      return issueAuthorizedSession();
    },
  } as const;
}

function jsonRecord(value: Json): Record<string, Json | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new LiveSessionError("UNAVAILABLE", 503);
  }
  return value;
}

function reservationFromJson(value: Json): Reservation {
  const data = jsonRecord(value);
  if (data.state === "busy") return { state: "busy" };
  if ((data.state === "claimed" || data.state === "existing")
    && typeof data.request_id === "string"
    && typeof data.recording_id === "string"
    && typeof data.room_name === "string"
    && typeof data.starts_at === "string"
    && typeof data.ends_at === "string") {
    const facts = {
      requestId: data.request_id,
      recordingId: data.recording_id,
      roomName: data.room_name,
      startsAt: data.starts_at,
      endsAt: data.ends_at,
    };
    if (data.state === "existing" && data.recording_state === "recording") {
      return { state: "existing", recordingState: "recording", ...facts };
    }
    if (data.state === "claimed" && typeof data.claim_token === "string"
      && typeof data.reclaimed === "boolean") {
      return { state: "claimed", claimToken: data.claim_token, reclaimed: data.reclaimed, ...facts };
    }
  }
  throw new LiveSessionError("UNAVAILABLE", 503);
}

function authorizationFromJson(value: Json): FinalAuthorizationFacts {
  const data = jsonRecord(value);
  if (typeof data.request_id === "string"
    && typeof data.room_name === "string"
    && typeof data.starts_at === "string"
    && typeof data.ends_at === "string"
    && (data.recording_state === "recording" || data.recording_state === "failed")) {
    return {
      requestId: data.request_id,
      roomName: data.room_name,
      startsAt: data.starts_at,
      endsAt: data.ends_at,
      recordingState: data.recording_state,
    };
  }
  throw new LiveSessionError("UNAVAILABLE", 503);
}

function rpcError(error: Readonly<{ code?: string }> | null) {
  if (!error) return;
  const forbidden = error.code === "42501" || error.code === "P0002";
  throw new LiveSessionError(forbidden ? "FORBIDDEN" : "UNAVAILABLE", forbidden ? 403 : 503);
}

async function runtimeService() {
  const [{ env }, { createAdminClient }, livekit, egress] = await Promise.all([
    import("../../config/env.ts"),
    import("../../lib/supabase/admin.ts"),
    import("./livekit.server.ts"),
    import("./egress.server.ts"),
  ]);
  const { url, apiKey, apiSecret, storage } = env.server.liveKit;
  const { accessKey, secret, bucket } = storage;
  if (!url || !apiKey || !apiSecret || !accessKey || !secret || !bucket) {
    throw new LiveSessionError("CONFIGURATION", 503);
  }
  let urls: ReturnType<typeof livekit.liveKitUrls>;
  try {
    urls = livekit.liveKitUrls(url);
  } catch {
    throw new LiveSessionError("CONFIGURATION", 503);
  }
  const privateStorage: PrivateStorageConfig = {
    accessKey,
    secret,
    bucket,
    endpoint: storage.endpoint,
    region: storage.region,
    forcePathStyle: storage.forcePathStyle,
  };
  const providerConfig = { ...urls, apiKey, apiSecret, storage: privateStorage };
  const createRoom = livekit.createConfiguredRoomProvider(providerConfig);
  const recording = egress.createConfiguredEgressProvider(providerConfig);

  return createLiveSessionService({
    getConfig: () => providerConfig,
    now: () => new Date().toISOString(),
    async reserve(input) {
      const { data, error } = await createAdminClient().rpc("reserve_reporter_live_recording", {
        p_profile_id: input.profileId,
        p_access_generation: input.accessGeneration,
        p_request_id: input.requestId,
      });
      rpcError(error);
      return reservationFromJson(data);
    },
    async authorizeFinal(input) {
      const { data, error } = await createAdminClient().rpc("authorize_reporter_live_session", {
        p_profile_id: input.profileId,
        p_access_generation: input.accessGeneration,
        p_request_id: input.requestId,
        p_recording_id: input.recordingId,
      });
      rpcError(error);
      return authorizationFromJson(data);
    },
    async complete(input) {
      const { data, error } = await createAdminClient().rpc("complete_reporter_live_recording_start", {
        p_recording_id: input.recordingId,
        p_claim_token: input.claimToken,
        p_egress_id: input.egressId,
      });
      if (error) throw new LiveSessionError("UNAVAILABLE", 503);
      return data;
    },
    async fail(input) {
      const { data, error } = await createAdminClient().rpc("fail_reporter_live_recording_start", {
        p_recording_id: input.recordingId,
        p_claim_token: input.claimToken,
        p_failure_code: input.failureCode,
      });
      if (error) throw new LiveSessionError("UNAVAILABLE", 503);
      return data;
    },
    createRoom,
    startRecording: (request) => egress.startRoomRecording({ ...providerConfig, ...request }),
    listActiveRecordings: recording.listActiveRecordings,
    generateToken: livekit.generatePublisherToken,
  });
}

export async function requestReporterLiveSession(requestId: string, actor: Readonly<{
  profileId: string;
  accessGeneration: number;
}>): Promise<ReporterLiveSession> {
  return (await runtimeService()).request({ ...actor, requestId });
}
