"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/features/admin/auth/server";
import { storyFormSchema, type StoryFormValues } from "./story.model";
import {
  createStory,
  runBulkStoryCommand,
  runStoryCommand,
  saveStory,
  StoryManagementError,
} from "./story.service";
import { normalizeScheduledAt } from "./story.workflow";

export type StoryActionState = Readonly<{
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Readonly<Record<string, string[] | undefined>>;
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

function validateForm(formData: FormData):
  | Readonly<{ ok: true; values: StoryFormValues }>
  | Readonly<{ ok: false; state: StoryActionState }> {
  const parsed = storyFormSchema.safeParse(formValues(formData));
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

function revalidateStories() {
  revalidatePath("/admin/stories");
  revalidatePath("/en");
  revalidatePath("/hi");
  revalidatePath("/mr");
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
  revalidateStories();
  redirect(`/admin/stories/${id}?saved=created`);
}

export async function saveStoryAction(
  id: string,
  _previousState: StoryActionState,
  formData: FormData,
): Promise<StoryActionState> {
  const admin = await requireAdminUser();
  const validated = validateForm(formData);
  if (!validated.ok) return validated.state;
  try {
    await saveStory(admin, id, validated.values);
  } catch (error) {
    return safeError(error);
  }
  revalidateStories();
  redirect(`/admin/stories/${id}?saved=updated`);
}

export async function storyCommandAction(formData: FormData): Promise<void> {
  const admin = await requireAdminUser();
  const id = String(formData.get("id") ?? "");
  const command = String(formData.get("command") ?? "");
  if (!id || !["submit", "approve", "publish", "schedule", "archive", "delete"].includes(command)) {
    redirect("/admin/stories?error=invalid-action");
  }
  const scheduledAt = normalizeScheduledAt(String(formData.get("scheduledAt") ?? ""));
  if (scheduledAt === null) redirect(`/admin/stories/${id}?error=invalid-date`);
  try {
    await runStoryCommand(
      admin,
      id,
      command as "submit" | "approve" | "publish" | "schedule" | "archive" | "delete",
      scheduledAt,
    );
  } catch {
    redirect(`/admin/stories/${id}?error=action-failed`);
  }
  revalidateStories();
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
  try {
    await runBulkStoryCommand(admin, ids, command as "publish" | "archive" | "delete");
  } catch {
    redirect("/admin/stories?error=bulk-action-failed");
  }
  revalidateStories();
  redirect(`/admin/stories?changed=${command}`);
}
