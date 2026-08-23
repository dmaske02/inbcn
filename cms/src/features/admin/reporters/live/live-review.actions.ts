"use server";

import { revalidatePath } from "next/cache";

import { requireAdminUser } from "../../auth/server";
import { LiveTerminationError, terminateReporterLiveRequest } from "./live-termination.service";
import { approveLiveRequest, LiveReviewError, rejectLiveRequest } from "./live-review.service";

export type LiveReviewActionState = Readonly<{ status: "idle" | "error" | "success"; message?: string }>;

function istTimestamp(value: FormDataEntryValue | null): string {
  const raw = typeof value === "string" ? value.trim() : "";
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(raw) ? `${raw}:00+05:30` : raw;
}

function safeError(error: unknown): LiveReviewActionState {
  return {
    status: "error",
    message: error instanceof LiveReviewError || error instanceof LiveTerminationError
      ? error.message
      : "The live request could not be updated. Please try again.",
  };
}

function refresh(id: string): void {
  revalidatePath("/admin/reporters/live");
  revalidatePath(`/admin/reporters/live/${id}`);
}

export async function approveLiveRequestAction(id: string, _previous: LiveReviewActionState, formData: FormData): Promise<LiveReviewActionState> {
  const admin = await requireAdminUser();
  try {
    await approveLiveRequest(admin, id, { startsAt: istTimestamp(formData.get("approvedStartsAt")), endsAt: istTimestamp(formData.get("approvedEndsAt")) });
    refresh(id);
    return { status: "success", message: "Live request approved for the selected window." };
  } catch (error) { return safeError(error); }
}

export async function rejectLiveRequestAction(id: string, _previous: LiveReviewActionState, formData: FormData): Promise<LiveReviewActionState> {
  const admin = await requireAdminUser();
  try {
    await rejectLiveRequest(admin, id, String(formData.get("reason") ?? ""));
    refresh(id);
    return { status: "success", message: "Live request rejected." };
  } catch (error) { return safeError(error); }
}

export async function terminateLiveRequestAction(id: string, _previous: LiveReviewActionState, formData: FormData): Promise<LiveReviewActionState> {
  const admin = await requireAdminUser();
  try {
    await terminateReporterLiveRequest(admin, id, String(formData.get("reason") ?? ""));
    return { status: "success", message: "Live request terminated and provider cleanup completed." };
  } catch (error) { return safeError(error); }
  finally { refresh(id); }
}
