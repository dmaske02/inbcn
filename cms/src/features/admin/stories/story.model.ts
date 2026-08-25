import { z } from "zod";

import type { AdminRole } from "@/features/admin/auth/authorization.model";
import type { DatabaseEnum } from "@/lib/supabase/types";

export type StoryStatus = DatabaseEnum<"story_status">;
export type StoryCommand =
  | "save"
  | "submit"
  | "request_changes"
  | "approve"
  | "reject"
  | "send_back"
  | "publish"
  | "schedule"
  | "cancel_schedule"
  | "unpublish"
  | "archive"
  | "delete";

const optionalUrl = z.union([z.literal(""), z.url("Enter a valid URL.")]);
const optionalUuid = z.union([z.literal(""), z.uuid("Select a valid option.")]);

export const storyFormSchema = z.object({
  title: z.string().trim().min(1, "Headline is required.").max(240),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required.")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens."),
  summary: z.string().trim().min(1, "Summary is required.").max(1000),
  content: z.string().trim().min(1, "Body is required."),
  languageId: z.uuid("Select a language."),
  categoryId: z.uuid("Select a category."),
  sourceId: optionalUuid,
  featuredMediaId: optionalUuid,
  tags: z.string().max(1000),
  seoTitle: z.string().trim().max(240),
  seoDescription: z.string().trim().max(1000),
  canonicalUrl: optionalUrl,
  scheduledAt: z.union([z.literal(""), z.iso.datetime({ local: true })]),
  isFeatured: z.boolean(),
  isBreaking: z.boolean(),
});

export const storyUpdateSubmissionSchema = storyFormSchema.extend({
  summary: z.string().min(1, "Summary is required."),
});

export type StoryFormValues = z.infer<typeof storyFormSchema>;

export const reporterCorrectionSchema = storyFormSchema.pick({
  languageId: true,
  categoryId: true,
  slug: true,
  title: true,
  summary: true,
  content: true,
  featuredMediaId: true,
  tags: true,
  seoTitle: true,
  seoDescription: true,
}).extend({
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  reason: z.string().trim().min(1).max(2000),
});

export type ReporterCorrectionValues = z.infer<typeof reporterCorrectionSchema>;

const nullableTimestamp = z.string().nullable();

export const reporterStoryReviewSchema = z.object({
  latest_revision: z.object({
    id: z.uuid(),
    number: z.number().int().positive(),
    submitted_at: z.string(),
    outcome: z.string(),
    reason: z.string().nullable(),
    snapshot: z.object({
      language_id: z.string(),
      category_id: z.string(),
      slug: z.string(),
      title: z.string(),
      summary: z.string(),
      content: z.string(),
      event_occurred_at: z.string().nullable(),
      featured_media_id: z.string().nullable(),
      media_ids: z.array(z.string()),
    }).strict(),
  }).strict(),
  canonical_story: z.object({
    id: z.uuid(),
    status: z.string(),
    language_id: z.string(),
    category_id: z.string(),
    slug: z.string(),
    title: z.string(),
    summary: z.string(),
    content: z.string(),
    event_occurred_at: nullableTimestamp,
    featured_media_id: z.string().nullable(),
    submitted_at: nullableTimestamp,
    approved_at: nullableTimestamp,
    scheduled_at: nullableTimestamp,
    published_at: nullableTimestamp,
    rejected_at: nullableTimestamp,
    rejection_reason: z.string().nullable(),
  }).strict(),
  reporter: z.object({
    profile_id: z.uuid(),
    legal_name: z.string(),
    portrait_url: z.url(),
    public_slug: z.string(),
    home_city: z.string(),
    home_district: z.string(),
    home_state: z.string(),
    bio: z.string().nullable(),
    beats: z.array(z.string()),
    public_status: z.string(),
    membership_started_at: z.string(),
    membership_expires_at: z.string(),
    membership_grace_ends_at: z.string(),
    is_active: z.boolean(),
    is_suspended: z.boolean(),
    direct_publish_raw: z.boolean(),
    live_broadcast_raw: z.boolean(),
    direct_publish_effective: z.boolean(),
    live_broadcast_effective: z.boolean(),
  }).strict(),
  submitted_media: z.array(z.object({
    id: z.uuid(),
    type: z.string(),
    secure_url: z.url(),
    title: z.string(),
    original_filename: z.string(),
    alt_text: z.string().nullable(),
    caption: z.string().nullable(),
    width: z.number().nullable(),
    height: z.number().nullable(),
    duration_seconds: z.number().nullable(),
    bytes: z.number().nullable(),
    created_at: z.string(),
  }).strict()),
  private_location: z.object({
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    accuracy_meters: z.number().nullable(),
    captured_at: z.string().nullable(),
    received_at: z.string(),
    locality: z.string(),
  }).strict().nullable(),
  story_audit: z.array(z.object({
    action: z.string(),
    actor_id: z.uuid().nullable(),
    actor_name: z.string().nullable(),
    created_at: z.string(),
    metadata: z.unknown(),
  }).strict()),
}).strict();

