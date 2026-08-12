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
  buildCloudinaryThumbnailUrl,
  canManageMedia,
  normalizeMediaMetadataUpdate,
  type MediaMetadataFieldErrors,
  type MediaMetadataUpdateInput,
  validateImageUpload,
} from "./media.model";
import {
  createMediaOperations,
  MediaManagementError,
  type MediaUploadInput,
} from "./media.operations";
import {
  findMediaByChecksum,
  getMediaById,
  getMediaByIdIncludingRetired,
  getMediaPage,
  getMediaStoryUsages,
  insertMedia,
  MediaLifecycleRepositoryError,
  restoreMediaRecord,
  retireMediaRecord,
  updateMedia,
  updateMediaMetadata as updateMediaMetadataRecord,
} from "./media.repository";
import type { MediaDto, MediaListSort, MediaStoryUsage } from "./media.types";

const MEDIA_PAGE_SIZE = 24;
const MEDIA_PICKER_LIMIT = 60;
const MEDIA_PICKER_PAGE_SIZE = 12;

const operations = createMediaOperations({
  repository: {
    findByChecksum: findMediaByChecksum,
    insert: insertMedia,
    update: updateMedia,
    getById: getMediaById,
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
  type?: string;
  date?: string;
  lifecycle?: string;
}>;

export type MediaLibraryItemView = Readonly<{
  id: string;
  title: string;
  altText: string;
  caption: string | null;
  credit: string | null;
  tags: readonly string[];
  uploadedBy: string;
  deliveryUrl: string;
  thumbnailUrl: string;
  originalFilename: string;
  mediaType: "image" | "video" | "audio" | "document";
  width: number | null;
  height: number | null;
  format: string | null;
  bytes: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  isRetired: boolean;
  storyReferenceCount: number;
  canRetire: boolean;
  usages: readonly MediaStoryUsage[];
}>;

export type MediaLibraryView = Readonly<{
  items: readonly MediaLibraryItemView[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  filters: Readonly<{ search: string; sort: MediaListSort; type: "all" | "image"; date: "all" | "7d" | "30d"; lifecycle: "active" | "retired" }>;
}>;

export type MediaPickerPage = Readonly<{
  items: readonly MediaLibraryItemView[];
  page: number;
  total: number;
  totalPages: number;
  query: string;
  type: "all" | "image";
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
  usages: readonly MediaStoryUsage[] = [],
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
    deliveryUrl: buildCloudinaryDeliveryUrl(cloudName, item.publicId),
    thumbnailUrl: buildCloudinaryThumbnailUrl(cloudName, item.publicId),
    originalFilename: item.originalFilename,
    mediaType: item.mediaType,
    width: item.width,
    height: item.height,
    format: item.format,
    bytes: item.bytes,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    deletedAt: item.deletedAt,
    isRetired: item.deletedAt !== null,
    storyReferenceCount,
    canRetire: item.deletedAt === null && storyReferenceCount === 0,
    usages,
  };
}

export async function getMediaLibraryView(
  admin: AdminIdentity,
  params: MediaLibraryParams,
): Promise<MediaLibraryView> {
  requireMediaManager(admin);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const sort = parseSort(params.sort);
  const type = params.type === "image" ? "image" : "all";
  const date = params.date === "7d" || params.date === "30d" ? params.date : "all";
  const lifecycle = params.lifecycle === "retired" ? "retired" : "active";
  const days = date === "7d" ? 7 : date === "30d" ? 30 : 0;
  const createdAfter = days
    ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    : undefined;
  const result = await getMediaPage({
    page,
    pageSize: MEDIA_PAGE_SIZE,
    search: params.search?.trim() || undefined,
    sort,
    mediaType: type === "image" ? "image" : undefined,
    createdAfter,
    lifecycle,
  });

  return {
    items: result.items.map((item) =>
      toView(item, result.storyReferenceCounts.get(item.id) ?? 0, result.storyUsages.get(item.id) ?? [])),
    page,
    pageSize: MEDIA_PAGE_SIZE,
    total: result.total,
    totalPages: Math.max(1, Math.ceil(result.total / MEDIA_PAGE_SIZE)),
    filters: { search: params.search?.trim() ?? "", sort, type, date, lifecycle },
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
    mediaType: "image",
  });
  return result.items.map((item) =>
    toView(item, result.storyReferenceCounts.get(item.id) ?? 0));
}

export async function getMediaReferenceView(id: string): Promise<MediaLibraryItemView | null> {
  const item = await getMediaById(id);
  return item ? toView(item, 0) : null;
}

export async function getMediaPickerPage(
  admin: AdminIdentity,
  input: Readonly<{ query?: unknown; page?: unknown; type?: unknown }>,
): Promise<MediaPickerPage> {
  requireMediaManager(admin);
  const query = typeof input.query === "string" ? input.query.trim().slice(0, 120) : "";
  const parsedPage = typeof input.page === "number" ? input.page : Number.parseInt(String(input.page ?? "1"), 10);
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const type = input.type === "image" ? "image" : "all";
  const result = await getMediaPage({
    page,
    pageSize: MEDIA_PICKER_PAGE_SIZE,
    search: query || undefined,
    sort: "newest",
    mediaType: type === "image" ? "image" : undefined,
  });
  return {
    items: result.items.map((item) => toView(item, result.storyReferenceCounts.get(item.id) ?? 0)),
    page,
    total: result.total,
    totalPages: Math.max(1, Math.ceil(result.total / MEDIA_PICKER_PAGE_SIZE)),
    query,
    type,
  };
}

export async function isSelectableMedia(
  admin: AdminIdentity,
  id: string,
): Promise<boolean> {
  requireMediaManager(admin);
  return Boolean(await getMediaById(id));
}

export type MediaMetadataUpdateResult =
  | Readonly<{ ok: true; media: MediaDto }>
  | Readonly<{ ok: false; code: "VALIDATION"; fieldErrors: MediaMetadataFieldErrors }>
  | Readonly<{ ok: false; code: "NOT_FOUND" | "CONFLICT" }>;

export async function updateMediaMetadata(
  admin: AdminIdentity,
  id: string,
  expectedUpdatedAt: string,
  input: MediaMetadataUpdateInput,
): Promise<MediaMetadataUpdateResult> {
  requireMediaManager(admin);
  const validation = normalizeMediaMetadataUpdate(input);
  if (!validation.ok) return { ok: false, code: "VALIDATION", fieldErrors: validation.fieldErrors };
  const current = await getMediaById(id);
  if (!current) return { ok: false, code: "NOT_FOUND" };
  if (current.updatedAt !== expectedUpdatedAt) return { ok: false, code: "CONFLICT" };
  const media = await updateMediaMetadataRecord(id, {
    ...validation.value,
    updatedBy: admin.id,
    expectedUpdatedAt,
  });
  return media ? { ok: true, media } : { ok: false, code: "CONFLICT" };
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

export type MediaLifecycleResult =
  | Readonly<{ ok: true; state: "retired" | "active" }>
  | Readonly<{ ok: false; code: "NOT_FOUND" | "IN_USE" | "CONFLICT" | "ALREADY_RETIRED" | "FORBIDDEN" }>;

export type MediaLifecycleView = Readonly<{
  media: MediaLibraryItemView;
  usages: readonly MediaStoryUsage[];
}>;

export async function getMediaLifecycleView(admin: AdminIdentity, id: string): Promise<MediaLifecycleView | null> {
  requireMediaManager(admin);
  const item = await getMediaByIdIncludingRetired(id);
  if (!item) return null;
  const usages = await getMediaStoryUsages(id);
  return { media: toView(item, usages.length), usages };
}

async function runLifecycle(
  operation: () => Promise<void>,
  state: "retired" | "active",
): Promise<MediaLifecycleResult> {
  try {
    await operation();
    return { ok: true, state };
  } catch (error) {
    if (!(error instanceof MediaLifecycleRepositoryError)) throw error;
    if (error.code === "NOT_RETIRED") return { ok: false, code: "NOT_FOUND" };
    if (error.code === "PERSISTENCE") throw error;
    return { ok: false, code: error.code };
  }
}

export async function retireMedia(admin: AdminIdentity, id: string, expectedUpdatedAt: string): Promise<MediaLifecycleResult> {
  if (!canManageMedia(admin.role)) return { ok: false, code: "FORBIDDEN" };
  return runLifecycle(() => retireMediaRecord(id, expectedUpdatedAt), "retired");
}

export async function restoreMedia(admin: AdminIdentity, id: string, expectedUpdatedAt: string): Promise<MediaLifecycleResult> {
  if (!canManageMedia(admin.role)) return { ok: false, code: "FORBIDDEN" };
  return runLifecycle(() => restoreMediaRecord(id, expectedUpdatedAt), "active");
}

export { MEDIA_PAGE_SIZE, MediaManagementError };
