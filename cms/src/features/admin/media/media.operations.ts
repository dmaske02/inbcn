import {
  createMediaMetadata,
  type MediaMetadata,
} from "./media.model.ts";
import { inspectImageFile, type VerifiedImageFormat } from "./file-signature.ts";

export type MediaFileInput = Readonly<{
  name: string;
  type: string;
  size: number;
  bytes: Uint8Array;
}>;

export type VerifiedMediaFileInput = MediaFileInput & Readonly<{
  format: VerifiedImageFormat;
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
  }>;
  cloudinary: Readonly<{
    upload(file: VerifiedMediaFileInput): Promise<CloudinaryUploadResult>;
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
  | "CONFLICT"
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

function assertUploadInput(input: MediaUploadInput): VerifiedMediaFileInput {
  const validation = inspectImageFile(input.file);
  if (!validation.ok) {
    const message = validation.reason === "FILE_TOO_LARGE"
      ? "Images must be 10 MB or smaller."
      : validation.reason === "EMPTY_FILE"
        ? "Choose an image to upload."
        : "Upload a valid JPEG, PNG, WebP, or AVIF image whose type and filename match its contents.";
    throw new MediaManagementError("VALIDATION", message);
  }
  if (!input.title.trim()) {
    throw new MediaManagementError("VALIDATION", "Image title is required.");
  }
  if (!input.altText.trim()) {
    throw new MediaManagementError("VALIDATION", "Alt text is required.");
  }
  return {
    ...input.file,
    name: validation.filename,
    type: validation.mimeType,
    format: validation.format,
  };
}

function persistenceInput(
  input: MediaUploadInput,
  file: VerifiedMediaFileInput,
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
      originalFilename: file.name,
      assetId: result.assetId,
    }),
  };
}

export function createMediaOperations(dependencies: MediaOperationsDependencies) {
  async function uploadToCloudinary(file: VerifiedMediaFileInput): Promise<CloudinaryUploadResult> {
    try {
      return await dependencies.cloudinary.upload(file);
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
      const file = assertUploadInput(input);
      await assertUnique(input.checksum);
      const uploaded = await uploadToCloudinary(file);
      try {
        return await dependencies.repository.insert(persistenceInput(input, file, uploaded));
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
      const file = assertUploadInput(input);
      const existing = await dependencies.repository.getById(id);
      if (!existing) {
        throw new MediaManagementError("NOT_FOUND", "The image could not be found.");
      }
      await assertUnique(input.checksum, id);
      const uploaded = await uploadToCloudinary(file);
      let replacement: PersistedMedia;
      try {
        replacement = await dependencies.repository.update(
          id,
          persistenceInput(input, file, uploaded),
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
  } as const;
}
