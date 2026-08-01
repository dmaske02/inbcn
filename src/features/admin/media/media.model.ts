import type { AdminRole } from "@/features/admin/auth/authorization.model";
import { buildCloudinaryDeliveryUrl } from "../../news/server/services/public-story.mjs";

export { buildCloudinaryDeliveryUrl };

export const MAX_MEDIA_FILE_SIZE = 10 * 1024 * 1024;
export const SUPPORTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

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
      reason: "EMPTY_FILE" | "UNSUPPORTED_TYPE" | "FILE_TOO_LARGE";
    }>;

export function validateImageUpload(file: UploadFileDescriptor): ImageUploadValidation {
  if (!file.name.trim() || file.size <= 0) {
    return { ok: false, reason: "EMPTY_FILE" };
  }
  if (!SUPPORTED_IMAGE_TYPES.includes(file.type as (typeof SUPPORTED_IMAGE_TYPES)[number])) {
    return { ok: false, reason: "UNSUPPORTED_TYPE" };
  }
  if (file.size > MAX_MEDIA_FILE_SIZE) {
    return { ok: false, reason: "FILE_TOO_LARGE" };
  }
  return { ok: true };
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
  return {
    id: row.id,
    storyId: row.story_id,
    createdBy: row.created_by,
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
    metadata: parseMediaMetadata(row.metadata),
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
