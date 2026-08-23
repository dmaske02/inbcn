import "server-only";

import { WebhookReceiver } from "livekit-server-sdk";
import { z } from "zod";

import { env } from "../../config/env.ts";

const providerIdSchema = z.string().min(1).max(255).regex(/^[A-Za-z0-9_-]+$/u);
const eventIdSchema = providerIdSchema;
const egressIdSchema = providerIdSchema;
const supportedEvents = new Set(["egress_started", "egress_updated", "egress_ended"]);
const BIGINT_ZERO = BigInt(0);
const NANOSECONDS_PER_MILLISECOND = BigInt(1_000_000);
const NANOSECONDS_PER_SECOND = BigInt(1_000_000_000);
const MAX_DURATION_NANOSECONDS = BigInt("86400000000000");
const MAX_BYTES = BigInt("1099511627776");
const FUTURE_SKEW_MS = 5 * 60 * 1_000;

type Claim =
  | Readonly<{ state: "claimed"; token: string }>
  | Readonly<{ state: "busy" | "processed" }>;

type RecordingTarget = Readonly<{
  recordingId: string;
  requestId: string;
  roomName: string;
  storageKey: string;
  recordingStatus: string;
}>;

type Completion = Readonly<{
  eventId: string;
  processingToken: string;
  eventType: string;
  egressId: string;
  recordingId: string;
  requestId: string;
  roomName: string;
  status: "recording" | "completed" | "failed";
  storageKey: string | null;
  durationSeconds: number | null;
  bytes: number | null;
  providerStartedAt: string | null;
  providerEndedAt: string | null;
  failureCode:
    | "provider-egress-failed"
    | "provider-egress-aborted"
    | "provider-egress-limit-reached"
    | null;
}>;

type Repository = Readonly<{
  claimWebhook(input: Readonly<{ eventId: string; eventType: string; egressId: string }>): Promise<Claim>;
  getRecordingTarget(input: Readonly<{ egressId: string }>): Promise<RecordingTarget | null>;
  completeWebhook(input: Completion): Promise<Readonly<{ state: "updated" | "stale" | "lease-lost" }>>;
  failWebhook(input: Readonly<{
    eventId: string;
    processingToken: string;
    failureCode: "payload-mismatch" | "target-mismatch" | "processing-failed";
  }>): Promise<unknown>;
}>;

type Receiver = Readonly<{
  receive(rawBody: string, authorization?: string): Promise<unknown>;
}>;

export type LiveKitWebhookErrorCode =
  | "configuration-unavailable"
  | "invalid-webhook-signature"
  | "webhook-busy"
  | "webhook-payload-mismatch"
  | "webhook-processing-failed";

export class LiveKitWebhookError extends Error {
  readonly code: LiveKitWebhookErrorCode;
  readonly httpStatus: number;

