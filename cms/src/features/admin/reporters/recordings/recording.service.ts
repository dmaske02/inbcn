import "server-only";

import { z } from "zod";

import type { AdminIdentity } from "../../auth/authorization.model.ts";
import {
  canManageRecordingLegalHold,
  canReviewRecordings,
  parseRecordingDetailRow,
  parseRecordingCategoryOption,
  parseRecordingListRow,
  parseRecordingThumbnailOption,
  validatePrivateReason,
  validatePublication,
  type RecordingDetail,
  type RecordingPublicationInput,
} from "./recording.model.ts";

type RecordingRepository = Readonly<{
  list(): Promise<readonly unknown[]>;
  get(id: string): Promise<Readonly<{ row: unknown; storageKey: string | null }> | null>;
  publish(id: string, metadata: RecordingPublicationInput): Promise<unknown>;
  reject(id: string, reason: string): Promise<unknown>;
  setLegalHold(id: string, enabled: boolean, reason: string): Promise<unknown>;
  options(): Promise<Readonly<{ categories: readonly unknown[]; thumbnails: readonly unknown[] }>>;
}>;

export class RecordingReviewError extends Error {
  readonly code: "FORBIDDEN" | "INVALID" | "CONFLICT" | "UNAVAILABLE";

  constructor(code: "FORBIDDEN" | "INVALID" | "CONFLICT" | "UNAVAILABLE", message: string) {
    super(message);
    this.name = "RecordingReviewError";
    this.code = code;
  }
}

function requireReviewer(admin: Pick<AdminIdentity, "role">): void {
  if (!canReviewRecordings(admin.role)) {
    throw new RecordingReviewError("FORBIDDEN", "You cannot review live recordings.");
  }
}

function requireLegalHoldManager(admin: Pick<AdminIdentity, "role">): void {
  if (!canManageRecordingLegalHold(admin.role)) {
    throw new RecordingReviewError("FORBIDDEN", "Only an active administrator can manage legal hold.");
  }
}

function recordingId(value: string): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new RecordingReviewError("INVALID", "The recording is invalid.");
  return parsed.data;
}

function safePersistenceError(error: unknown): RecordingReviewError {
  if (error instanceof RecordingReviewError) return error;
  const detail = error instanceof Error ? error.message : "";
  if (detail.includes("LIVE_RECORDING_DECISION_CONFLICT")
    || detail.includes("LIVE_RECORDING_LEGAL_HOLD_INVALID_STATE")) {
    return new RecordingReviewError(
      "CONFLICT",
      "This decision no longer matches the recording. Refresh and try again.",
    );
  }
  if (detail.includes("LIVE_RECORDING_NOT_FOUND")
    || detail.includes("LIVE_RECORDING_PUBLICATION_INVALID")
    || detail.includes("LIVE_RECORDING_REJECTION_INVALID")
    || detail.includes("LIVE_RECORDING_LEGAL_HOLD_INVALID")) {
    return new RecordingReviewError("INVALID", "The recording decision is invalid.");
  }
  if (detail.includes("LIVE_RECORDING_REVIEW_FORBIDDEN")
    || detail.includes("LIVE_RECORDING_LEGAL_HOLD_FORBIDDEN")
    || detail.includes("42501")) {
    return new RecordingReviewError("FORBIDDEN", "You are not allowed to change this recording.");
  }
  return new RecordingReviewError("UNAVAILABLE", "The recording could not be updated. Please try again.");
}

function expectedStorageKey(detail: RecordingDetail): string {
  return `reporter-live/${detail.requestId}/${detail.id}.mp4`;
}

