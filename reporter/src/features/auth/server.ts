import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  authorizeReporterIdentity,
  type ReporterAuthorizationFailure,
  type ReporterAuthorizationResult,
} from "./authorization.model";

type CurrentReporterResult =
  | ReporterAuthorizationResult
  | Readonly<{
      ok: false;
      reason: Extract<
        ReporterAuthorizationFailure,
        "access-generation-mismatch" | "access-sync-pending" | "forbidden" | "profile-inactive" | "profile-mismatch" | "profile-missing"
      > | "profile-unavailable" | "session-expired" | "unauthenticated";
    }>;

export async function authorizeCurrentReporter(): Promise<CurrentReporterResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error) {
    return {
      ok: false,
      reason: error.name === "AuthSessionMissingError" ? "unauthenticated" : "session-expired",
    };
  }

  const claims = data?.claims;
  if (!claims?.sub) {
    return { ok: false, reason: "unauthenticated" };
  }

  const role = typeof claims.app_metadata?.role === "string"
    ? claims.app_metadata.role
    : null;
  const accessGeneration = typeof claims.app_metadata?.reporter_access_generation === "number"
    && Number.isSafeInteger(claims.app_metadata.reporter_access_generation)
    ? claims.app_metadata.reporter_access_generation
    : null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", claims.sub)
    .maybeSingle();

  if (profileError) {
    return { ok: false, reason: "profile-unavailable" };
  }

  let accessSyncStatus: string | null = null;
  let accessSyncGeneration: number | null = null;
  if (profile?.role === "reporter" || role === "reporter") {
    const { data: reporter, error: reporterError } = await supabase
      .from("reporter_profiles")
      .select("access_sync_status, access_sync_generation")
      .eq("profile_id", claims.sub)
      .maybeSingle();
    if (reporterError) return { ok: false, reason: "profile-unavailable" };
    accessSyncStatus = reporter?.access_sync_status ?? null;
    accessSyncGeneration = reporter?.access_sync_generation ?? null;
  }

  return authorizeReporterIdentity(
    { id: claims.sub, role, accessGeneration },
    profile
      ? {
          id: profile.id,
          role: profile.role,
          isActive: profile.is_active,
          accessSyncStatus,
          accessSyncGeneration,
        }
      : null,
  );
}

export async function requireReporterSession() {
  const result = await authorizeCurrentReporter();
  if (!result.ok) {
    redirect("/login");
  }
  return result;
}
