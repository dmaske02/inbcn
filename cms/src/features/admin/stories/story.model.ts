import { z } from "zod";

import type { AdminRole } from "@/features/admin/auth/authorization.model";
import type { DatabaseEnum } from "@/lib/supabase/types";

export type StoryStatus = DatabaseEnum<"story_status">;
export type StoryCommand =
  | "save"
  | "submit"
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

export function resolveEditableStoryType(
  currentType: DatabaseEnum<"story_type"> | null,
): "staff_article" | "external_article" {
  return currentType === "external_article" ? "external_article" : "staff_article";
}

export function getAllowedStoryCommands(
  role: AdminRole,
  status: StoryStatus,
  isOwner: boolean,
  isExternalArticle = false,
): StoryCommand[] {
  if (role === "writer") {
    return status === "draft" && isOwner ? ["save", "submit"] : [];
  }

  if (role === "editor") {
    if (isExternalArticle && status === "draft") {
      return ["save", "approve", "reject"];
    }
    if (status === "pending_review") return ["save", "approve", "reject"];
    if (status === "approved") return ["publish", "schedule", "archive"];
    if (status === "scheduled") return ["publish", "schedule", "cancel_schedule", "archive"];
    if (status === "published") return ["unpublish", "archive"];
    if (status === "rejected") return ["send_back"];
    return [];
  }

  if (status === "archived") return ["delete"];
  if (status === "draft") {
    return ["save", "submit", "approve", "reject", "publish", "schedule", "delete"];
  }
  if (status === "pending_review") {
    return ["save", "approve", "reject", "publish", "schedule", "delete"];
  }
  if (status === "approved") return ["save", "publish", "schedule", "archive", "delete"];
  if (status === "scheduled") return ["save", "publish", "schedule", "cancel_schedule", "archive", "delete"];
  if (status === "published") return ["save", "unpublish", "archive", "delete"];
  if (status === "rejected") return ["save", "send_back", "delete"];
  return ["save", "approve", "reject", "publish", "schedule", "archive", "delete"];
}
