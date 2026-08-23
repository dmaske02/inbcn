import type { CmsStoryUpdate } from "@/features/news/server";
import type { StoryCommand, StoryStatus } from "./story.model";

export function parseTags(value: string): string[] {
  return [...new Set(value.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

export function normalizeScheduledAt(value: string): string | null | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?$/u.test(value)) return null;
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/u.test(value) ? value : `${value}:00Z`;
  const timestamp = Date.parse(normalized);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

export function buildTransitionPatch(
  command: Exclude<StoryCommand, "save" | "delete" | "request_changes">,
  currentStatus: StoryStatus,
  actorId: string,
  now: string,
  scheduledAt?: string,
  rejectionReason?: string,
): CmsStoryUpdate {
  if (command === "submit") {
    return { status: "pending_review", submitted_at: now, updated_at: now };
  }

  if (command === "approve") {
    return {
      status: "approved",
      approved_by: actorId,
      approved_at: now,
      updated_at: now,
    };
  }

  if (command === "reject") {
    const reason = rejectionReason?.trim();
    if (!reason) throw new Error("A rejection reason is required.");
    return {
      status: "rejected",
      rejected_at: now,
      rejection_reason: reason,
      updated_at: now,
    };
  }

  const approval =
    currentStatus === "draft" || currentStatus === "pending_review"
      ? {
          ...(currentStatus === "draft" ? { submitted_at: now } : {}),
          approved_by: actorId,
          approved_at: now,
        }
      : {};

  if (command === "publish") {
    return {
      status: "published",
      ...approval,
      published_at: now,
      scheduled_at: null,
      updated_at: now,
    };
  }

  if (command === "schedule") {
    if (!scheduledAt) throw new Error("A publish date is required to schedule a story.");
    if (new Date(scheduledAt).getTime() <= new Date(now).getTime()) {
      throw new Error("The publish date must be in the future.");
    }
    return {
      status: "scheduled",
      ...approval,
      scheduled_at: scheduledAt,
      published_at: null,
      updated_at: now,
    };
  }

  return {
    status: "archived",
    ...approval,
    updated_at: now,
  };
}
