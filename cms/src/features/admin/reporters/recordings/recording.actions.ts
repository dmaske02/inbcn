"use server";

import { revalidatePath } from "next/cache";

import { requireAdminUser } from "../../auth/server";
import {
  publishRecording,
  RecordingReviewError,
  rejectRecording,
  setRecordingLegalHold,
} from "./recording.service";

export type RecordingActionState = Readonly<{
  status: "idle" | "error" | "success";
  message?: string;
}>;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function safeError(error: unknown): RecordingActionState {
  return {
    status: "error",
    message: error instanceof RecordingReviewError
      ? error.message
      : "The recording could not be updated. Please try again.",
  };
}

function refresh(id: string, published = false): void {
  revalidatePath("/admin/reporters/recordings");
  revalidatePath(`/admin/reporters/recordings/${id}`);
  if (published) {
    revalidatePath(`/replays/${id}`);
    revalidatePath("/[locale]/replays/[id]", "page");
  }
}

export async function publishRecordingAction(
  id: string,
  _previous: RecordingActionState,
  formData: FormData,
): Promise<RecordingActionState> {
  const admin = await requireAdminUser();
  try {
    await publishRecording(admin, id, {
      title: text(formData, "title"),
      description: text(formData, "description"),
      categoryId: text(formData, "categoryId"),
      thumbnailMediaId: text(formData, "thumbnailMediaId"),
    });
    refresh(id, true);
    return { status: "success", message: "Recording published." };
  } catch (error) {
    return safeError(error);
  }
}

export async function rejectRecordingAction(
  id: string,
  _previous: RecordingActionState,
  formData: FormData,
): Promise<RecordingActionState> {
  const admin = await requireAdminUser();
  try {
    await rejectRecording(admin, id, text(formData, "reason"));
    refresh(id);
    return { status: "success", message: "Recording rejected." };
  } catch (error) {
    return safeError(error);
  }
}

export async function setRecordingLegalHoldAction(
  id: string,
  _previous: RecordingActionState,
  formData: FormData,
): Promise<RecordingActionState> {
  const admin = await requireAdminUser();
  try {
    const enabled = text(formData, "enabled");
    if (enabled !== "true" && enabled !== "false") {
      throw new RecordingReviewError("INVALID", "The legal-hold state is invalid.");
    }
    await setRecordingLegalHold(admin, id, enabled === "true", text(formData, "reason"));
    refresh(id);
    return { status: "success", message: enabled === "true" ? "Legal hold enabled." : "Legal hold released." };
  } catch (error) {
    return safeError(error);
  }
}
