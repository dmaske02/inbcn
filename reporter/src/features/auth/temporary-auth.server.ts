import "server-only";

import { randomBytes } from "node:crypto";

import { env } from "../../config/env.ts";
import { createAdminClient } from "../../lib/supabase/admin.ts";
import { createClient } from "../../lib/supabase/server.ts";
import { ensureApplicantProfile } from "./applicant-profile.server.ts";
import { createTemporaryAuthService, TemporaryAuthError } from "./temporary-auth.model.ts";
import type { SignupProfile } from "./applicant-profile.model.ts";

export async function signInWithTemporaryOtp(
  phone: unknown,
  code: unknown,
  options?: Readonly<{ ensureProfile?: boolean; signupProfile?: SignupProfile }>,
): Promise<string> {
  if (!env.server.temporaryOnboarding) throw new TemporaryAuthError("disabled");

  const admin = createAdminClient();
  const service = createTemporaryAuthService({
    // ponytail: preview-only linear Auth lookup; replace with provider OTP when temporary mode is removed.
    async findUser(expectedPhone) {
      for (let page = 1; ; page += 1) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        const match = data.users.find((user) => user.phone?.replace(/^\+/, "") === expectedPhone.replace(/^\+/, ""));
        if (match) return match.id;
        if (data.nextPage === null) return null;
      }
    },
    async createUser(input) {
      const { data, error } = await admin.auth.admin.createUser({
        email: input.email,
        email_confirm: true,
        phone: input.phone,
        phone_confirm: true,
        password: input.password,
        user_metadata: input.signupProfile ? { temporary_reporter_signup: input.signupProfile } : undefined,
      });
      if (error || !data.user) throw error ?? new Error("Temporary user creation failed.");
      return data.user.id;
    },
    async rotateCredentials(userId, input) {
      const { error } = await admin.auth.admin.updateUserById(userId, {
        email: input.email,
        email_confirm: true,
        password: input.password,
      });
      if (error) throw error;
    },
    ensureProfile: ensureApplicantProfile,
    async signIn(input) {
      const supabase = await createClient();
      const { error } = await supabase.auth.signInWithPassword(input);
      if (error) throw error;
    },
    randomPassword: () => randomBytes(32).toString("base64url"),
  });

  return service.signIn({ phone, code }, options);
}
