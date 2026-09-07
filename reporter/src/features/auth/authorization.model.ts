export type ReporterAuthorizationFailure =
  | "access-generation-mismatch"
  | "access-sync-pending"
  | "forbidden"
  | "profile-inactive"
  | "profile-mismatch"
  | "profile-missing";

type ReporterJwtIdentity = Readonly<{
  id: string;
  role: string | null;
  accessGeneration: number | null;
}>;

type ReporterProfile = Readonly<{
  id: string;
  role: string;
  isActive: boolean;
  accessSyncStatus: string | null;
  accessSyncGeneration: number | null;
}>;

export type ReporterAuthorizationResult =
  | Readonly<{ ok: true; state: "applicant" | "reporter"; userId: string }>
  | Readonly<{ ok: false; reason: ReporterAuthorizationFailure }>;

export const INDIAN_MOBILE_E164 = /^\+91[6-9]\d{9}$/;

export function validateIndianPhone(value: unknown): value is string {
  return typeof value === "string" && INDIAN_MOBILE_E164.test(value);
}

export function normalizeIndianSignInPhone(value: unknown): string | null {
  return typeof value === "string" && /^[6-9]\d{9}$/.test(value)
    ? `+91${value}`
    : null;
}

export function normalizeIndianLocalMobile(value: unknown): string | null {
  return normalizeIndianSignInPhone(value);
}

export function otpProviderErrorMessage(_error: unknown): string {
  void _error;
  return "We could not send a code. Please try again.";
}

export function authorizeReporterIdentity(
  jwt: ReporterJwtIdentity,
  profile: ReporterProfile | null,
): ReporterAuthorizationResult {
  if (profile && profile.id !== jwt.id) {
    return { ok: false, reason: "profile-mismatch" };
  }
  if (profile && !profile.isActive) {
    return { ok: false, reason: "profile-inactive" };
  }
  if (profile?.role === "reporter") {
    if (profile.accessSyncStatus !== "succeeded") {
      return { ok: false, reason: "access-sync-pending" };
    }
    if (jwt.role !== "reporter") {
      return { ok: false, reason: "profile-mismatch" };
    }
    if (jwt.accessGeneration !== profile.accessSyncGeneration) {
      return { ok: false, reason: "access-generation-mismatch" };
    }
    return { ok: true, state: "reporter", userId: jwt.id };
  }
  if (jwt.role === null) {
    return { ok: true, state: "applicant", userId: jwt.id };
  }
  if (jwt.role !== "reporter") {
    return { ok: false, reason: "forbidden" };
  }
  if (!profile) {
    return { ok: false, reason: "profile-missing" };
  }
  if (profile.role !== jwt.role) {
    return { ok: false, reason: "profile-mismatch" };
  }
  return { ok: false, reason: "access-sync-pending" };
}
