"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/features/admin/auth/server";
import { revalidatePublicNews } from "@/features/admin/public-revalidation";
import { reporterCorrectionSchema, storyFormSchema, storyUpdateSubmissionSchema, type StoryFormValues } from "./story.model";
import {
  createStory,
  correctReporterStory,
  requestReporterChanges,
  runReporterStoryReviewCommand,
  runBulkStoryCommand,
  runStoryCommand,
  saveStory,
  StoryManagementError,
} from "./story.service";
import { normalizeScheduledAt } from "./story.workflow";
import { StoryBatchPartialError } from "./story-bulk.service";

export type StoryActionState = Readonly<{
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Readonly<Record<string, string[] | undefined>>;
}>;

export type ReporterReviewActionState = Readonly<{
  status: "idle" | "error" | "success";
  message?: string;
}>;

function formValues(formData: FormData) {
  return {
    title: formData.get("title"),
    slug: formData.get("slug"),
    summary: formData.get("summary"),
    content: formData.get("content"),
    languageId: formData.get("languageId"),
    categoryId: formData.get("categoryId"),
    sourceId: formData.get("sourceId") ?? "",
    featuredMediaId: formData.get("featuredMediaId") ?? "",
    tags: formData.get("tags") ?? "",
    seoTitle: formData.get("seoTitle") ?? "",
    seoDescription: formData.get("seoDescription") ?? "",
    canonicalUrl: formData.get("canonicalUrl") ?? "",
    scheduledAt: formData.get("scheduledAt") ?? "",
    isFeatured: formData.get("isFeatured") === "on",
    isBreaking: formData.get("isBreaking") === "on",
  };
}

