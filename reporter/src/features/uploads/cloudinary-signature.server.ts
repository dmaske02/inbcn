import "server-only";

import { timingSafeEqual } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";

import { env } from "../../config/env.ts";
import type { UploadMediaType } from "./upload.model.ts";

const CONFIG_VALUE = /^[A-Za-z0-9_-]{1,255}$/u;
const IMAGE_FORMATS = ["jpg", "jpeg", "png", "webp", "avif"] as const;
const VIDEO_FORMATS = ["mp4", "webm"] as const;

type SignatureParameters = Readonly<{
  timestamp: number;
  public_id: string;
  type: "upload";
  overwrite: false;
  allowed_formats: readonly string[];
}>;

type ProviderOptions = Readonly<{
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  signRequest(parameters: SignatureParameters, secret: string): string;
  fetchAsset(assetId: string): Promise<unknown>;
}>;

function parameters(input: Readonly<{
  publicId: string;
  mediaType: UploadMediaType;
  timestamp: number;
}>): SignatureParameters {
  return {
    timestamp: input.timestamp,
    public_id: input.publicId,
    type: "upload",
    overwrite: false,
    allowed_formats: input.mediaType === "image" ? [...IMAGE_FORMATS] : [...VIDEO_FORMATS],
  };
}

export function createCloudinaryUploadProvider(options: ProviderOptions) {
  if (!CONFIG_VALUE.test(options.cloudName) || !CONFIG_VALUE.test(options.apiKey) || !options.apiSecret) {
    throw new Error("Cloudinary uploads are not configured.");
  }
  return {
    sign(input: Readonly<{ publicId: string; mediaType: UploadMediaType; timestamp: number }>) {
      const fixed = parameters(input);
      return {
        cloudName: options.cloudName,
        apiKey: options.apiKey,
        timestamp: input.timestamp,
        signature: options.signRequest(fixed, options.apiSecret),
        resourceType: input.mediaType,
        uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(options.cloudName)}/${input.mediaType}/upload`,
        publicId: input.publicId,
        signedParameters: {
          public_id: input.publicId,
          type: "upload" as const,
          overwrite: false as const,
          allowed_formats: fixed.allowed_formats,
        },
      };
    },

    verify(input: Readonly<{
      publicId: string;
      mediaType: UploadMediaType;
      timestamp: number;
      signature: string;
    }>): boolean {
      try {
        const expected = options.signRequest(parameters(input), options.apiSecret);
        const actualBytes = Buffer.from(input.signature, "utf8");
        const expectedBytes = Buffer.from(expected, "utf8");
        return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
      } catch {
        return false;
      }
    },

    getAsset: options.fetchAsset,
    getCloudName: () => options.cloudName,
  } as const;
}

function configuredProvider() {
  const { cloudName, apiKey, apiSecret } = env.server.cloudinary;
  if (!cloudName || !apiKey || !apiSecret) throw new Error("Cloudinary uploads are not configured.");
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  const api = cloudinary.api as unknown as Readonly<{
    resource_by_asset_id(
      assetId: string,
      callback: (error?: unknown, result?: unknown) => void,
    ): void;
  }>;
  return createCloudinaryUploadProvider({
    cloudName,
    apiKey,
    apiSecret,
    signRequest: (fixed, secret) => cloudinary.utils.api_sign_request(fixed, secret),
    fetchAsset: (assetId) => new Promise((resolve, reject) => {
      api.resource_by_asset_id(assetId, (error, result) => {
        if (error) reject(error);
        else if (!result) reject(new Error("Cloudinary returned no asset."));
        else resolve(result);
      });
    }),
  });
}

export const sign = (input: Parameters<ReturnType<typeof createCloudinaryUploadProvider>["sign"]>[0]) =>
  configuredProvider().sign(input);

export const verify = (input: Parameters<ReturnType<typeof createCloudinaryUploadProvider>["verify"]>[0]) =>
  configuredProvider().verify(input);

export const getAsset = (assetId: string) => configuredProvider().getAsset(assetId);
export const getCloudName = () => configuredProvider().getCloudName();
