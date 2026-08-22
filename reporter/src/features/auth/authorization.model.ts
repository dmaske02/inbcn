export type ReporterAuthorizationFailure =
  | "forbidden"
  | "profile-inactive"
  | "profile-mismatch"
  | "profile-missing";

type ReporterJwtIdentity = Readonly<{
  id: string;
  role: string | null;
}>;

type ReporterProfile = Readonly<{
  id: string;
  role: string;
  isActive: boolean;
}>;

export type ReporterAuthorizationResult =
  | Readonly<{ ok: true; state: "applicant" | "reporter"; userId: string }>
  | Readonly<{ ok: false; reason: ReporterAuthorizationFailure }>;

export const INDIAN_MOBILE_E164 = /^\+91[6-9]\d{9}$/;

export function validateIndianPhone(value: unknown): value is string {
  return typeof value === "string" && INDIAN_MOBILE_E164.test(value);
}

export function otpProviderErrorMessage(_error: unknown): string {
  void _error;
  return "We could not send a code. Please try again.";
}

export function authorizeReporterIdentity(
  jwt: ReporterJwtIdentity,
  profile: ReporterProfile | null,
): ReporterAuthorizationResult {
  if (jwt.role === null) {
    return { ok: true, state: "applicant", userId: jwt.id };
  }
  if (jwt.role !== "reporter") {
    return { ok: false, reason: "forbidden" };
  }
  if (!profile) {
    return { ok: false, reason: "profile-missing" };
  }
  if (profile.id !== jwt.id || profile.role !== jwt.role) {
    return { ok: false, reason: "profile-mismatch" };
  }
  if (!profile.isActive) {
    return { ok: false, reason: "profile-inactive" };
  }

  return { ok: true, state: "reporter", userId: jwt.id };
}
