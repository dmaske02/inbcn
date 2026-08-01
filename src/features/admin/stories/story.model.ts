import { z } from "zod";

import type { AdminRole } from "@/features/admin/auth/authorization.model";
import type { DatabaseEnum } from "@/lib/supabase/types";

export type StoryStatus = DatabaseEnum<"story_status">;
export type StoryCommand =
  | "save"
  | "submit"
  | "approve"
  | "publish"
  | "schedule"
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
  tags: z.string().max(1000),
  seoTitle: z.string().trim().max(240),
  seoDescription: z.string().trim().max(1000),
  canonicalUrl: optionalUrl,
  scheduledAt: z.union([z.literal(""), z.iso.datetime({ local: true })]),
  isFeatured: z.boolean(),
  isBreaking: z.boolean(),
});

export type StoryFormValues = z.infer<typeof storyFormSchema>;

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

export function getAllowedStoryCommands(
  role: AdminRole,
  status: StoryStatus,
  isOwner: boolean,
): StoryCommand[] {
  if (role === "writer") {
    return status === "draft" && isOwner ? ["save", "submit"] : [];
  }

  if (role === "editor") {
    if (status === "pending_review") return ["save", "approve"];
    if (status === "approved") return ["publish", "schedule", "archive"];
    if (status === "scheduled") return ["publish", "archive"];
    if (status === "published") return ["archive"];
    return [];
  }

  if (status === "archived") return ["delete"];
  if (status === "draft") {
    return ["save", "submit", "approve", "publish", "schedule", "archive", "delete"];
  }
  if (status === "pending_review") {
    return ["save", "approve", "publish", "schedule", "archive", "delete"];
  }
  if (status === "approved") return ["save", "publish", "schedule", "archive", "delete"];
  if (status === "scheduled") return ["save", "publish", "archive", "delete"];
  if (status === "published") return ["save", "archive", "delete"];
  return ["save", "approve", "publish", "schedule", "archive", "delete"];
}
