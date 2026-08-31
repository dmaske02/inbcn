import { validateIndianPhone } from "./authorization.model.ts";
import type { SignupProfile } from "./applicant-profile.model.ts";

type TemporaryAuthDependencies = Readonly<{
  findUser: (phone: string) => Promise<Readonly<{
    id: string;
    marked: boolean;
    eligible: boolean;
  }> | null>;
  createUser: (input: Readonly<{ phone: string; email: string; password: string; signupProfile?: SignupProfile }>) => Promise<string>;
  rotateCredentials: (userId: string, input: Readonly<{ email: string; password: string }>) => Promise<void>;
  ensureProfile: (userId: string) => Promise<void>;
  signIn: (input: Readonly<{ email: string; password: string }>) => Promise<void>;
  randomPassword: () => string;
}>;

export const REPORTER_DEMO_PHONE = "+919000000829";

export class TemporaryAuthError extends Error {
  readonly code: "disabled" | "invalid-credentials" | "unavailable";

  constructor(code: "disabled" | "invalid-credentials" | "unavailable") {
    super(code);
    this.code = code;
  }
}

export function validateTemporaryDemoOtp(phone: unknown, code: unknown):
  | Readonly<{ ok: true; phone: string }>
  | Readonly<{ ok: false }> {
  return validateIndianPhone(phone) && phone === REPORTER_DEMO_PHONE && code === "1234"
    ? { ok: true, phone }
    : { ok: false };
}

export function isTemporaryDemoIdentityEligible(input: Readonly<{
  authRole: string | null;
  profile: Readonly<{ role: string; isActive: boolean }> | null;
  reporter: Readonly<{ publicStatus: string; accessSyncStatus: string }> | null;
}>): boolean {
  const applicantEligible = input.reporter === null
    && (input.authRole === null || input.authRole === "reader")
    && (input.profile === null || (input.profile.role === "reader" && input.profile.isActive));
  const reporterEligible = input.reporter !== null
    && input.authRole === "reporter"
    && input.profile?.role === "reporter"
    && input.profile.isActive
    && input.reporter.publicStatus === "active"
    && input.reporter.accessSyncStatus === "succeeded";

  return applicantEligible || reporterEligible;
}

export function createTemporaryAuthService(dependencies: TemporaryAuthDependencies) {
  return {
    async signIn(
      input: Readonly<{ phone: unknown; code: unknown }>,
      options: Readonly<{ ensureProfile?: boolean; signupProfile?: SignupProfile }> = {},
    ): Promise<string> {
      const verified = validateTemporaryDemoOtp(input.phone, input.code);
      if (!verified.ok) {
        throw new TemporaryAuthError("invalid-credentials");
      }

      const password = dependencies.randomPassword();
      const email = `reporter.${verified.phone.replace(/\D/g, "")}@preview.inbcn.invalid`;
      try {
        const existingUser = await dependencies.findUser(verified.phone);
        if (existingUser && (!existingUser.marked || !existingUser.eligible)) {
          throw new TemporaryAuthError("invalid-credentials");
        }
        const userId = existingUser?.id
          ?? await dependencies.createUser({ phone: verified.phone, email, password, signupProfile: options.signupProfile });
        if (existingUser) await dependencies.rotateCredentials(userId, { email, password });
        if (options.ensureProfile !== false) await dependencies.ensureProfile(userId);
        await dependencies.signIn({ email, password });
        return userId;
      } catch (error) {
        if (error instanceof TemporaryAuthError) throw error;
        throw new TemporaryAuthError("unavailable");
      }
    },
  };
}