function validateForm(formData: FormData, schema: typeof storyFormSchema = storyFormSchema):
  | Readonly<{ ok: true; values: StoryFormValues }>
  | Readonly<{ ok: false; state: StoryActionState }> {
  const parsed = schema.safeParse(formValues(formData));
  if (!parsed.success) {
    return {
      ok: false,
      state: {
        status: "error",
        message: "Check the highlighted fields and try again.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
    };
  }
  return { ok: true, values: parsed.data };
}

function safeError(error: unknown): StoryActionState {
  if (error instanceof StoryManagementError) return { status: "error", message: error.message };
  return { status: "error", message: "The story could not be saved. Please try again." };
}

async function revalidateStories(
  storyId?: string,
  publicAffecting = false,
  reporterAffecting = false,
) {
  revalidatePath("/admin/stories");
  if (storyId) revalidatePath(`/admin/stories/${storyId}`);
  if (reporterAffecting) {
    revalidatePath("/admin/reporters");
    revalidatePath("/admin/reporters/[id]", "page");
  }
  if (publicAffecting) await revalidatePublicNews();
}

export async function createStoryAction(
  _previousState: StoryActionState,
  formData: FormData,
): Promise<StoryActionState> {
  const admin = await requireAdminUser();
  const validated = validateForm(formData);
  if (!validated.ok) return validated.state;

  let id: string;
  try {
    id = (await createStory(admin, validated.values)).id;
  } catch (error) {
    return safeError(error);
  }
  await revalidateStories(id);
  redirect(`/admin/stories/${id}?saved=created`);
}

export async function saveStoryAction(
  id: string,
  _previousState: StoryActionState,
  formData: FormData,
): Promise<StoryActionState> {
  const admin = await requireAdminUser();
  const validated = validateForm(formData, storyUpdateSubmissionSchema);
  if (!validated.ok) return validated.state;
  try {
    const story = await saveStory(admin, id, validated.values);
    await revalidateStories(id, story.status === "published");
  } catch (error) {
    return safeError(error);
  }
  redirect(`/admin/stories/${id}?saved=updated`);
}

export async function storyCommandAction(formData: FormData): Promise<void> {
  const admin = await requireAdminUser();
  const id = String(formData.get("id") ?? "");
  const command = String(formData.get("command") ?? "");
  if (!id || !["submit", "approve", "reject", "publish", "schedule", "archive", "delete"].includes(command)) {
    redirect("/admin/stories?error=invalid-action");
  }
  const scheduledAt = normalizeScheduledAt(String(formData.get("scheduledAt") ?? ""));
  if (scheduledAt === null) redirect(`/admin/stories/${id}?error=invalid-date`);
  try {
    await runStoryCommand(
      admin,
      id,
      command as "submit" | "approve" | "reject" | "publish" | "schedule" | "archive" | "delete",
      scheduledAt,
      String(formData.get("rejectionReason") ?? ""),
    );
  } catch {
    redirect(`/admin/stories/${id}?error=action-failed`);
  }
  await revalidateStories(id, command === "publish" || command === "archive");
  if (command === "delete") redirect("/admin/stories?changed=deleted");
  redirect(`/admin/stories/${id}?changed=${command}`);
}

export async function bulkStoryAction(formData: FormData): Promise<void> {
  const admin = await requireAdminUser();
  const ids = formData.getAll("storyIds").map(String).filter(Boolean);
  const command = String(formData.get("command") ?? "");
  if (ids.length === 0 || !["publish", "archive", "delete"].includes(command)) {
    redirect("/admin/stories?error=select-stories");
  }
  const publicAffecting = command === "publish" || command === "archive";
  try {
    await runBulkStoryCommand(admin, ids, command as "publish" | "archive" | "delete");
  } catch (error) {
    if (error instanceof StoryBatchPartialError && error.completedIds.length > 0) {
      await revalidateStories(undefined, publicAffecting, true);
      redirect(`/admin/stories?error=bulk-partial&completed=${error.completedIds.length}`);
    }
    redirect("/admin/stories?error=bulk-action-failed");
  }
  await revalidateStories(undefined, publicAffecting, true);
  redirect(`/admin/stories?changed=${command}`);
}

export async function reviewReporterStoryAction(
  storyId: string,
  latestRevisionId: string,
  command: string,
  _previous: ReporterReviewActionState,
  formData: FormData,
): Promise<ReporterReviewActionState> {
  const admin = await requireAdminUser();
  const reason = String(formData.get("reason") ?? "");
  const scheduledAt = normalizeScheduledAt(String(formData.get("scheduledAt") ?? ""));
  if (scheduledAt === null) {
    return { status: "error", message: "Enter a valid future publication time." };
  }

  try {
    if (command === "request_changes") {
      await requestReporterChanges(admin, storyId, latestRevisionId, reason);
    } else if (["approve", "reject", "publish", "schedule", "archive"].includes(command)) {
      await runReporterStoryReviewCommand(
        admin,
        storyId,
        command as "approve" | "reject" | "publish" | "schedule" | "archive",
        scheduledAt,
        reason,
      );
    } else {
      return { status: "error", message: "That reporter review action is not available." };
    }
  } catch (error) {
    return {
      status: "error",
      message: error instanceof StoryManagementError
        ? error.message
        : "The reporter review action could not be completed. Refresh and try again.",
    };
  }

  const publicAffecting = command === "publish" || command === "archive";
  await revalidateStories(storyId, publicAffecting, true);
  return { status: "success", message: "Reporter review updated." };
}

export async function correctReporterStoryAction(
  storyId: string,
  latestRevisionId: string,
  _previous: ReporterReviewActionState,
  formData: FormData,
): Promise<ReporterReviewActionState> {
  const admin = await requireAdminUser();
  const parsed = reporterCorrectionSchema.safeParse({
    expectedUpdatedAt: formData.get("expectedUpdatedAt"),
    languageId: formData.get("languageId"),
    categoryId: formData.get("categoryId"),
    slug: formData.get("slug"),
    title: formData.get("title"),
    summary: formData.get("summary"),
    content: formData.get("content"),
    featuredMediaId: formData.get("featuredMediaId") ?? "",
    tags: formData.get("tags") ?? "",
    seoTitle: formData.get("seoTitle") ?? "",
    seoDescription: formData.get("seoDescription") ?? "",
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: "Check every correction field and enter a reason." };
  try {
    const { published } = await correctReporterStory(admin, storyId, latestRevisionId, parsed.data);
    await revalidateStories(storyId, published, true);
    return { status: "success", message: "Editorial correction saved without changing the submitted revision." };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof StoryManagementError
        ? error.message
        : "The editorial correction could not be completed. Refresh and try again.",
    };
  }
}
