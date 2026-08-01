"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/features/admin/auth/server";
import {
  MediaManagementError,
  removeMedia,
  replaceMedia,
  uploadMedia,
  type MediaFormInput,
} from "./media.service";

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

function refreshMediaViews() {
  revalidatePath("/admin/media");
  revalidatePath("/admin/stories");
  revalidatePath("/en");
  revalidatePath("/hi");
  revalidatePath("/mr");
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
    refreshMediaViews();
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
    refreshMediaViews();
    return { status: "success", message: "Image replaced successfully." };
  } catch (error) {
    return safeError(error);
  }
}

export async function deleteMediaAction(formData: FormData): Promise<void> {
  const admin = await requireAdminUser();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin/media?error=invalid-media");
  try {
    await removeMedia(admin, id);
  } catch {
    redirect("/admin/media?error=delete-failed");
  }
  refreshMediaViews();
  redirect("/admin/media?changed=deleted");
}
