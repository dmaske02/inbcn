import { membershipStatusAt } from "@inbcn/domain";

import {
  type UploadMediaType,
  type UploadMetadata,
  type VerifiedProviderAsset,
  validateProviderAsset,
  validateUpload,
  validateUploadMetadata,
} from "./upload.model.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const OBJECT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const ASSET_ID = /^[A-Za-z0-9_-]{1,255}$/u;
const SIGNATURE = /^(?:[\da-f]{40}|[\da-f]{64})$/u;

export type UploadAccess = Readonly<{
  jwtUserId: string;
  jwtRole: string | null;
  jwtAccessGeneration: number | null;
  profileId: string | null;
  profileRole: string | null;
  profileActive: boolean;
  reporterProfileId: string | null;
  accessSyncStatus: string | null;
  accessSyncDesiredRole: string | null;
  accessSyncGeneration: number | null;
  publicStatus: string | null;
  membershipStartedAt: string | null;
  membershipExpiresAt: string | null;
  membershipGraceEndsAt: string | null;
  storyId: string | null;
  storyCreatedBy: string | null;
  isReporterStory: boolean;
  storyStatus: string | null;
  storySourceId: string | null;
}>;

export type CanonicalUploadCompletion = Readonly<{
  profileId: string;
  accessGeneration: number;
  storyId: string;
  metadata: UploadMetadata;
  asset: VerifiedProviderAsset;
}>;

type SignedUpload = Readonly<{
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  resourceType: UploadMediaType;
  uploadUrl: string;
  publicId: string;
  signedParameters: Readonly<{
    public_id: string;
    type: "upload";
    overwrite: false;
    allowed_formats: readonly string[];
  }>;
}>;

type UploadRepository = Readonly<{
  getAccess(profileId: string, storyId: string): Promise<UploadAccess | null>;
  complete(input: CanonicalUploadCompletion): Promise<Readonly<{ id: string }>>;
}>;

type CloudinaryProvider = Readonly<{
  sign(input: Readonly<{ publicId: string; mediaType: UploadMediaType; timestamp: number }>): SignedUpload;
  verify(input: Readonly<{
    publicId: string;
    mediaType: UploadMediaType;
    timestamp: number;
    signature: string;
  }>): boolean;
  getAsset(assetId: string): Promise<unknown>;
  getCloudName(): string;
}>;

export type UploadServiceErrorCode = "conflict" | "forbidden" | "invalid-upload" | "temporarily-unavailable";

export class UploadServiceError extends Error {
  readonly code: UploadServiceErrorCode;

  constructor(code: UploadServiceErrorCode, message: string) {
    super(message);
    this.name = "UploadServiceError";
    this.code = code;
  }
}

function invalidUpload(): never {
  throw new UploadServiceError("invalid-upload", "Check the upload details and try again.");
}

function assertUuid(value: unknown): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value)) invalidUpload();
}

function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidUpload();
}

function accessGeneration(access: UploadAccess | null, profileId: string, storyId: string, now: Date): number {
  if (!access
    || access.jwtUserId !== profileId
    || access.jwtRole !== "reporter"
    || access.profileId !== profileId
    || access.profileRole !== "reporter"
    || !access.profileActive
    || access.reporterProfileId !== profileId
    || access.accessSyncStatus !== "succeeded"
    || access.accessSyncDesiredRole !== "reporter"
    || !Number.isSafeInteger(access.jwtAccessGeneration)
    || access.jwtAccessGeneration !== access.accessSyncGeneration
    || (access.publicStatus !== "active" && access.publicStatus !== "grace")
    || access.storyId !== storyId
    || access.storyCreatedBy !== profileId
    || !access.isReporterStory
    || access.storyStatus !== "draft"
    || access.storySourceId !== null
    || !access.membershipStartedAt
    || !access.membershipExpiresAt
    || !access.membershipGraceEndsAt
    || Date.parse(access.membershipStartedAt) > now.getTime()
    || !Number.isFinite(Date.parse(access.membershipStartedAt))
    || membershipStatusAt({
      publicStatus: access.publicStatus,
      expiresAt: access.membershipExpiresAt,
      graceEndsAt: access.membershipGraceEndsAt,
    }, now.toISOString()) === "expired") {
    throw new UploadServiceError("forbidden", "Uploads are not available for this story.");
  }
  return access.accessSyncGeneration as number;
}

function safeRepositoryError(error: unknown): UploadServiceError {
  if (error instanceof UploadServiceError) return error;
  const message = error instanceof Error ? error.message : "";
  if (message.includes("REPORTER_MEDIA_CONFLICT")) {
    return new UploadServiceError("conflict", "This upload conflicts with an existing media item.");
  }
  if (message.includes("REPORTER_MEDIA_FORBIDDEN")) {
    return new UploadServiceError("forbidden", "Uploads are not available for this story.");
  }
  if (message.includes("REPORTER_MEDIA_INVALID")) return new UploadServiceError("invalid-upload", "Check the upload details and try again.");
  return new UploadServiceError("temporarily-unavailable", "The upload could not be saved. Please retry completion.");
}

