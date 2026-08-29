import { z } from "zod";

const signupProfileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(120, "Keep your name within 120 characters."),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  cityLocality: z.string().trim().min(2, "Enter your city or locality.").max(120, "Keep your city or locality within 120 characters."),
  state: z.string().trim().min(2, "Enter your state.").max(100, "Keep your state within 100 characters."),
  preferredLanguageId: z.uuid("Choose a preferred language."),
  experience: z.string().trim().max(500, "Keep your experience within 500 characters.").default(""),
  introduction: z.string().trim().min(20, "Tell us in at least 20 characters why you want to join.").max(500, "Keep your introduction within 500 characters."),
});

export type SignupProfile = z.infer<typeof signupProfileSchema>;

export function validateSignupProfile(input: unknown):
  | Readonly<{ ok: true; data: SignupProfile }>
  | Readonly<{ ok: false; fieldErrors: Readonly<Record<string, string[]>> }> {
  const parsed = signupProfileSchema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, fieldErrors: z.flattenError(parsed.error).fieldErrors };
}

export function applicantProfileInsert(userId: unknown, profile?: SignupProfile) {
  const parsed = z.uuid().safeParse(userId);
  if (!parsed.success) throw new Error("invalid-user-id");

  return {
    id: parsed.data,
    username: `reporter_${parsed.data.replaceAll("-", "").slice(0, 16)}`,
    display_name: profile?.fullName ?? "Reporter applicant",
    ...(profile ? { preferred_language_id: profile.preferredLanguageId } : {}),
    ...(profile ? { bio: profile.introduction } : {}),
    role: "reader" as const,
  };
}
