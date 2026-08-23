import "server-only";

import type { Json } from "@inbcn/database";
import { z } from "zod";

import { createAdminClient } from "../../lib/supabase/admin.ts";

export class RecordingRepositoryError extends Error {
  constructor() {
    super("The live recording callback could not be persisted.");
    this.name = "RecordingRepositoryError";
  }
}

function record(value: Json): Record<string, Json | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RecordingRepositoryError();
  }
  return value;
}

function canonicalKey(requestId: string, recordingId: string): string {
  return `reporter-live/${requestId}/${recordingId}.mp4`;
}

async function claimWebhook(input: Readonly<{
  eventId: string;
  eventType: string;
  egressId: string;
}>) {
  const { data, error } = await createAdminClient().rpc("claim_livekit_webhook_event", {
    p_event_id: input.eventId,
    p_event_type: input.eventType,
    p_egress_id: input.egressId,
  });
  if (error) throw new RecordingRepositoryError();
  const value = record(data);
  if (value.state === "claimed" && typeof value.token === "string") {
    return { state: "claimed", token: value.token } as const;
  }
  if (value.state === "busy" || value.state === "processed") {
    return { state: value.state } as const;
  }
  throw new RecordingRepositoryError();
}

const targetSchema = z.object({
  id: z.uuid(),
  live_request_id: z.uuid(),
  egress_id: z.string().trim().min(1).max(255),
  recording_status: z.enum(["pending", "recording", "completed", "failed"]),
  reporter_live_requests: z.object({
    id: z.uuid(),
    livekit_room_name: z.string().trim().min(1).max(255),
  }).strict(),
}).strict();

async function getRecordingTarget(input: Readonly<{ egressId: string }>) {
  const { data, error } = await createAdminClient()
    .from("live_recordings")
    .select("id, live_request_id, egress_id, recording_status, reporter_live_requests!inner(id, livekit_room_name)")
    .eq("egress_id", input.egressId)
    .maybeSingle();
  if (error) throw new RecordingRepositoryError();
  if (!data) return null;
  const parsed = targetSchema.safeParse(data);
  if (!parsed.success
    || parsed.data.reporter_live_requests.id !== parsed.data.live_request_id) {
    throw new RecordingRepositoryError();
  }
  const requestId = parsed.data.live_request_id;
  return {
    recordingId: parsed.data.id,
    requestId,
    roomName: parsed.data.reporter_live_requests.livekit_room_name,
    storageKey: canonicalKey(requestId, parsed.data.id),
    recordingStatus: parsed.data.recording_status,
  } as const;
}

async function completeWebhook(input: Readonly<{
  eventId: string;
  processingToken: string;
  recordingId: string;
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
}>) {
  const { data, error } = await createAdminClient().rpc("complete_livekit_webhook_event", {
    p_event_id: input.eventId,
    p_processing_token: input.processingToken,
    p_recording_id: input.recordingId,
    p_recording_status: input.status,
    p_storage_key: input.storageKey,
    p_duration_seconds: input.durationSeconds,
    p_bytes: input.bytes,
    p_provider_started_at: input.providerStartedAt,
    p_provider_ended_at: input.providerEndedAt,
    p_failure_code: input.failureCode,
  });
  if (error) throw new RecordingRepositoryError();
  const value = record(data);
  if (value.state === "updated" || value.state === "stale" || value.state === "lease-lost") {
    return { state: value.state } as const;
  }
  throw new RecordingRepositoryError();
}

async function failWebhook(input: Readonly<{
  eventId: string;
  processingToken: string;
  failureCode: "payload-mismatch" | "target-mismatch" | "processing-failed";
}>) {
  const { data, error } = await createAdminClient().rpc("fail_livekit_webhook_event", {
    p_event_id: input.eventId,
    p_processing_token: input.processingToken,
    p_failure_code: input.failureCode,
  });
  if (error || !data) throw new RecordingRepositoryError();
  return data;
}

export const recordingRepository = {
  claimWebhook,
  getRecordingTarget,
  completeWebhook,
  failWebhook,
} as const;
