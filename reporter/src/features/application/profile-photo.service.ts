import "server-only";

import { randomUUID } from "node:crypto";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

import { env } from "../../config/env.ts";

export const MAX_PROFILE_PHOTO_SIZE = 10 * 1024 * 1024;

type ProfilePhotoFormat = "jpeg" | "png" | "webp";
type ProfilePhotoInput = Readonly<{
  type: string;
  size: number;
  bytes: Uint8Array;
}>;

export type ProfilePhotoInspection =
  | Readonly<{ ok: true; format: ProfilePhotoFormat; mimeType: string }>
  | Readonly<{
      ok: false;
      code: "empty-file" | "file-too-large" | "invalid-format" | "size-mismatch" | "type-mismatch";
    }>;

export class ProfilePhotoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfilePhotoError";
  }
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function detectedFormat(bytes: Uint8Array): ProfilePhotoFormat | null {
  if (bytes.length >= 4
    && bytes[0] === 0xff && bytes[1] === 0xd8
    && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9) return "jpeg";
  if (bytes.length >= 8
    && bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG"
    && bytes[4] === 0x0d && bytes[5] === 0x0a
    && bytes[6] === 0x1a && bytes[7] === 0x0a) return "png";
  if (bytes.length >= 16
    && ascii(bytes, 0, 4) === "RIFF"
    && ascii(bytes, 8, 4) === "WEBP") return "webp";
  return null;
}

const mimeTypes = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const satisfies Record<ProfilePhotoFormat, string>;

export function inspectProfilePhoto(input: ProfilePhotoInput): ProfilePhotoInspection {
  if (input.bytes.length === 0) return { ok: false, code: "empty-file" };
  if (input.bytes.length > MAX_PROFILE_PHOTO_SIZE) return { ok: false, code: "file-too-large" };
  if (input.size !== input.bytes.length) return { ok: false, code: "size-mismatch" };
  const format = detectedFormat(input.bytes);
  if (!format) return { ok: false, code: "invalid-format" };
  const mimeType = mimeTypes[format];
  if (input.type.toLocaleLowerCase("en") !== mimeType) {
    return { ok: false, code: "type-mismatch" };
  }
  return { ok: true, format, mimeType };
}

type CloudinaryPortraitInput = Readonly<{
  bytes: Uint8Array;
  format: ProfilePhotoFormat;
  mimeType: string;
  publicId: string;
}>;

type ProfilePhotoUploadDependencies = Readonly<{
  randomId(): string;
  upload(input: CloudinaryPortraitInput): Promise<Readonly<{ secureUrl: string }>>;
}>;

export function createProfilePhotoUploader(dependencies: ProfilePhotoUploadDependencies) {
  return async (input: ProfilePhotoInput): Promise<Readonly<{ publicId: string; secureUrl: string }>> => {
    const inspection = inspectProfilePhoto(input);
    if (!inspection.ok) {
      throw new ProfilePhotoError(
        inspection.code === "file-too-large"
          ? "Portraits must be 10 MiB or smaller."
          : "Upload a valid JPEG, PNG, or WebP portrait.",
      );
    }
    const publicId = `inbcn/reporter/portrait/${dependencies.randomId()}`;
    const uploaded = await dependencies.upload({
      ...input,
      format: inspection.format,
      mimeType: inspection.mimeType,
      publicId,
    });
    if (!uploaded.secureUrl.startsWith("https://")) {
      throw new ProfilePhotoError("The portrait provider returned an invalid URL.");
    }
    return { publicId, secureUrl: uploaded.secureUrl };
  };
}

function configuredCloudinary() {
  const { cloudName, apiKey, apiSecret } = env.server.cloudinary;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new ProfilePhotoError("Portrait uploads are temporarily unavailable.");
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  return cloudinary;
}

async function uploadToCloudinary(input: CloudinaryPortraitInput): Promise<Readonly<{ secureUrl: string }>> {
  const response = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = configuredCloudinary().uploader.upload_stream(
      {
        resource_type: "image",
        type: "upload",
        public_id: input.publicId,
        allowed_formats: ["jpg", "jpeg", "png", "webp"],
        overwrite: false,
      },
      (error, result) => {
        if (error) reject(error);
        else if (!result) reject(new Error("Cloudinary returned no result."));
        else resolve(result);
      },
    );
    stream.end(Buffer.from(input.bytes));
  });
  return { secureUrl: response.secure_url };
}

const uploadVerifiedProfilePhoto = createProfilePhotoUploader({
  randomId: randomUUID,
  upload: uploadToCloudinary,
});

export async function uploadProfilePhoto(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return uploadVerifiedProfilePhoto({ type: file.type, size: file.size, bytes });
}

export async function destroyProfilePhoto(publicId: string): Promise<void> {
  const result = await configuredCloudinary().uploader.destroy(publicId, {
    resource_type: "image",
    invalidate: true,
    type: "upload",
  });
  if (result.result !== "ok" && result.result !== "not found") {
    throw new ProfilePhotoError("The portrait provider did not confirm cleanup.");
  }
}
