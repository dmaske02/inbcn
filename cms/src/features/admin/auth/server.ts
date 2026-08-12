import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  authorizeAdminIdentity,
  parseAdminRole,
  type AdminAuthorizationFailure,
  type AdminAuthorizationResult,
  type AdminIdentity,
} from "./authorization.model";

type CurrentAdminResult =
  | AdminAuthorizationResult
  | Readonly<{
      ok: false;
      reason: Extract<
        AdminAuthorizationFailure,
        "unauthenticated" | "session-expired" | "profile-unavailable"
      >;
    }>;

export async function authorizeCurrentAdmin(): Promise<CurrentAdminResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error) {
    if (error.name === "AuthSessionMissingError") {
      return { ok: false, reason: "unauthenticated" };
    }
    return { ok: false, reason: "session-expired" };
  }

  const claims = data?.claims;
  if (!claims?.sub) {
    return { ok: false, reason: "unauthenticated" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(
      "id, display_name, role, is_active, preferred_language:languages!profiles_preferred_language_id_fkey(code, name)",
    )
    .eq("id", claims.sub)
    .maybeSingle();

  if (profileError) {
    return { ok: false, reason: "profile-unavailable" };
  }

  const preferredLanguage = Array.isArray(profile?.preferred_language)
    ? (profile.preferred_language[0] ?? null)
    : (profile?.preferred_language ?? null);

  return authorizeAdminIdentity(
    {
      id: claims.sub,
      email: typeof claims.email === "string" ? claims.email : null,
      role: parseAdminRole(claims.app_metadata?.role),
    },
    profile
      ? {
          id: profile.id,
          displayName: profile.display_name,
          role: profile.role,
          isActive: profile.is_active,
          preferredLanguage,
        }
      : null,
  );
}

export const getAdminAuthorization = cache(authorizeCurrentAdmin);

function redirectForFailure(reason: AdminAuthorizationFailure): never {
  switch (reason) {
    case "unauthenticated":
      redirect("/admin/login");
    case "session-expired":
      redirect("/admin/session-expired");
    case "profile-inactive":
      redirect("/admin/profile-inactive");
    case "role-mismatch":
    case "profile-mismatch":
      redirect("/admin/role-mismatch");
    case "profile-unavailable":
      redirect("/admin/unauthorized");
    case "profile-missing":
    case "forbidden":
      redirect("/admin/forbidden");
  }
}

export async function requireAdminUser(): Promise<AdminIdentity> {
  const result = await getAdminAuthorization();

  if (!result.ok) {
    redirectForFailure(result.reason);
  }

  return result.identity;
}
