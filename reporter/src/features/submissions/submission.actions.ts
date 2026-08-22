"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireReporterSession } from "../auth/server";
import {
  validateReporterStoryInput,
  validateSubmissionEvidence,
} from "./submission.model";
import {
  directPublishReporterStory,
  ReporterSubmissionError,
  saveReporterDraft,
  submitReporterStory,
  withdrawReporterStory,
} from "./submission.service";

export type SubmissionActionState = Readonly<{
  status: "idle" | "success" | "error";
  message?: string;
  storyId?: string;
  fieldErrors?: Readonly<Record<string, string[]>>;
}>;

function timestamp(value: FormDataEntryValue | null): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(raw)) return `${raw}:00+05:30`;
  return raw;
}

function safeError(error: unknown): SubmissionActionState {
  if (error instanceof ReporterSubmissionError) {
    const field = error.code === "classification-invalid"
      ? "categoryId"
      : error.code === "media-invalid"
        ? "mediaIds"
        : undefined;
    return {
      status: "error",
      message: error.message,
      ...(field ? { fieldErrors: { [field]: [error.message] } } : {}),
    };
  }
  return { status: "error", message: "The story could not be saved. Please try again." };
}

function storyInput(formData: FormData, now: string) {
  const [languageId = "", languageCode = ""] = String(formData.get("language") ?? "").split(":", 2);
  return validateReporterStoryInput({
    title: formData.get("title"),
    summary: formData.get("summary"),
    body: formData.get("body"),
    languageCode,
    languageId,
    categoryId: formData.get("categoryId"),
    eventOccurredAt: timestamp(formData.get("eventOccurredAt")),
    mediaIds: formData.getAll("mediaIds").map(String),
    featuredMediaId: formData.get("featuredMediaId") || null,
  }, now);
}

function submissionEvidence(formData: FormData, now: string) {
  return validateSubmissionEvidence({
    locality: formData.get("locality"),
    location: {
      latitude: formData.get("latitude"),
      longitude: formData.get("longitude"),
      accuracy: formData.get("accuracy"),
      capturedAt: timestamp(formData.get("capturedAt")),
    },
  }, now);
}

function validStoryId(id: string | null): id is string {
  return id !== null && z.uuid().safeParse(id).success;
}

function revalidateStories(id: string) {
  revalidatePath("/stories");
  revalidatePath("/stories/new");
  revalidatePath(`/stories/${id}`);
  revalidatePath("/dashboard");
}

export async function saveReporterDraftAction(
  id: string | null,
  _previousState: SubmissionActionState,
  formData: FormData,
): Promise<SubmissionActionState> {
  const actor = await requireReporterSession();
  if (actor.state !== "reporter" || (id !== null && !validStoryId(id))) {
    return { status: "error", message: "This story cannot be changed." };
  }
  const parsed = storyInput(formData, new Date().toISOString());
  if (!parsed.ok) {
    return {
      status: "error",
      message: "Check the highlighted story fields.",
      fieldErrors: parsed.fieldErrors,
    };
  }
  let saved;
  try {
    saved = await saveReporterDraft(actor.userId, id, parsed.data);
  } catch (error) {
    return safeError(error);
  }
  revalidateStories(saved.id);
  if (id === null) redirect(`/stories/${saved.id}`);
  return { status: "success", message: "Draft saved.", storyId: saved.id };
}

async function transitionAction(
  id: string,
  formData: FormData,
  direct: boolean,
): Promise<SubmissionActionState> {
  const actor = await requireReporterSession();
  if (actor.state !== "reporter" || !validStoryId(id)) {
    return { status: "error", message: "This story cannot be submitted." };
  }
  const parsed = submissionEvidence(formData, new Date().toISOString());
  if (!parsed.ok) {
    return {
      status: "error",
      message: "Capture a current location and check the highlighted fields.",
      fieldErrors: parsed.fieldErrors,
    };
  }
  let result;
  try {
    result = direct
      ? await directPublishReporterStory(actor.userId, id, parsed.data)
      : await submitReporterStory(actor.userId, id, parsed.data);
  } catch (error) {
    return safeError(error);
  }
  revalidateStories(result.id);
  return {
    status: "success",
    message: direct ? "Story published." : "Story submitted for review.",
    storyId: result.id,
  };
}

export async function submitReporterStoryAction(
  id: string,
  _previousState: SubmissionActionState,
  formData: FormData,
) {
  return transitionAction(id, formData, false);
}

export async function directPublishReporterStoryAction(
  id: string,
  _previousState: SubmissionActionState,
  formData: FormData,
) {
  return transitionAction(id, formData, true);
}

export async function withdrawReporterStoryAction(
  id: string,
  previousState: SubmissionActionState,
  formData: FormData,
): Promise<SubmissionActionState> {
  void previousState;
  void formData;
  const actor = await requireReporterSession();
  if (actor.state !== "reporter" || !validStoryId(id)) {
    return { status: "error", message: "This story cannot be withdrawn." };
  }
  let result;
  try {
    result = await withdrawReporterStory(actor.userId, id);
  } catch (error) {
    return safeError(error);
  }
  revalidateStories(result.id);
  return { status: "success", message: "Story withdrawn.", storyId: result.id };
}