export function createUploadService(dependencies: Readonly<{
  repository: UploadRepository;
  provider: CloudinaryProvider;
  now?: () => Date;
  randomId?: () => string;
}>) {
  const currentTime = dependencies.now ?? (() => new Date());
  const randomId = dependencies.randomId ?? crypto.randomUUID;

  async function currentAccess(profileId: string, storyId: string) {
    let access: UploadAccess | null;
    try {
      access = await dependencies.repository.getAccess(profileId, storyId);
    } catch {
      throw new UploadServiceError("temporarily-unavailable", "Uploads are temporarily unavailable.");
    }
    const now = currentTime();
    if (!Number.isFinite(now.getTime())) throw new UploadServiceError("temporarily-unavailable", "Uploads are temporarily unavailable.");
    return { generation: accessGeneration(access, profileId, storyId, now), now };
  }

  return {
    async requestSignedUpload(profileId: string, input: unknown): Promise<SignedUpload> {
      assertUuid(profileId);
      assertRecord(input);
      assertUuid(input.storyId);
      const validated = validateUpload({
        mediaType: input.mediaType,
        filename: input.filename,
        bytes: input.bytes,
        mimeType: input.mimeType,
      });
      if (!validated.ok) invalidUpload();
      const { now } = await currentAccess(profileId, input.storyId);
      const objectId = randomId();
      if (!OBJECT_UUID.test(objectId)) throw new UploadServiceError("temporarily-unavailable", "Uploads are temporarily unavailable.");
      const publicId = `inbcn/reporter/story/${profileId}/${input.storyId}/${objectId}`;
      try {
        return dependencies.provider.sign({
          publicId,
          mediaType: validated.data.mediaType,
          timestamp: Math.floor(now.getTime() / 1_000),
        });
      } catch {
        throw new UploadServiceError("temporarily-unavailable", "Uploads are temporarily unavailable.");
      }
    },

    async completeSignedUpload(profileId: string, input: unknown) {
      assertUuid(profileId);
      assertRecord(input);
      assertUuid(input.storyId);
      if ((input.mediaType !== "image" && input.mediaType !== "video")
        || typeof input.assetId !== "string" || !ASSET_ID.test(input.assetId)
        || typeof input.publicId !== "string"
        || input.publicId !== `inbcn/reporter/story/${profileId}/${input.storyId}/${input.publicId.split("/").at(-1) ?? ""}`
        || !OBJECT_UUID.test(input.publicId.split("/").at(-1) ?? "")
        || typeof input.timestamp !== "number" || !Number.isSafeInteger(input.timestamp) || input.timestamp <= 0
        || typeof input.signature !== "string" || !SIGNATURE.test(input.signature)) invalidUpload();
      const metadata = validateUploadMetadata({
        mediaType: input.mediaType,
        title: input.title,
        originalFilename: input.originalFilename,
        altText: input.altText,
      });
      if (!metadata.ok) invalidUpload();
      const { generation, now } = await currentAccess(profileId, input.storyId);
      if (!dependencies.provider.verify({
        publicId: input.publicId,
        mediaType: input.mediaType,
        timestamp: input.timestamp,
        signature: input.signature,
      })) invalidUpload();
      let providerAsset: unknown;
      try {
        providerAsset = await dependencies.provider.getAsset(input.assetId);
      } catch {
        throw new UploadServiceError("temporarily-unavailable", "The provider could not confirm the upload. Please try again.");
      }
      const verified = validateProviderAsset(providerAsset, {
        assetId: input.assetId,
        publicId: input.publicId,
        mediaType: input.mediaType,
        originalFilename: metadata.data.originalFilename,
        cloudName: dependencies.provider.getCloudName(),
        signedAt: input.timestamp,
      }, now.toISOString());
      if (!verified.ok) invalidUpload();
      try {
        return await dependencies.repository.complete({
          profileId,
          accessGeneration: generation,
          storyId: input.storyId,
          metadata: metadata.data,
          asset: verified.data,
        });
      } catch (error) {
        throw safeRepositoryError(error);
      }
    },
  } as const;
}

async function runtimeService() {
  const [{ uploadRepository }, provider] = await Promise.all([
    import("./upload.repository.ts"),
    import("./cloudinary-signature.server.ts"),
  ]);
  return createUploadService({ repository: uploadRepository, provider });
}

export async function requestSignedUpload(profileId: string, input: Parameters<ReturnType<typeof createUploadService>["requestSignedUpload"]>[1]) {
  return (await runtimeService()).requestSignedUpload(profileId, input);
}

export async function completeSignedUpload(profileId: string, input: Parameters<ReturnType<typeof createUploadService>["completeSignedUpload"]>[1]) {
  return (await runtimeService()).completeSignedUpload(profileId, input);
}
