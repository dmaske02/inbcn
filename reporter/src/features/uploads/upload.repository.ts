import "server-only";

import { createAdminClient } from "../../lib/supabase/admin.ts";
import { createClient } from "../../lib/supabase/server.ts";
import type { CanonicalUploadCompletion, UploadAccess } from "./upload.service.ts";

class UploadRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadRepositoryError";
  }
}

function failure(error: unknown): never {
  const message = typeof error === "object" && error !== null && "message" in error
    ? String(error.message)
    : "REPORTER_MEDIA_REPOSITORY_UNAVAILABLE";
  throw new UploadRepositoryError(message);
}

async function getAccess(profileId: string, storyId: string): Promise<UploadAccess | null> {
  const userClient = await createClient();
  const claimsResult = await userClient.auth.getClaims();
  if (claimsResult.error || !claimsResult.data?.claims?.sub) return null;
  const claims = claimsResult.data.claims;
  const admin = createAdminClient();
  const [profileResult, reporterResult, storyResult] = await Promise.all([
    admin.from("profiles").select("id, role, is_active").eq("id", profileId).maybeSingle(),
    admin.from("reporter_profiles")
      .select("profile_id, public_status, membership_started_at, membership_expires_at, membership_grace_ends_at, access_sync_status, access_sync_desired_role, access_sync_generation")
      .eq("profile_id", profileId)
      .maybeSingle(),
    admin.from("stories")
      .select("id, created_by, is_reporter_story, status, source_id")
      .eq("id", storyId)
      .maybeSingle(),
  ]);
  if (profileResult.error) failure(profileResult.error);
  if (reporterResult.error) failure(reporterResult.error);
  if (storyResult.error) failure(storyResult.error);
  const profile = profileResult.data;
  const reporter = reporterResult.data;
  const story = storyResult.data;
  const generation = claims.app_metadata?.reporter_access_generation;
  return {
    jwtUserId: claims.sub,
    jwtRole: typeof claims.app_metadata?.role === "string" ? claims.app_metadata.role : null,
    jwtAccessGeneration: typeof generation === "number" && Number.isSafeInteger(generation) ? generation : null,
    profileId: profile?.id ?? null,
    profileRole: profile?.role ?? null,
    profileActive: profile?.is_active ?? false,
    reporterProfileId: reporter?.profile_id ?? null,
    accessSyncStatus: reporter?.access_sync_status ?? null,
    accessSyncDesiredRole: reporter?.access_sync_desired_role ?? null,
    accessSyncGeneration: reporter?.access_sync_generation ?? null,
    publicStatus: reporter?.public_status ?? null,
    membershipStartedAt: reporter?.membership_started_at ?? null,
    membershipExpiresAt: reporter?.membership_expires_at ?? null,
    membershipGraceEndsAt: reporter?.membership_grace_ends_at ?? null,
    storyId: story?.id ?? null,
    storyCreatedBy: story?.created_by ?? null,
    isReporterStory: story?.is_reporter_story ?? false,
    storyStatus: story?.status ?? null,
    storySourceId: story?.source_id ?? null,
  };
}

async function complete(input: CanonicalUploadCompletion): Promise<Readonly<{ id: string }>> {
  const { data, error } = await createAdminClient().rpc("complete_reporter_media_upload", {
    p_profile_id: input.profileId,
    p_access_generation: input.accessGeneration,
    p_story_id: input.storyId,
    p_asset_id: input.asset.assetId,
    p_media_type: input.asset.mediaType,
    p_public_id: input.asset.publicId,
    p_secure_url: input.asset.secureUrl,
    p_resource_format: input.asset.format,
    p_mime_type: input.asset.mimeType,
    p_title: input.metadata.title,
    p_original_filename: input.metadata.originalFilename,
    p_alt_text: input.metadata.altText,
    p_width: input.asset.width,
    p_height: input.asset.height,
    p_duration_seconds: input.asset.durationSeconds,
    p_bytes: input.asset.bytes,
    p_provider_created_at: input.asset.createdAt,
  });
  if (error) failure(error);
  if (typeof data !== "string") failure("REPORTER_MEDIA_RESPONSE_INVALID");
  return { id: data };
}

export const uploadRepository = { getAccess, complete } as const;
