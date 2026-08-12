import type { AdminRole } from "@/features/admin/auth/authorization.model";
import { buildCloudinaryDeliveryUrl } from "../../news/server/services/public-story.mjs";
import { MAX_IMAGE_FILE_SIZE } from "./file-signature.ts";

export { buildCloudinaryDeliveryUrl };

export function buildCloudinaryThumbnailUrl(cloudName: string, publicId: string): string {
  const path = publicId.split("/").map(encodeURIComponent).join("/");
  return `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/image/upload/f_auto,q_auto,c_fill,g_auto,w_720,h_405/${path}`;
}

export const MAX_MEDIA_FILE_SIZE = MAX_IMAGE_FILE_SIZE;
export type MediaMetadata = Readonly<{
  title: string;
  credit: string | null;
  tags: readonly string[];
  uploadedBy: string;
  checksum: string;
  originalFilename: string;
  cloudinaryAssetId: string;
}>;

type UploadFileDescriptor = Readonly<{
  name: string;
  type: string;
  size: number;
}>;

export type ImageUploadValidation =
  | Readonly<{ ok: true }>
  | Readonly<{
      ok: false;
      reason: "EMPTY_FILE" | "FILE_TOO_LARGE";
    }>;

export function validateImageUpload(file: UploadFileDescriptor): ImageUploadValidation {
  if (!file.name.trim() || file.size <= 0) {
    return { ok: false, reason: "EMPTY_FILE" };
  }
  if (file.size > MAX_MEDIA_FILE_SIZE) {
    return { ok: false, reason: "FILE_TOO_LARGE" };
  }
  return { ok: true };
}

export type MediaMetadataUpdateInput = Readonly<{
  title: string;
  originalFilename: string;
  altText: string;
  caption: string;
  credit: string;
}>;

export type MediaMetadataFieldErrors = Partial<Record<keyof MediaMetadataUpdateInput, string>>;

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;

export function normalizeMediaMetadataUpdate(input: MediaMetadataUpdateInput):
  | Readonly<{ ok: true; value: MediaMetadataUpdateInput }>
  | Readonly<{ ok: false; fieldErrors: MediaMetadataFieldErrors }> {
  const value = {
    title: input.title.trim(),
    originalFilename: input.originalFilename.trim(),
    altText: input.altText.trim(),
    caption: input.caption.trim(),
    credit: input.credit.trim(),
  };
  const fieldErrors: MediaMetadataFieldErrors = {};
  if (!value.title) fieldErrors.title = "Title is required.";
  else if (value.title.length > 200) fieldErrors.title = "Title must be 200 characters or fewer.";
  else if (CONTROL_CHARACTERS.test(value.title)) fieldErrors.title = "Title contains unsupported characters.";
  if (value.originalFilename.length > 255) fieldErrors.originalFilename = "Original filename must be 255 characters or fewer.";
  else if (CONTROL_CHARACTERS.test(value.originalFilename)) fieldErrors.originalFilename = "Original filename contains unsupported characters.";
  if (value.altText.length > 500) fieldErrors.altText = "Alt text must be 500 characters or fewer.";
  if (value.caption.length > 1000) fieldErrors.caption = "Caption must be 1,000 characters or fewer.";
  if (value.credit.length > 200) fieldErrors.credit = "Credit must be 200 characters or fewer.";
  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true, value };
}

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function tagsFrom(value: string | readonly string[]): string[] {
  const tags: readonly string[] = typeof value === "string" ? value.split(",") : value;
  const seen = new Set<string>();
  return tags
    .map((tag) => tag.trim())
    .filter((tag) => {
      if (!tag) return false;
      const normalized = tag.toLocaleLowerCase("en");
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

export function createMediaMetadata(input: Readonly<{
  title: string;
  credit?: string | null;
  tags: string | readonly string[];
  uploadedBy: string;
  checksum: string;
  originalFilename: string;
  assetId: string;
}>): MediaMetadata {
  return {
    title: trimmed(input.title),
    credit: trimmed(input.credit) || null,
    tags: tagsFrom(input.tags),
    uploadedBy: trimmed(input.uploadedBy),
    checksum: trimmed(input.checksum),
    originalFilename: trimmed(input.originalFilename),
    cloudinaryAssetId: trimmed(input.assetId),
  };
}

export function parseMediaMetadata(metadata: unknown): MediaMetadata {
  const value = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
  return {
    title: trimmed(value.title),
    credit: trimmed(value.credit) || null,
    tags: Array.isArray(value.tags)
      ? tagsFrom(value.tags.filter((tag): tag is string => typeof tag === "string"))
      : [],
    uploadedBy: trimmed(value.uploadedBy),
    checksum: trimmed(value.checksum),
    originalFilename: trimmed(value.originalFilename),
    cloudinaryAssetId: trimmed(value.cloudinaryAssetId),
  };
}

export function mapMediaRecord(row: Readonly<{
  id: string;
  story_id: string | null;
  created_by: string | null;
  title?: string | null;
  original_filename?: string | null;
  credit?: string | null;
  updated_by?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  media_type?: "image" | "video" | "audio" | "document";
  cloudinary_public_id: string;
  secure_url: string;
  resource_format: string | null;
  mime_type: string | null;
  alt_text: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
}>) {
  const metadata = parseMediaMetadata(row.metadata);
  return {
    id: row.id,
    storyId: row.story_id,
    createdBy: row.created_by,
    title: trimmed(row.title) || metadata.title || trimmed(row.alt_text) || metadata.originalFilename || "Untitled media",
    originalFilename: trimmed(row.original_filename) || metadata.originalFilename,
    credit: trimmed(row.credit) || metadata.credit,
    updatedBy: row.updated_by ?? null,
    deletedAt: row.deleted_at ?? null,
    deletedBy: row.deleted_by ?? null,
    mediaType: row.media_type ?? "image",
    publicId: row.cloudinary_public_id,
    secureUrl: row.secure_url,
    format: row.resource_format,
    mimeType: row.mime_type,
    altText: row.alt_text,
    caption: row.caption,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata,
  } as const;
}

export function canManageMedia(role: AdminRole): boolean {
  return role === "editor" || role === "admin";
}

export function resolveFeaturedMediaSelection(
  role: AdminRole,
  currentId: string | null,
  requestedId: string | null,
): string | null {
  if (role === "writer") return currentId;
  return requestedId?.trim() || null;
}
