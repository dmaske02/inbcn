import "server-only";

import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

import { env } from "@/config/env";
import type {
  CloudinaryUploadResult,
  MediaFileInput,
} from "./media.operations";

function requiredConfiguration() {
  const cloudName = env.server.cloudinaryCloudName;
  const apiKey = env.server.cloudinaryApiKey;
  const apiSecret = env.server.cloudinaryApiSecret;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Cloudinary server configuration is incomplete. Configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.",
    );
  }
  if (
    env.public.cloudinaryCloudName &&
    env.public.cloudinaryCloudName !== cloudName
  ) {
    throw new Error("Cloudinary public and server cloud names do not match.");
  }
  return { cloudName, apiKey, apiSecret };
}

function configuredClient() {
  const configuration = requiredConfiguration();
  cloudinary.config({
    cloud_name: configuration.cloudName,
    api_key: configuration.apiKey,
    api_secret: configuration.apiSecret,
    secure: true,
  });
  return cloudinary;
}

export async function uploadCloudinaryImage(
  file: MediaFileInput,
): Promise<CloudinaryUploadResult> {
  const client = configuredClient();
  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = client.uploader.upload_stream(
      {
        resource_type: "image",
        type: "upload",
        folder: "inbcn/media",
        use_filename: true,
        unique_filename: true,
        overwrite: false,
        filename_override: file.name,
      },
      (error, response) => {
        if (error) reject(error);
        else if (!response) reject(new Error("Cloudinary returned no upload result."));
        else resolve(response);
      },
    );
    stream.end(Buffer.from(file.bytes));
  });

  return {
    publicId: result.public_id,
    secureUrl: result.secure_url,
    assetId: result.asset_id,
    format: result.format,
    mimeType: file.type,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
  };
}

export async function destroyCloudinaryImage(publicId: string): Promise<void> {
  const result = await configuredClient().uploader.destroy(publicId, {
    resource_type: "image",
    invalidate: true,
    type: "upload",
  });
  if (result.result !== "ok" && result.result !== "not found") {
    throw new Error("Cloudinary did not confirm asset deletion.");
  }
}

export function getCloudinaryCloudName(): string {
  return requiredConfiguration().cloudName;
}
