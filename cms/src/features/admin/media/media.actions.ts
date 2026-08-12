"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminUser } from "@/features/admin/auth/server";
import { revalidateWebsite } from "@/features/admin/public-revalidation";
import {
  MediaManagementError,
  retireMedia,
  restoreMedia,
  replaceMedia,
  uploadMedia,
  updateMediaMetadata,
  type MediaFormInput,
  getMediaPickerPage,
  type MediaPickerPage,
} from "./media.service";

const lifecycleInputSchema = z.object({
  id: z.uuid(),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
}).strict();

export type MediaPickerActionResult =
  | Readonly<{ ok: true; data: MediaPickerPage }>
  | Readonly<{ ok: false; message: string }>;

export async function searchMediaPickerAction(input: Readonly<{
  query?: string;
  page?: number;
  type?: string;
}>): Promise<MediaPickerActionResult> {
  try {
    const admin = await requireAdminUser();
    return { ok: true, data: await getMediaPickerPage(admin, input) };
  } catch {
    return { ok: false, message: "Unable to load media. Try again." };
  }
}

export type MediaMetadataActionState = Readonly<{
  status: "idle" | "success" | "error" | "conflict";
  message?: string;
  fieldErrors?: Readonly<Record<string, string>>;
  media?: Readonly<{
    title: string; originalFilename: string; altText: string; caption: string; credit: string; updatedAt: string;
  }>;
}>;

export type MediaActionState = Readonly<{
  status: "idle" | "success" | "error";
  message?: string;
}>;

function readForm(formData: FormData): MediaFormInput | null {
  const file = formData.get("file");
  if (!(file instanceof File)) return null;
  return {
    file,
    title: String(formData.get("title") ?? ""),
    altText: String(formData.get("altText") ?? ""),
    caption: String(formData.get("caption") ?? ""),
    credit: String(formData.get("credit") ?? ""),
    tags: String(formData.get("tags") ?? ""),
  };
}

function safeError(error: unknown): MediaActionState {
  if (error instanceof MediaManagementError) {
    return { status: "error", message: error.message };
  }
  return {
    status: "error",
    message: "The media operation could not be completed. Please try again.",
  };
}

async function refreshMediaViews() {
  revalidatePath("/admin/media");
  revalidatePath("/admin/stories");
  await revalidateWebsite("media");
}

export async function uploadMediaAction(
  _previousState: MediaActionState,
  formData: FormData,
): Promise<MediaActionState> {
  const admin = await requireAdminUser();
  const input = readForm(formData);
  if (!input) return { status: "error", message: "Choose an image to upload." };
  try {
    await uploadMedia(admin, input);
    revalidatePath("/admin/media");
    return { status: "success", message: "Image uploaded to the media library." };
  } catch (error) {
    return safeError(error);
  }
}

export async function replaceMediaAction(
  id: string,
  _previousState: MediaActionState,
  formData: FormData,
): Promise<MediaActionState> {
  const admin = await requireAdminUser();
  const input = readForm(formData);
  if (!input) return { status: "error", message: "Choose a replacement image." };
  try {
    await replaceMedia(admin, id, input);
    await refreshMediaViews();
    return { status: "success", message: "Image replaced successfully." };
  } catch (error) {
    return safeError(error);
  }
}

export async function updateMediaMetadataAction(
  id: string,
  _previousState: MediaMetadataActionState,
  formData: FormData,
): Promise<MediaMetadataActionState> {
  const admin = await requireAdminUser();
  try {
    const result = await updateMediaMetadata(
      admin,
      id,
      String(formData.get("expectedUpdatedAt") ?? ""),
      {
        title: String(formData.get("title") ?? ""),
        originalFilename: String(formData.get("originalFilename") ?? ""),
        altText: String(formData.get("altText") ?? ""),
        caption: String(formData.get("caption") ?? ""),
        credit: String(formData.get("credit") ?? ""),
      },
    );
    if (!result.ok) {
      if (result.code === "VALIDATION") return { status: "error", message: "Check the highlighted fields.", fieldErrors: result.fieldErrors };
      if (result.code === "CONFLICT") return { status: "conflict", message: "This media was updated elsewhere. Reopen it to review the latest version." };
      return { status: "error", message: "This media is no longer available." };
    }
    revalidatePath("/admin/media");
    return {
      status: "success",
      message: "Metadata saved.",
      media: {
        title: result.media.title,
        originalFilename: result.media.originalFilename,
        altText: result.media.altText ?? "",
        caption: result.media.caption ?? "",
        credit: result.media.credit ?? "",
        updatedAt: result.media.updatedAt,
      },
    };
  } catch {
    return { status: "error", message: "Unable to update media. Try again." };
  }
}

export type MediaLifecycleActionState = Readonly<{
  status: "success" | "in-use" | "conflict" | "not-found" | "forbidden" | "error";
  message: string;
}>;

function lifecycleFailure(code: "NOT_FOUND" | "IN_USE" | "CONFLICT" | "ALREADY_RETIRED" | "FORBIDDEN"): MediaLifecycleActionState {
  if (code === "IN_USE") return { status: "in-use", message: "This image is currently used by a Story and cannot be retired." };
  if (code === "CONFLICT" || code === "ALREADY_RETIRED") return { status: "conflict", message: "This media changed elsewhere. Refresh and try again." };
  if (code === "FORBIDDEN") return { status: "forbidden", message: "Your role cannot change media lifecycle state." };
  return { status: "not-found", message: "This media is no longer available." };
}

async function runLifecycleAction(
  input: unknown,
  operation: typeof retireMedia,
  successMessage: string,
): Promise<MediaLifecycleActionState> {
  const parsed = lifecycleInputSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "The media request is invalid. Refresh and try again." };
  try {
    const admin = await requireAdminUser();
    const result = await operation(admin, parsed.data.id, parsed.data.expectedUpdatedAt);
    if (!result.ok) return lifecycleFailure(result.code);
    await refreshMediaViews();
    return { status: "success", message: successMessage };
  } catch {
    return { status: "error", message: "The media lifecycle operation could not be completed. Try again." };
  }
}

export async function retireMediaAction(input: unknown): Promise<MediaLifecycleActionState> {
  return runLifecycleAction(input, retireMedia, "Image retired. Its library record and stored file were preserved.");
}

export async function restoreMediaAction(input: unknown): Promise<MediaLifecycleActionState> {
  return runLifecycleAction(input, restoreMedia, "Image restored to the active media library.");
}
