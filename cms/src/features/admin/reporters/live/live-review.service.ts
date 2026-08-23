import "server-only";

import { z } from "zod";

import type { AdminIdentity } from "../../auth/authorization.model.ts";
import { canDecideLiveRequest, canViewLiveRequests, validateApprovedWindow } from "./live-review.model.ts";
import type { LiveReviewRequest } from "./live-review.repository.ts";

type LiveReviewRepository = Readonly<{
  list(): Promise<readonly LiveReviewRequest[]>;
  get(id: string): Promise<LiveReviewRequest | null>;
  approve(id: string, startsAt: string, endsAt: string): Promise<void>;
  reject(id: string, reason: string): Promise<void>;
}>;

export class LiveReviewError extends Error {
  readonly code: "FORBIDDEN" | "INVALID" | "UNAVAILABLE";

  constructor(code: "FORBIDDEN" | "INVALID" | "UNAVAILABLE", message: string) {
    super(message);
    this.name = "LiveReviewError";
    this.code = code;
  }
}

function validId(value: string): string {
  const result = z.uuid().safeParse(value);
  if (!result.success) throw new LiveReviewError("INVALID", "The live request is invalid.");
  return result.data;
}

function reason(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 2000) {
    throw new LiveReviewError("INVALID", "Enter a reason between 1 and 2000 characters.");
  }
  return normalized;
}

function safeError(error: unknown): LiveReviewError {
  if (error instanceof LiveReviewError) return error;
  const detail = error instanceof Error ? error.message : "";
  if (detail.includes("REPORTER_LIVE_REQUEST_NOT_FOUND")) return new LiveReviewError("INVALID", "This live request is no longer available.");
  if (detail.includes("REPORTER_LIVE_REQUEST_CONFLICT") || detail.includes("REPORTER_LIVE_REQUEST_INVALID_STATE")) {
    return new LiveReviewError("INVALID", "This decision no longer matches the live request state. Refresh and try again.");
  }
  if (detail.includes("REPORTER_LIVE") || detail.includes("42501")) return new LiveReviewError("FORBIDDEN", "Only an active administrator can change this live request.");
  return new LiveReviewError("UNAVAILABLE", "The live request could not be updated. Please try again.");
}

function requireView(admin: Pick<AdminIdentity, "role">): void {
  if (!canViewLiveRequests(admin.role)) throw new LiveReviewError("FORBIDDEN", "You cannot view live requests.");
}

function requireDecision(admin: Pick<AdminIdentity, "role">): void {
  if (!canDecideLiveRequest(admin.role)) throw new LiveReviewError("FORBIDDEN", "Only an active administrator can change this live request.");
}

export function createLiveReviewService(repository: LiveReviewRepository) {
  return {
    async list(admin: AdminIdentity) { requireView(admin); return repository.list(); },
    async get(admin: AdminIdentity, id: string) {
      requireView(admin);
      const parsed = z.uuid().safeParse(id);
      return parsed.success ? repository.get(parsed.data) : null;
    },
    async approve(admin: AdminIdentity, id: string, window: Readonly<{ startsAt: string; endsAt: string }>) {
      requireDecision(admin);
      const requestId = validId(id);
      let request: LiveReviewRequest | null;
      try { request = await repository.get(requestId); } catch (error) { throw safeError(error); }
      if (!request) throw new LiveReviewError("INVALID", "This live request is no longer available.");
      const approvedWindow = validateApprovedWindow(window.startsAt, window.endsAt, request.expectedDurationMinutes);
      if (!approvedWindow.ok) throw new LiveReviewError("INVALID", "Enter a valid approval window within the requested duration.");
      try { await repository.approve(requestId, approvedWindow.startsAt, approvedWindow.endsAt); } catch (error) { throw safeError(error); }
    },
    async reject(admin: AdminIdentity, id: string, value: string) {
      requireDecision(admin);
      const requestId = validId(id);
      const decisionReason = reason(value);
      try { await repository.reject(requestId, decisionReason); } catch (error) { throw safeError(error); }
    },
  } as const;
}

async function runtimeService() {
  const { liveReviewRepository } = await import("./live-review.repository.ts");
  return createLiveReviewService(liveReviewRepository);
}

export async function getLiveReviewRequests(admin: AdminIdentity) { return (await runtimeService()).list(admin); }
export async function getLiveReviewRequest(admin: AdminIdentity, id: string) { return (await runtimeService()).get(admin, id); }
export async function approveLiveRequest(admin: AdminIdentity, id: string, window: Readonly<{ startsAt: string; endsAt: string }>) {
  return (await runtimeService()).approve(admin, id, window);
}
export async function rejectLiveRequest(admin: AdminIdentity, id: string, value: string) { return (await runtimeService()).reject(admin, id, value); }
