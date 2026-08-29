import "server-only";

import { createAdminClient } from "../../lib/supabase/admin.ts";
import { applicantProfileInsert, type SignupProfile } from "./applicant-profile.model.ts";

export async function ensureApplicantProfile(userId: string, profile?: SignupProfile): Promise<void> {
  const admin = createAdminClient();
  const { data: existing, error: existingError } = await admin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return;

  if (profile) {
    const { data: language, error: languageError } = await admin
      .from("languages")
      .select("id")
      .eq("id", profile.preferredLanguageId)
      .eq("is_active", true)
      .maybeSingle();
    if (languageError) throw languageError;
    if (!language) throw new Error("invalid-preferred-language");
  }

  const { error } = await admin.from("profiles").upsert(
    applicantProfileInsert(userId, profile),
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) throw error;
}
