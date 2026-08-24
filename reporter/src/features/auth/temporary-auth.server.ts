import "server-only";

import { randomBytes } from "node:crypto";

import { env } from "../../config/env.ts";
import { createAdminClient } from "../../lib/supabase/admin.ts";
import { createClient } from "../../lib/supabase/server.ts";
import { createTemporaryAuthService, TemporaryAuthError } from "./temporary-auth.model.ts";

export async function signInWithTemporaryOtp(phone: unknown, code: unknown): Promise<void> {
  if (!env.server.temporaryOnboarding) throw new TemporaryAuthError("disabled");

  const admin = createAdminClient();
  const service = createTemporaryAuthService({
    // ponytail: preview-only linear Auth lookup; replace with provider OTP when temporary mode is removed.
    async findUser(expectedPhone) {
      for (let page = 1; ; page += 1) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        const match = data.users.find((user) => user.phone === expectedPhone);
        if (match) return match.id;
        if (data.nextPage === null) return null;
      }
    },
    async createUser(input) {
      const { data, error } = await admin.auth.admin.createUser({
        phone: input.phone,
        phone_confirm: true,
        password: input.password,
      });
      if (error || !data.user) throw error ?? new Error("Temporary user creation failed.");
      return data.user.id;
    },
    async rotatePassword(userId, password) {
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) throw error;
    },
    async ensureProfile(userId) {
      const { error } = await admin.from("profiles").upsert({
        id: userId,
        username: `reporter_${userId.replaceAll("-", "").slice(0, 16)}`,
        display_name: "Reporter applicant",
        role: "reader",
      }, { onConflict: "id", ignoreDuplicates: true });
      if (error) throw error;
    },
    async signIn(input) {
      const supabase = await createClient();
      const { error } = await supabase.auth.signInWithPassword(input);
      if (error) throw error;
    },
    randomPassword: () => randomBytes(32).toString("base64url"),
  });

  await service.signIn({ phone, code });
}