export function createRecordingService(dependencies: Readonly<{
  repository: RecordingRepository;
  signPreview(key: string, expiresInSeconds: number): Promise<string>;
}>) {
  return {
    async list(admin: AdminIdentity) {
      requireReviewer(admin);
      try {
        return (await dependencies.repository.list()).map(parseRecordingListRow);
      } catch {
        throw new RecordingReviewError("UNAVAILABLE", "Recordings are temporarily unavailable.");
      }
    },

    async get(admin: AdminIdentity, id: string) {
      requireReviewer(admin);
      const parsedId = z.uuid().safeParse(id);
      if (!parsedId.success) return null;
      let result: Awaited<ReturnType<RecordingRepository["get"]>>;
      try {
        result = await dependencies.repository.get(parsedId.data);
      } catch {
        throw new RecordingReviewError("UNAVAILABLE", "The recording is temporarily unavailable.");
      }
      if (!result) return null;
      let detail: RecordingDetail;
      try {
        detail = parseRecordingDetailRow(result.row);
      } catch {
        throw new RecordingReviewError("UNAVAILABLE", "The recording is temporarily unavailable.");
      }

      let previewUrl: string | null = null;
      if (detail.recordingStatus === "completed" && detail.replayStatus === "private") {
        if (result.storageKey !== expectedStorageKey(detail)) {
          throw new RecordingReviewError("UNAVAILABLE", "The private preview is temporarily unavailable.");
        }
        try {
          previewUrl = await dependencies.signPreview(result.storageKey, 60);
        } catch {
          throw new RecordingReviewError("UNAVAILABLE", "The private preview is temporarily unavailable.");
        }
      }
      let options: Awaited<ReturnType<RecordingRepository["options"]>>;
      try {
        options = await dependencies.repository.options();
      } catch {
        throw new RecordingReviewError("UNAVAILABLE", "Publication options are temporarily unavailable.");
      }
      return {
        recording: detail,
        previewUrl,
        categories: options.categories.map(parseRecordingCategoryOption),
        thumbnails: options.thumbnails.map(parseRecordingThumbnailOption),
      } as const;
    },

    async publish(admin: AdminIdentity, id: string, metadata: RecordingPublicationInput) {
      requireReviewer(admin);
      const parsedId = recordingId(id);
      const parsed = validatePublication(metadata);
      if (!parsed.ok) {
        throw new RecordingReviewError("INVALID", "Enter valid replay publication details.");
      }
      try {
        await dependencies.repository.publish(parsedId, parsed.value);
      } catch (error) {
        throw safePersistenceError(error);
      }
    },

    async reject(admin: AdminIdentity, id: string, value: string) {
      requireReviewer(admin);
      const parsedId = recordingId(id);
      const parsed = validatePrivateReason(value);
      if (!parsed.ok) {
        throw new RecordingReviewError("INVALID", "Enter a reason between 1 and 2000 characters.");
      }
      try {
        await dependencies.repository.reject(parsedId, parsed.value);
      } catch (error) {
        throw safePersistenceError(error);
      }
    },

    async setLegalHold(admin: AdminIdentity, id: string, enabled: boolean, value: string) {
      requireLegalHoldManager(admin);
      const parsedId = recordingId(id);
      if (typeof enabled !== "boolean") {
        throw new RecordingReviewError("INVALID", "The legal-hold state is invalid.");
      }
      const parsed = validatePrivateReason(value);
      if (!parsed.ok) {
        throw new RecordingReviewError("INVALID", "Enter a reason between 1 and 2000 characters.");
      }
      try {
        await dependencies.repository.setLegalHold(parsedId, enabled, parsed.value);
      } catch (error) {
        throw safePersistenceError(error);
      }
    },
  } as const;
}

async function runtimeService() {
  const [{ recordingReviewRepository }, { signPrivateRecordingPreview }] = await Promise.all([
    import("./recording.repository.ts"),
    import("./recording-preview.server.ts"),
  ]);
  return createRecordingService({
    repository: recordingReviewRepository,
    signPreview: signPrivateRecordingPreview,
  });
}

export async function getRecordings(admin: AdminIdentity) {
  return (await runtimeService()).list(admin);
}

export async function getRecording(admin: AdminIdentity, id: string) {
  return (await runtimeService()).get(admin, id);
}

export async function publishRecording(
  admin: AdminIdentity,
  id: string,
  metadata: RecordingPublicationInput,
) {
  return (await runtimeService()).publish(admin, id, metadata);
}

export async function rejectRecording(admin: AdminIdentity, id: string, reason: string) {
  return (await runtimeService()).reject(admin, id, reason);
}

export async function setRecordingLegalHold(
  admin: AdminIdentity,
  id: string,
  enabled: boolean,
  reason: string,
) {
  return (await runtimeService()).setLegalHold(admin, id, enabled, reason);
}
