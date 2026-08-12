export const ADMIN_ROLES = ["writer", "editor", "admin"] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export type AdminIdentity = Readonly<{
  id: string;
  email: string | null;
  displayName: string;
  role: AdminRole;
  preferredLanguage: Readonly<{ code: string; name: string }> | null;
}>;

export type AdminAuthorizationFailure =
  | "unauthenticated"
  | "session-expired"
  | "profile-unavailable"
  | "forbidden"
  | "profile-missing"
  | "profile-inactive"
  | "profile-mismatch"
  | "role-mismatch";

type JwtIdentity = Readonly<{
  id: string;
  email: string | null;
  role: AdminRole | null;
}>;

type ProfileIntegrityRecord = Readonly<{
  id: string;
  displayName: string;
  role: string;
  isActive: boolean;
  preferredLanguage: Readonly<{ code: string; name: string }> | null;
}>;

export type AdminAuthorizationResult =
  | Readonly<{ ok: true; identity: AdminIdentity }>
  | Readonly<{ ok: false; reason: AdminAuthorizationFailure }>;

export function parseAdminRole(value: unknown): AdminRole | null {
  return typeof value === "string" &&
    ADMIN_ROLES.includes(value as AdminRole)
    ? (value as AdminRole)
    : null;
}

export function authorizeAdminIdentity(
  jwt: JwtIdentity,
  profile: ProfileIntegrityRecord | null,
): AdminAuthorizationResult {
  if (!jwt.role) {
    return { ok: false, reason: "forbidden" };
  }
  if (!profile) {
    return { ok: false, reason: "profile-missing" };
  }
  if (profile.id !== jwt.id) {
    return { ok: false, reason: "profile-mismatch" };
  }
  if (!profile.isActive) {
    return { ok: false, reason: "profile-inactive" };
  }
  if (profile.role !== jwt.role) {
    return { ok: false, reason: "role-mismatch" };
  }

  return {
    ok: true,
    identity: {
      id: jwt.id,
      email: jwt.email,
      displayName: profile.displayName,
      role: jwt.role,
      preferredLanguage: profile.preferredLanguage,
    },
  };
}
