import { z } from "zod";

const timestamp = z.iso.datetime({ offset: true });
const nullableTimestamp = timestamp.nullable();
const uuid = z.uuid();
const recordingStatus = z.enum(["completed", "failed"]);
const replayStatus = z.enum(["private", "published", "rejected"]);
const duration = z.number().finite().positive().max(86_400);
const byteCount = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

const listRowSchema = z.object({
  id: uuid,
  live_request_id: uuid,
  request_title: z.string().trim().min(1).max(240),
  request_locality: z.string().trim().min(1).max(200),
  recording_status: recordingStatus,
  replay_status: replayStatus,
  duration_seconds: duration.nullable(),
  bytes: byteCount.nullable(),
  recording_started_at: timestamp,
  recording_ended_at: timestamp,
  created_at: timestamp,
}).strict();

const detailRowSchema = listRowSchema.extend({
  request_purpose: z.string().trim().min(1).max(2000),
  request_expected_starts_at: timestamp,
  request_expected_duration_minutes: z.number().int().min(1).max(480),
  published_title: z.string().trim().min(1).max(240).nullable(),
  published_description: z.string().trim().min(1).max(4000).nullable(),
  published_category_id: uuid.nullable(),
  published_thumbnail_media_id: uuid.nullable(),
  published_at: nullableTimestamp,
  rejected_at: nullableTimestamp,
  rejection_reason: z.string().trim().min(1).max(2000).nullable(),
  legal_hold: z.boolean(),
  legal_hold_reason: z.string().trim().min(1).max(2000).nullable(),
  deletion_due_at: nullableTimestamp,
}).strict();

export type RecordingListItem = Readonly<{
  id: string;
  requestId: string;
  requestTitle: string;
  requestLocality: string;
  recordingStatus: "completed" | "failed";
  replayStatus: "private" | "published" | "rejected";
  durationSeconds: number | null;
  bytes: number | null;
  recordingStartedAt: string;
  recordingEndedAt: string;
  createdAt: string;
}>;

export type RecordingDetail = RecordingListItem & Readonly<{
  requestPurpose: string;
  requestExpectedStartsAt: string;
  requestExpectedDurationMinutes: number;
  publishedTitle: string | null;
  publishedDescription: string | null;
  publishedCategoryId: string | null;
  publishedThumbnailMediaId: string | null;
  publishedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  legalHold: boolean;
  legalHoldReason: string | null;
  deletionDueAt: string | null;
}>;

const categoryOptionSchema = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(240),
}).strict();
const thumbnailOptionSchema = z.object({
  id: uuid,
  title: z.string().trim().min(1).max(200).nullable(),
  alt_text: z.string().trim().min(1).max(500),
}).strict();

export type RecordingCategoryOption = Readonly<{ id: string; name: string }>;
export type RecordingThumbnailOption = Readonly<{ id: string; title: string | null; altText: string }>;

export function parseRecordingCategoryOption(value: unknown): RecordingCategoryOption {
  return categoryOptionSchema.parse(value);
}

export function parseRecordingThumbnailOption(value: unknown): RecordingThumbnailOption {
  const row = thumbnailOptionSchema.parse(value);
  return { id: row.id, title: row.title, altText: row.alt_text };
}

export function canReviewRecordings(role: string): boolean {
  return role === "editor" || role === "admin";
}

export function canManageRecordingLegalHold(role: string): boolean {
  return role === "admin";
}

function mapListRow(row: z.infer<typeof listRowSchema>): RecordingListItem {
  return {
    id: row.id,
    requestId: row.live_request_id,
    requestTitle: row.request_title,
    requestLocality: row.request_locality,
    recordingStatus: row.recording_status,
    replayStatus: row.replay_status,
    durationSeconds: row.duration_seconds,
    bytes: row.bytes,
    recordingStartedAt: row.recording_started_at,
    recordingEndedAt: row.recording_ended_at,
    createdAt: row.created_at,
  };
}

export function parseRecordingListRow(value: unknown): RecordingListItem {
  return mapListRow(listRowSchema.parse(value));
}

export function parseRecordingDetailRow(value: unknown): RecordingDetail {
  const row = detailRowSchema.parse(value);
  return {
    ...mapListRow(row),
    requestPurpose: row.request_purpose,
    requestExpectedStartsAt: row.request_expected_starts_at,
    requestExpectedDurationMinutes: row.request_expected_duration_minutes,
    publishedTitle: row.published_title,
    publishedDescription: row.published_description,
    publishedCategoryId: row.published_category_id,
    publishedThumbnailMediaId: row.published_thumbnail_media_id,
    publishedAt: row.published_at,
    rejectedAt: row.rejected_at,
    rejectionReason: row.rejection_reason,
    legalHold: row.legal_hold,
    legalHoldReason: row.legal_hold_reason,
    deletionDueAt: row.deletion_due_at,
  };
}

export type RecordingPublicationInput = Readonly<{
  title: string;
  description: string;
  categoryId: string;
  thumbnailMediaId: string;
}>;

export type RecordingPublicationValidation =
  | Readonly<{ ok: true; value: RecordingPublicationInput }>
  | Readonly<{ ok: false }>;

const publicationSchema = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().min(1).max(4000),
  categoryId: uuid,
  thumbnailMediaId: uuid,
}).strict();

export function validatePublication(value: RecordingPublicationInput): RecordingPublicationValidation {
  const parsed = publicationSchema.safeParse(value);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false };
}

export type PrivateReasonValidation =
  | Readonly<{ ok: true; value: string }>
  | Readonly<{ ok: false }>;

export function validatePrivateReason(value: string): PrivateReasonValidation {
  const parsed = z.string().trim().min(1).max(2000).safeParse(value);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false };
}
