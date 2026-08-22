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
        "forbidden" | "profile-inactive" | "profile-mismatch" | "profile-missing"
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

  if (role !== "reporter") {
    return authorizeReporterIdentity({ id: claims.sub, role }, null);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", claims.sub)
    .maybeSingle();

  if (profileError) {
    return { ok: false, reason: "profile-unavailable" };
  }

  return authorizeReporterIdentity(
    { id: claims.sub, role },
    profile
      ? { id: profile.id, role: profile.role, isActive: profile.is_active }
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
