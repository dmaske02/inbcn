import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { RecordingPublicationInput } from "./recording.model.ts";

export class RecordingReviewRepositoryError extends Error {
  constructor(message = "Recordings are temporarily unavailable.") {
    super(message);
    this.name = "RecordingReviewRepositoryError";
  }
}

const recordingListFields = "id, live_request_id, recording_status, replay_status, duration_seconds, bytes, recording_started_at, recording_completed_at, created_at" as const;
const recordingDetailFields = "id, live_request_id, recording_status, replay_status, duration_seconds, bytes, recording_started_at, recording_completed_at, created_at, replay_title, replay_description, replay_category_id, replay_thumbnail_media_id, replay_published_at, replay_rejected_at, retention_delete_at, legal_hold" as const;
const requestFields = "id, title, purpose, intended_locality, expected_starts_at, expected_duration_minutes" as const;

type RequestFacts = Readonly<{
  id: string;
  title: string;
  purpose: string;
  intended_locality: string;
  expected_starts_at: string;
  expected_duration_minutes: number;
}>;

type RecordingFacts = Readonly<{
  id: string;
  live_request_id: string;
  recording_status: string;
  replay_status: string;
  duration_seconds: number | null;
  bytes: number | null;
  recording_started_at: string | null;
  recording_completed_at: string | null;
  created_at: string;
}>;

function listRow(recording: RecordingFacts, request: RequestFacts) {
  return {
    id: recording.id,
    live_request_id: recording.live_request_id,
    request_title: request.title,
    request_locality: request.intended_locality,
    recording_status: recording.recording_status,
    replay_status: recording.replay_status,
    duration_seconds: recording.duration_seconds,
    bytes: recording.bytes,
    recording_started_at: recording.recording_started_at,
    recording_ended_at: recording.recording_completed_at,
    created_at: recording.created_at,
  };
}

async function list(): Promise<readonly unknown[]> {
  const client = await createClient();
  const recordings = await client.from("live_recordings")
    .select(recordingListFields)
    .in("recording_status", ["completed", "failed"])
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (recordings.error) throw new RecordingReviewRepositoryError();
  if (recordings.data.length === 0) return [];

  const requestIds = [...new Set(recordings.data.map((row) => row.live_request_id))];
  const requests = await client.from("reporter_live_requests")
    .select(requestFields).in("id", requestIds);
  if (requests.error) throw new RecordingReviewRepositoryError();
  const byId = new Map(requests.data.map((row) => [row.id, row as RequestFacts]));
  return recordings.data.map((row) => {
    const request = byId.get(row.live_request_id);
    if (!request) throw new RecordingReviewRepositoryError();
    return listRow(row, request);
  });
}

async function get(id: string): Promise<Readonly<{ row: unknown; storageKey: string | null }> | null> {
  const client = await createClient();
  const recordingResult = await client.from("live_recordings")
    .select(recordingDetailFields).eq("id", id).maybeSingle();
  if (recordingResult.error) throw new RecordingReviewRepositoryError();
  const recording = recordingResult.data;
  if (!recording) return null;

  const [requestResult, privateResult, holdResult, storageResult] = await Promise.all([
    client.from("reporter_live_requests")
      .select(requestFields).eq("id", recording.live_request_id).maybeSingle(),
    client.from("live_recording_editorial_private")
      .select("recording_id, rejection_reason")
      .eq("recording_id", id).maybeSingle(),
    client.from("live_recording_legal_hold_events")
      .select("id, recording_id, legal_hold, reason, created_at")
      .eq("recording_id", id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1).maybeSingle(),
    createAdminClient().from("live_recordings")
      .select("id, live_request_id, storage_key")
      .eq("id", id).eq("live_request_id", recording.live_request_id).maybeSingle(),
  ]);
  if (requestResult.error || privateResult.error || holdResult.error
    || storageResult.error || !requestResult.data) {
    throw new RecordingReviewRepositoryError();
  }
  if (!storageResult.data || storageResult.data.id !== id
    || storageResult.data.live_request_id !== recording.live_request_id) {
    throw new RecordingReviewRepositoryError();
  }
  const request = requestResult.data;
  const privateFacts = privateResult.data;
  const latestHold = holdResult.data;
  if ((latestHold && latestHold.legal_hold !== recording.legal_hold)
    || (!latestHold && recording.legal_hold)) {
    throw new RecordingReviewRepositoryError();
  }
  return {
    row: {
      ...listRow(recording, request),
      request_purpose: request.purpose,
      request_expected_starts_at: request.expected_starts_at,
      request_expected_duration_minutes: request.expected_duration_minutes,
      published_title: recording.replay_title,
      published_description: recording.replay_description,
      published_category_id: recording.replay_category_id,
      published_thumbnail_media_id: recording.replay_thumbnail_media_id,
      published_at: recording.replay_published_at,
      rejected_at: recording.replay_rejected_at,
      rejection_reason: privateFacts?.rejection_reason ?? null,
      legal_hold: recording.legal_hold,
      legal_hold_reason: latestHold?.reason ?? null,
      legal_hold_changed_at: latestHold?.created_at ?? null,
      deletion_due_at: recording.retention_delete_at,
    },
    storageKey: storageResult.data.storage_key,
  };
}

async function publish(id: string, metadata: RecordingPublicationInput): Promise<void> {
  const { error } = await (await createClient()).rpc("publish_live_recording", {
    p_recording_id: id,
    p_title: metadata.title,
    p_description: metadata.description,
    p_category_id: metadata.categoryId,
    p_thumbnail_media_id: metadata.thumbnailMediaId,
  });
  if (error) throw new RecordingReviewRepositoryError(error.message);
}

async function reject(id: string, reason: string): Promise<void> {
  const { error } = await (await createClient()).rpc("reject_live_recording", {
    p_recording_id: id,
    p_reason: reason,
  });
  if (error) throw new RecordingReviewRepositoryError(error.message);
}

async function setLegalHold(id: string, enabled: boolean, reason: string): Promise<void> {
  const { error } = await (await createClient()).rpc("set_live_recording_legal_hold", {
    p_recording_id: id,
    p_legal_hold: enabled,
    p_reason: reason,
  });
  if (error) throw new RecordingReviewRepositoryError(error.message);
}

async function options() {
  const client = await createClient();
  const [categories, thumbnails] = await Promise.all([
    client.from("categories").select("id, name")
      .eq("is_active", true).order("name", { ascending: true }).order("id", { ascending: true }),
    client.from("media").select("id, title, alt_text")
      .eq("media_type", "image").is("deleted_at", null)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(200),
  ]);
  if (categories.error || thumbnails.error) throw new RecordingReviewRepositoryError();
  return { categories: categories.data, thumbnails: thumbnails.data } as const;
}

export const recordingReviewRepository = {
  list,
  get,
  publish,
  reject,
  setLegalHold,
  options,
} as const;
