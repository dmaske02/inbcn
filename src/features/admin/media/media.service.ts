import "server-only";

import { createHash } from "node:crypto";

import type { AdminIdentity } from "@/features/admin/auth/authorization.model";
import {
  destroyCloudinaryImage,
  getCloudinaryCloudName,
  uploadCloudinaryImage,
} from "./cloudinary.server";
import {
  buildCloudinaryDeliveryUrl,
  canManageMedia,
  validateImageUpload,
} from "./media.model";
import {
  createMediaOperations,
  MediaManagementError,
  type MediaUploadInput,
} from "./media.operations";
import {
  countMediaStoryReferences,
  deleteMedia,
  findMediaByChecksum,
  getMediaById,
  getMediaPage,
  insertMedia,
  updateMedia,
} from "./media.repository";
import type { MediaDto, MediaListSort } from "./media.types";

const MEDIA_PAGE_SIZE = 24;
const MEDIA_PICKER_LIMIT = 60;

const operations = createMediaOperations({
  repository: {
    findByChecksum: findMediaByChecksum,
    insert: insertMedia,
    update: updateMedia,
    getById: getMediaById,
    countStoryReferences: countMediaStoryReferences,
    delete: deleteMedia,
  },
  cloudinary: {
    upload: uploadCloudinaryImage,
    destroy: destroyCloudinaryImage,
  },
});

export type MediaFormInput = Readonly<{
  file: File;
  title: string;
  altText: string;
  caption: string;
  credit: string;
  tags: string;
}>;

export type MediaLibraryParams = Readonly<{
  page?: string;
  search?: string;
  sort?: string;
}>;

export type MediaLibraryItemView = Readonly<{
  id: string;
  title: string;
  altText: string;
  caption: string | null;
  credit: string | null;
  tags: readonly string[];
  uploadedBy: string;
  publicId: string;
  deliveryUrl: string;
  width: number | null;
  height: number | null;
  format: string | null;
  bytes: number | null;
  createdAt: string;
  storyReferenceCount: number;
  canDelete: boolean;
}>;

export type MediaLibraryView = Readonly<{
  items: readonly MediaLibraryItemView[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  filters: Readonly<{ search: string; sort: MediaListSort }>;
}>;

function requireMediaManager(admin: AdminIdentity): void {
  if (!canManageMedia(admin.role)) {
    throw new MediaManagementError(
      "FORBIDDEN",
      "Your role cannot manage the media library.",
    );
  }
}

function parseSort(value?: string): MediaListSort {
  return value === "oldest" || value === "largest" ? value : "newest";
}

function toView(
  item: MediaDto,
  storyReferenceCount: number,
): MediaLibraryItemView {
  const cloudName = getCloudinaryCloudName();
  return {
    id: item.id,
    title: item.metadata.title || item.altText || item.metadata.originalFilename || "Untitled image",
    altText: item.altText || "",
    caption: item.caption,
    credit: item.metadata.credit,
    tags: item.metadata.tags,
    uploadedBy: item.metadata.uploadedBy || "INBCN Editorial",
    publicId: item.publicId,
    deliveryUrl: buildCloudinaryDeliveryUrl(cloudName, item.publicId),
    width: item.width,
    height: item.height,
    format: item.format,
    bytes: item.bytes,
    createdAt: item.createdAt,
    storyReferenceCount,
    canDelete: storyReferenceCount === 0,
  };
}

export async function getMediaLibraryView(
  admin: AdminIdentity,
  params: MediaLibraryParams,
): Promise<MediaLibraryView> {
  requireMediaManager(admin);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const sort = parseSort(params.sort);
  const result = await getMediaPage({
    page,
    pageSize: MEDIA_PAGE_SIZE,
    search: params.search?.trim() || undefined,
    sort,
  });

  return {
    items: result.items.map((item) =>
      toView(item, result.storyReferenceCounts.get(item.id) ?? 0)),
    page,
    pageSize: MEDIA_PAGE_SIZE,
    total: result.total,
    totalPages: Math.max(1, Math.ceil(result.total / MEDIA_PAGE_SIZE)),
    filters: { search: params.search ?? "", sort },
  };
}

export async function getMediaPickerOptions(
  admin: AdminIdentity,
): Promise<readonly MediaLibraryItemView[]> {
  if (!canManageMedia(admin.role)) return [];
  const result = await getMediaPage({
    page: 1,
    pageSize: MEDIA_PICKER_LIMIT,
    sort: "newest",
  });
  return result.items.map((item) =>
    toView(item, result.storyReferenceCounts.get(item.id) ?? 0));
}

export async function isSelectableMedia(
  admin: AdminIdentity,
  id: string,
): Promise<boolean> {
  requireMediaManager(admin);
  return Boolean(await getMediaById(id));
}

async function prepareUpload(
  admin: AdminIdentity,
  input: MediaFormInput,
): Promise<MediaUploadInput> {
  requireMediaManager(admin);
  const validation = validateImageUpload(input.file);
  if (!validation.ok) {
    const message = validation.reason === "FILE_TOO_LARGE"
      ? "Images must be 10 MB or smaller."
      : validation.reason === "UNSUPPORTED_TYPE"
        ? "Upload a JPEG, PNG, WebP, or AVIF image."
        : "Choose an image to upload.";
    throw new MediaManagementError("VALIDATION", message);
  }
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const checksum = createHash("sha256").update(bytes).digest("hex");
  return {
    file: {
      name: input.file.name,
      type: input.file.type,
      size: input.file.size,
      bytes,
    },
    title: input.title,
    altText: input.altText,
    caption: input.caption,
    credit: input.credit,
    tags: input.tags,
    uploadedBy: admin.displayName,
    createdBy: admin.id,
    checksum,
  };
}

export async function uploadMedia(
  admin: AdminIdentity,
  input: MediaFormInput,
): Promise<MediaDto> {
  return operations.upload(await prepareUpload(admin, input)) as Promise<MediaDto>;
}

export async function replaceMedia(
  admin: AdminIdentity,
  id: string,
  input: MediaFormInput,
): Promise<MediaDto> {
  return operations.replace(id, await prepareUpload(admin, input)) as Promise<MediaDto>;
}

export async function removeMedia(
  admin: AdminIdentity,
  id: string,
): Promise<void> {
  requireMediaManager(admin);
  await operations.remove(id);
}

export { MEDIA_PAGE_SIZE, MediaManagementError };
