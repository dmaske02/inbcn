"use server";

import { revalidatePath } from "next/cache";

import { requireReporterSession } from "../auth/server";
import { validateLiveRequestInput } from "./live-request.model";
import { createLiveRequest, LiveRequestError } from "./live-request.service";

export type LiveRequestActionState = Readonly<{
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Readonly<Record<string, string[]>>;
}>;

function istTimestamp(value: FormDataEntryValue | null): string {
  const raw = typeof value === "string" ? value.trim() : "";
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(raw) ? `${raw}:00+05:30` : raw;
}

export async function createLiveRequestAction(
  _previous: LiveRequestActionState,
  formData: FormData,
): Promise<LiveRequestActionState> {
  const actor = await requireReporterSession();
  if (actor.state !== "reporter") return { status: "error", message: "Live requests are available after reporter approval." };
  const parsed = validateLiveRequestInput({
    title: formData.get("title"),
    purpose: formData.get("purpose"),
    intendedLocality: formData.get("intendedLocality"),
    expectedStartsAt: istTimestamp(formData.get("expectedStartsAt")),
    expectedDurationMinutes: formData.get("expectedDurationMinutes"),
    supportingNotes: formData.get("supportingNotes"),
  });
  if (!parsed.ok) return { status: "error", message: "Check the highlighted fields.", fieldErrors: parsed.fieldErrors };
  try {
    await createLiveRequest(actor.userId, parsed.data);
  } catch (error) {
    return { status: "error", message: error instanceof LiveRequestError ? error.message : "The live request could not be saved. Please try again." };
  }
  revalidatePath("/live");
  revalidatePath("/live/request");
  return { status: "success", message: "Live request submitted for editorial review." };
}
