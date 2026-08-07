"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "../auth/server";
import { liveTvFormSchema, type LiveTvFormInput } from "./live-tv.model";
import {
  createManagedLiveTv,
  LiveTvManagementError,
  removeManagedLiveTv,
  updateManagedLiveTv,
} from "./live-tv.service";

export type LiveTvActionState = Readonly<{
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Readonly<Record<string, string[] | undefined>>;
}>;

function values(formData: FormData): LiveTvFormInput {
  return {
    languageId: formData.get("languageId"),
    streamTitle: formData.get("streamTitle"),
    shortDescription: formData.get("shortDescription"),
    provider: formData.get("provider"),
    providerUrl: formData.get("providerUrl"),
    status: formData.get("status"),
    posterUrl: formData.get("posterUrl") ?? "",
    posterAltText: formData.get("posterAltText") ?? "",
    autoplay: formData.get("autoplay") === "on",
    muted: formData.get("muted") === "on",
    currentProgramme: formData.get("currentProgramme"),
    programmeDescription: formData.get("programmeDescription"),
    scheduleStart: formData.get("scheduleStart") ?? "",
    scheduleEnd: formData.get("scheduleEnd") ?? "",
    relatedStoryId: formData.get("relatedStoryId") ?? "",
    relatedCategoryId: formData.get("relatedCategoryId") ?? "",
    seoTitle: formData.get("seoTitle") ?? "",
    seoDescription: formData.get("seoDescription") ?? "",
    openGraphImageUrl: formData.get("openGraphImageUrl") ?? "",
    canonicalUrl: formData.get("canonicalUrl") ?? "",
  } as LiveTvFormInput;
}

function validate(formData: FormData) {
  const parsed = liveTvFormSchema.safeParse(values(formData));
  if (parsed.success) return { ok: true as const, values: parsed.data };
  return {
    ok: false as const,
    state: {
      status: "error" as const,
      message: "Check the highlighted fields and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    },
  };
}

function safeError(error: unknown): LiveTvActionState {
  return {
    status: "error",
    message: error instanceof LiveTvManagementError
      ? error.message
      : "The Live TV configuration could not be saved. Please try again.",
  };
}

function revalidateLiveTv(locale: string): void {
  revalidatePath(`/${locale}/live-tv`);
}

function revalidateLiveTvLocales(locales: readonly string[]): void {
  for (const locale of locales) revalidateLiveTv(locale);
}

export async function createLiveTvAction(
  _previous: LiveTvActionState,
  formData: FormData,
): Promise<LiveTvActionState> {
  const admin = await requireAdminUser();
  const parsed = validate(formData);
  if (!parsed.ok) return parsed.state;
  let result;
  try {
    result = await createManagedLiveTv(admin, parsed.values);
  } catch (error) {
    return safeError(error);
  }
  revalidateLiveTvLocales(result.locales);
  redirect(`/admin/live-tv?id=${result.id}&saved=created`);
}

export async function updateLiveTvAction(
  id: string,
  _previous: LiveTvActionState,
  formData: FormData,
): Promise<LiveTvActionState> {
  const admin = await requireAdminUser();
  const parsed = validate(formData);
  if (!parsed.ok) return parsed.state;
  let result;
  try {
    result = await updateManagedLiveTv(admin, id, parsed.values);
  } catch (error) {
    return safeError(error);
  }
  revalidateLiveTvLocales(result.locales);
  redirect(`/admin/live-tv?id=${id}&saved=updated`);
}

export async function deleteLiveTvAction(formData: FormData): Promise<void> {
  const admin = await requireAdminUser();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin/live-tv?error=invalid-delete");
  let result;
  try {
    result = await removeManagedLiveTv(admin, id);
  } catch {
    redirect(`/admin/live-tv?id=${id}&error=delete-failed`);
  }
  revalidateLiveTvLocales(result.locales);
  redirect("/admin/live-tv?changed=deleted");
}
