import {
  createMediaMetadata,
  validateImageUpload,
  type MediaMetadata,
} from "./media.model.ts";

export type MediaFileInput = Readonly<{
  name: string;
  type: string;
  size: number;
  bytes: Uint8Array;
}>;

export type MediaUploadInput = Readonly<{
  file: MediaFileInput;
  title: string;
  altText: string;
  caption: string;
  credit: string;
  tags: string;
  uploadedBy: string;
  createdBy: string;
  checksum: string;
}>;

export type CloudinaryUploadResult = Readonly<{
  publicId: string;
  secureUrl: string;
  assetId: string;
  format: string;
  mimeType: string;
  width: number;
  height: number;
  bytes: number;
}>;

export type PersistedMedia = Readonly<{
  id: string;
  publicId: string;
  secureUrl: string;
  format?: string | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  bytes?: number | null;
  altText?: string | null;
  caption?: string | null;
  metadata?: MediaMetadata;
}>;

export type MediaPersistenceInput = Readonly<{
  publicId: string;
  secureUrl: string;
  format: string;
  mimeType: string;
  width: number;
  height: number;
  bytes: number;
  altText: string;
  caption: string | null;
  createdBy: string;
  metadata: MediaMetadata;
}>;

export type MediaOperationsDependencies = Readonly<{
  repository: Readonly<{
    findByChecksum(checksum: string): Promise<Readonly<{ id: string }> | null>;
    insert(input: MediaPersistenceInput): Promise<PersistedMedia>;
    update(id: string, input: MediaPersistenceInput): Promise<PersistedMedia>;
    getById(id: string): Promise<PersistedMedia | null>;
    countStoryReferences(id: string): Promise<number>;
    delete(id: string): Promise<void>;
  }>;
  cloudinary: Readonly<{
    upload(file: MediaFileInput): Promise<CloudinaryUploadResult>;
    destroy(publicId: string): Promise<void>;
  }>;
}>;

export type MediaManagementErrorCode =
  | "FORBIDDEN"
  | "VALIDATION"
  | "DUPLICATE"
  | "NOT_FOUND"
  | "IN_USE"
  | "UPLOAD_FAILED"
  | "PERSISTENCE_FAILED"
  | "REMOTE_CLEANUP_FAILED";

export class MediaManagementError extends Error {
  readonly code: MediaManagementErrorCode;

  constructor(
    code: MediaManagementErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "MediaManagementError";
    this.code = code;
  }
}

function assertUploadInput(input: MediaUploadInput): void {
  const validation = validateImageUpload(input.file);
  if (!validation.ok) {
    const message = validation.reason === "FILE_TOO_LARGE"
      ? "Images must be 10 MB or smaller."
      : validation.reason === "UNSUPPORTED_TYPE"
        ? "Upload a JPEG, PNG, WebP, or AVIF image."
        : "Choose an image to upload.";
    throw new MediaManagementError("VALIDATION", message);
  }
  if (!input.title.trim()) {
    throw new MediaManagementError("VALIDATION", "Image title is required.");
  }
  if (!input.altText.trim()) {
    throw new MediaManagementError("VALIDATION", "Alt text is required.");
  }
}

function persistenceInput(
  input: MediaUploadInput,
  result: CloudinaryUploadResult,
): MediaPersistenceInput {
  return {
    publicId: result.publicId,
    secureUrl: result.secureUrl,
    format: result.format,
    mimeType: result.mimeType,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    altText: input.altText.trim(),
    caption: input.caption.trim() || null,
    createdBy: input.createdBy,
    metadata: createMediaMetadata({
      title: input.title,
      credit: input.credit,
      tags: input.tags,
      uploadedBy: input.uploadedBy,
      checksum: input.checksum,
      originalFilename: input.file.name,
      assetId: result.assetId,
    }),
  };
}

export function createMediaOperations(dependencies: MediaOperationsDependencies) {
  async function uploadToCloudinary(input: MediaUploadInput): Promise<CloudinaryUploadResult> {
    try {
      return await dependencies.cloudinary.upload(input.file);
    } catch (error) {
      throw new MediaManagementError(
        "UPLOAD_FAILED",
        "The image could not be uploaded. Please try again.",
        { cause: error },
      );
    }
  }

  async function assertUnique(checksum: string, currentId?: string): Promise<void> {
    const duplicate = await dependencies.repository.findByChecksum(checksum);
    if (duplicate && duplicate.id !== currentId) {
      throw new MediaManagementError("DUPLICATE", "This image is already in the media library.");
    }
  }

  return {
    async upload(input: MediaUploadInput): Promise<PersistedMedia> {
      assertUploadInput(input);
      await assertUnique(input.checksum);
      const uploaded = await uploadToCloudinary(input);
      try {
        return await dependencies.repository.insert(persistenceInput(input, uploaded));
      } catch (error) {
        try {
          await dependencies.cloudinary.destroy(uploaded.publicId);
        } catch {
          // The database error remains the actionable failure. Remote cleanup is best effort.
        }
        throw new MediaManagementError(
          "PERSISTENCE_FAILED",
          "The uploaded image could not be saved. Please try again.",
          { cause: error },
        );
      }
    },

    async replace(id: string, input: MediaUploadInput): Promise<PersistedMedia> {
      assertUploadInput(input);
      const existing = await dependencies.repository.getById(id);
      if (!existing) {
        throw new MediaManagementError("NOT_FOUND", "The image could not be found.");
      }
      await assertUnique(input.checksum, id);
      const uploaded = await uploadToCloudinary(input);
      let replacement: PersistedMedia;
      try {
        replacement = await dependencies.repository.update(
          id,
          persistenceInput(input, uploaded),
        );
      } catch (error) {
        try {
          await dependencies.cloudinary.destroy(uploaded.publicId);
        } catch {
          // Preserve the original asset and report the persistence failure.
        }
        throw new MediaManagementError(
          "PERSISTENCE_FAILED",
          "The replacement image could not be saved. Please try again.",
          { cause: error },
        );
      }
      try {
        await dependencies.cloudinary.destroy(existing.publicId);
      } catch (error) {
        throw new MediaManagementError(
          "REMOTE_CLEANUP_FAILED",
          "The image was replaced, but the previous remote asset still needs cleanup.",
          { cause: error },
        );
      }
      return replacement;
    },

    async remove(id: string): Promise<void> {
      const existing = await dependencies.repository.getById(id);
      if (!existing) {
        throw new MediaManagementError("NOT_FOUND", "The image could not be found.");
      }
      if (await dependencies.repository.countStoryReferences(id)) {
        throw new MediaManagementError(
          "IN_USE",
          "Remove this image from every story before deleting it.",
        );
      }
      await dependencies.repository.delete(id);
      try {
        await dependencies.cloudinary.destroy(existing.publicId);
      } catch (error) {
        throw new MediaManagementError(
          "REMOTE_CLEANUP_FAILED",
          "The library entry was removed, but the remote asset still needs cleanup.",
          { cause: error },
        );
      }
    },
  } as const;
}