  constructor(code: LiveKitWebhookErrorCode, httpStatus: number) {
    super("The LiveKit callback could not be processed.");
    this.name = "LiveKitWebhookError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function bigint(value: unknown): bigint | null {
  return typeof value === "bigint" ? value : null;
}

function bigintIso(value: unknown): string | null {
  const nanoseconds = bigint(value);
  if (nanoseconds === null || nanoseconds <= BIGINT_ZERO) return null;
  const milliseconds = nanoseconds / NANOSECONDS_PER_MILLISECOND;
  if (milliseconds > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const date = new Date(Number(milliseconds));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function exactEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length === 0;
}

function canonicalRoom(requestId: string): string {
  return `reporter-live-${requestId.replaceAll("-", "")}`;
}

function canonicalKey(requestId: string, recordingId: string): string {
  return `reporter-live/${requestId}/${recordingId}.mp4`;
}

function locationHasExactKey(location: unknown, key: string): boolean {
  if (typeof location !== "string" || location.length > 2_048) return false;
  try {
    const parsed = new URL(location);
    return !parsed.username && !parsed.password && !parsed.search && !parsed.hash
      && parsed.pathname.endsWith(`/${key}`);
  } catch {
    return false;
  }
}

export function mapEgressStatus(value: unknown): "recording" | "completed" | "failed" | null {
  if (value === 0 || value === 1 || value === 2) return "recording";
  if (value === 3) return "completed";
  if (value === 4 || value === 5 || value === 6) return "failed";
  return null;
}

function validateFileTimes(file: Record<string, unknown>, nowIso: string) {
  const started = bigint(file.startedAt);
  const ended = bigint(file.endedAt);
  const startedAt = bigintIso(started);
  const endedAt = bigintIso(ended);
  const now = Date.parse(nowIso);
  if (!started || !ended || !startedAt || !endedAt || !Number.isFinite(now)
    || ended <= started || Date.parse(startedAt) > now + FUTURE_SKEW_MS
    || Date.parse(endedAt) > now + FUTURE_SKEW_MS) {
    throw new LiveKitWebhookError("webhook-payload-mismatch", 422);
  }
  return { startedAt, endedAt };
}

function safeCompletion(input: Readonly<{
  eventId: string;
  eventType: string;
  egressId: string;
  egress: Record<string, unknown>;
  target: RecordingTarget;
  processingToken: string;
  now: string;
}>): Completion {
  const status = mapEgressStatus(input.egress.status);
  const expectedRoom = canonicalRoom(input.target.requestId);
  const expectedKey = canonicalKey(input.target.requestId, input.target.recordingId);
  if (!status
    || input.egress.roomName !== expectedRoom
    || input.target.roomName !== expectedRoom
    || input.target.storageKey !== expectedKey
    || !exactEmptyArray(input.egress.streamResults)
    || !exactEmptyArray(input.egress.segmentResults)
    || !exactEmptyArray(input.egress.imageResults)) {
    throw new LiveKitWebhookError("webhook-payload-mismatch", 422);
  }

  if ((input.eventType === "egress_ended" && status === "recording")
    || (input.eventType !== "egress_ended" && status !== "recording")) {
    throw new LiveKitWebhookError("webhook-payload-mismatch", 422);
  }

  let storageKey: string | null = null;
  let durationSeconds: number | null = null;
  let bytes: number | null = null;
  let providerStartedAt: string | null = null;
  let providerEndedAt: string | null = null;
  let failureCode: Completion["failureCode"] = null;
  const files = input.egress.fileResults;

  if (status === "completed") {
    if (!Array.isArray(files) || files.length !== 1) {
      throw new LiveKitWebhookError("webhook-payload-mismatch", 422);
    }
    const file = object(files[0]);
    const duration = file && bigint(file.duration);
    const size = file && bigint(file.size);
    if (!file || file.filename !== expectedKey || !locationHasExactKey(file.location, expectedKey)
      || !duration || duration <= BIGINT_ZERO || duration > MAX_DURATION_NANOSECONDS
      || !size || size <= BIGINT_ZERO || size > MAX_BYTES
      || size > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new LiveKitWebhookError("webhook-payload-mismatch", 422);
    }
    const times = validateFileTimes(file, input.now);
    storageKey = expectedKey;
    durationSeconds = Number(duration) / Number(NANOSECONDS_PER_SECOND);
    bytes = Number(size);
    providerStartedAt = times.startedAt;
    providerEndedAt = times.endedAt;
  } else if (status === "failed") {
    failureCode = input.egress.status === 4
      ? "provider-egress-failed"
      : input.egress.status === 5
        ? "provider-egress-aborted"
        : "provider-egress-limit-reached";
  }

  return {
    eventId: input.eventId,
    processingToken: input.processingToken,
    eventType: input.eventType,
    egressId: input.egressId,
    recordingId: input.target.recordingId,
    requestId: input.target.requestId,
    roomName: expectedRoom,
    status,
    storageKey,
    durationSeconds,
    bytes,
    providerStartedAt,
    providerEndedAt,
    failureCode,
  };
}

export function createLiveKitWebhookService(dependencies: Readonly<{
  receiver: Receiver;
  repository: Repository;
  now: () => string;
}>) {
  async function failClaim(
    eventId: string,
    token: string,
    failureCode: "payload-mismatch" | "target-mismatch" | "processing-failed",
  ): Promise<void> {
    try {
      await dependencies.repository.failWebhook({ eventId, processingToken: token, failureCode });
    } catch {
      // The database lease remains retryable if marking the bounded failure fails.
    }
  }

  return {
    async process(rawBody: string, authorization: string) {
      let received: unknown;
      try {
        received = await dependencies.receiver.receive(rawBody, authorization);
      } catch {
        throw new LiveKitWebhookError("invalid-webhook-signature", 401);
      }
      const event = object(received);
      const eventType = typeof event?.event === "string" ? event.event : "";
      if (!supportedEvents.has(eventType)) {
        return { duplicate: false, status: "ignored" } as const;
      }
      const eventId = eventIdSchema.safeParse(event?.id);
      const egress = object(event?.egressInfo);
      const egressId = egressIdSchema.safeParse(egress?.egressId);
      if (!eventId.success || !egress || !egressId.success) {
        throw new LiveKitWebhookError("webhook-payload-mismatch", 422);
      }

      let claim: Claim;
      try {
        claim = await dependencies.repository.claimWebhook({
          eventId: eventId.data,
          eventType,
          egressId: egressId.data,
        });
      } catch {
        throw new LiveKitWebhookError("webhook-processing-failed", 500);
      }
      if (claim.state !== "claimed") {
        return claim.state === "processed"
          ? { duplicate: true, status: "processed" } as const
          : { duplicate: true, status: "processing" } as const;
      }

      let target: RecordingTarget | null;
      try {
        target = await dependencies.repository.getRecordingTarget({ egressId: egressId.data });
      } catch {
        await failClaim(eventId.data, claim.token, "processing-failed");
        throw new LiveKitWebhookError("webhook-processing-failed", 500);
      }
      if (!target) {
        await failClaim(eventId.data, claim.token, "target-mismatch");
        throw new LiveKitWebhookError("webhook-payload-mismatch", 422);
      }

      let completion: Completion;
      try {
        completion = safeCompletion({
          eventId: eventId.data,
          eventType,
          egressId: egressId.data,
          egress,
          target,
          processingToken: claim.token,
          now: dependencies.now(),
        });
      } catch (error) {
        await failClaim(eventId.data, claim.token,
          target.roomName === canonicalRoom(target.requestId)
            && target.storageKey === canonicalKey(target.requestId, target.recordingId)
            ? "payload-mismatch"
            : "target-mismatch");
        throw error;
      }

      let result: Awaited<ReturnType<Repository["completeWebhook"]>>;
      try {
        result = await dependencies.repository.completeWebhook(completion);
      } catch {
        await failClaim(eventId.data, claim.token, "processing-failed");
        throw new LiveKitWebhookError("webhook-processing-failed", 500);
      }
      if (result.state === "lease-lost") {
        throw new LiveKitWebhookError("webhook-busy", 503);
      }
      return {
        duplicate: false,
        status: result.state === "stale" ? "stale" : completion.status,
      } as const;
    },
  } as const;
}

async function runtimeService() {
  const apiKey = env.server.liveKit.apiKey;
  const apiSecret = env.server.liveKit.apiSecret;
  if (!apiKey || !apiSecret) {
    throw new LiveKitWebhookError("configuration-unavailable", 503);
  }
  const { recordingRepository } = await import("./recording.repository.ts");
  return createLiveKitWebhookService({
    receiver: new WebhookReceiver(apiKey, apiSecret),
    repository: recordingRepository,
    now: () => new Date().toISOString(),
  });
}

export async function processLiveKitWebhook(rawBody: string, authorization: string) {
  return (await runtimeService()).process(rawBody, authorization);
}