export type ReporterStoryReview = z.infer<typeof reporterStoryReviewSchema>;

function normalizeTextareaLineEndings(value: string): string {
  return value.replace(/\r\n?/gu, "\n");
}

export function parseStoryUpdateForm(input: StoryFormValues, persistedSummary: string) {
  if (normalizeTextareaLineEndings(input.summary) !== normalizeTextareaLineEndings(persistedSummary)) {
    return storyFormSchema.safeParse(input);
  }

  const parsed = storyFormSchema.omit({ summary: true }).safeParse(input);
  if (!parsed.success) return parsed;
  return {
    success: true as const,
    data: { ...parsed.data, summary: persistedSummary },
  };
}

export function generateStorySlug(headline: string): string {
  const slug = headline
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || "story";
}

export function canCreateStory(role: AdminRole): boolean {
  return role === "writer" || role === "admin";
}

export function canReviewReporterStory(role: AdminRole, status: StoryStatus): boolean {
  void status;
  return role === "editor" || role === "admin";
}

export function parseReporterReviewReason(value: string):
  | Readonly<{ success: true; reason: string }>
  | Readonly<{ success: false }> {
  const reason = value.trim();
  return reason.length >= 1 && reason.length <= 2000
    ? { success: true, reason }
    : { success: false };
}

export function resolveEditableStoryType(
  currentType: DatabaseEnum<"story_type"> | null,
): "staff_article" | "external_article" | "citizen_report" {
  if (currentType === "external_article" || currentType === "citizen_report") {
    return currentType;
  }
  return "staff_article";
}

export function getAllowedStoryCommands(
  role: AdminRole,
  status: StoryStatus,
  isOwner: boolean,
  isExternalArticle = false,
  isReporterStory = false,
): StoryCommand[] {
  if (isReporterStory) {
    if (!canReviewReporterStory(role, status)) return [];
    if (status === "pending_review") {
      return ["request_changes", "approve", "reject", "publish", "schedule"];
    }
    if (status === "approved") return ["publish", "schedule", "archive"];
    if (status === "scheduled") return ["publish", "archive"];
    if (status === "published") return ["archive"];
    if (status === "rejected") return ["archive"];
    return [];
  }

  let commands: StoryCommand[];

  if (role === "writer") {
    commands = status === "draft" && isOwner ? ["save", "submit"] : [];
  } else if (role === "editor") {
    if (isExternalArticle && status === "draft") {
      commands = ["save", "approve", "reject"];
    } else if (status === "pending_review") {
      commands = ["save", "approve", "reject"];
    } else if (status === "approved") {
      commands = ["publish", "schedule", "archive"];
    } else if (status === "scheduled") {
      commands = ["publish", "schedule", "cancel_schedule", "archive"];
    } else if (status === "published") {
      commands = ["unpublish", "archive"];
    } else if (status === "rejected") {
      commands = ["send_back"];
    } else {
      commands = [];
    }
  } else if (status === "archived") {
    commands = ["delete"];
  } else if (status === "draft") {
    commands = ["save", "submit", "approve", "reject", "publish", "schedule", "delete"];
  } else if (status === "pending_review") {
    commands = ["save", "approve", "reject", "publish", "schedule", "delete"];
  } else if (status === "approved") {
    commands = ["save", "publish", "schedule", "archive", "delete"];
  } else if (status === "scheduled") {
    commands = ["save", "publish", "schedule", "cancel_schedule", "archive", "delete"];
  } else if (status === "published") {
    commands = ["save", "unpublish", "archive", "delete"];
  } else if (status === "rejected") {
    commands = ["save", "send_back", "delete"];
  } else {
    commands = ["save", "approve", "reject", "publish", "schedule", "archive", "delete"];
  }

  return commands;
}
