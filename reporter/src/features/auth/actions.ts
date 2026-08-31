"use server";

import { redirect } from "next/navigation";

import { env } from "@/config/env";
import { createClient } from "@/lib/supabase/server";
import { validateSignupProfile } from "./applicant-profile.model";
import { ensureApplicantProfile } from "./applicant-profile.server";
import { otpProviderErrorMessage, validateIndianPhone } from "./authorization.model";
import { authorizeCurrentReporter } from "./server";
import { authDestination, parseAuthMode } from "./signup-intent.model";
import { validateTemporaryDemoOtp } from "./temporary-auth.model";
import { signInWithTemporaryOtp } from "./temporary-auth.server";

export type OtpState = Readonly<{
  status: "idle" | "error" | "verified";
  message?: string;
  verifiedPhone?: string;
  verifiedToken?: string;
  fieldErrors?: Readonly<Record<string, string[]>>;
}>;

function phoneFrom(formData: FormData): string | null {
  const phone = formData.get("phone");
  return validateIndianPhone(phone) ? phone : null;
}

async function redirectAfterAuthentication(mode: unknown): Promise<never> {
  const authorization = await authorizeCurrentReporter();
  if (!authorization.ok) {
    throw new Error("Authenticated Reporter profile is unavailable.");
  }
  redirect(authDestination(parseAuthMode(mode), authorization.state));
}

export async function temporarySignInAction(
  _previousState: OtpState,
  formData: FormData,
): Promise<OtpState> {
  const phone = phoneFrom(formData);
  const token = formData.get("token");

  if (!phone || typeof token !== "string" || !token.trim()) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: {
        ...(phone ? {} : { phone: ["Enter an Indian mobile number in +91 format."] }),
        ...(typeof token === "string" && token.trim()
          ? {}
          : { token: ["Enter the preview code."] }),
      },
    };
  }

  if (!env.server.demoMode) {
    return { status: "error", message: "Demo sign-in is unavailable." };
  }

  const mode = parseAuthMode(formData.get("mode"));
  if (mode === "create") {
    const verified = validateTemporaryDemoOtp(phone, token);
    if (!verified.ok) {
      return { status: "error", message: "The preview code is incorrect.", fieldErrors: { token: ["Enter the preview code 1234."] } };
    }
    return { status: "verified", verifiedPhone: phone, verifiedToken: token };
  }

  try {
    await signInWithTemporaryOtp(phone, token);
  } catch {
    return { status: "error", message: "We could not sign you in. Please try again." };
  }

  return redirectAfterAuthentication("signin");
}

export async function requestOtpAction(
  _previousState: OtpState,
  formData: FormData,
): Promise<OtpState> {
  const phone = phoneFrom(formData);
  const captchaToken = formData.get("captchaToken");

  if (!phone || typeof captchaToken !== "string" || !captchaToken.trim()) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: {
        ...(phone ? {} : { phone: ["Enter an Indian mobile number in +91 format."] }),
        ...(typeof captchaToken === "string" && captchaToken.trim()
          ? {}
          : { captchaToken: ["Complete CAPTCHA verification before continuing."] }),
      },
    };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: { captchaToken },
    });

    if (error) {
      return { status: "error", message: otpProviderErrorMessage(error) };
    }
  } catch (error) {
    return { status: "error", message: otpProviderErrorMessage(error) };
  }

  redirect(`/verify?phone=${encodeURIComponent(phone)}`);
}

export async function verifyOtpAction(
  _previousState: OtpState,
  formData: FormData,
): Promise<OtpState> {
  const phone = phoneFrom(formData);
  const token = formData.get("token");

  if (!phone || typeof token !== "string" || !token.trim()) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: {
        ...(phone ? {} : { phone: ["Request a new code for a valid Indian mobile number."] }),
        ...(typeof token === "string" && token.trim()
          ? {}
          : { token: ["Enter the code you received."] }),
      },
    };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });

    if (error) {
      return { status: "error", message: otpProviderErrorMessage(error) };
    }
  } catch (error) {
    return { status: "error", message: otpProviderErrorMessage(error) };
  }

  redirect("/dashboard");
}

export async function completeTemporarySignupAction(
  _previousState: OtpState,
  formData: FormData,
): Promise<OtpState> {
  if (!env.server.demoMode) {
    return { status: "error", message: "Demo account creation is unavailable." };
  }

  const profile = validateSignupProfile({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    cityLocality: formData.get("cityLocality"),
    state: formData.get("state"),
    preferredLanguageId: formData.get("preferredLanguageId"),
    experience: formData.get("experience"),
    introduction: formData.get("introduction"),
  });
  if (!profile.ok) {
    return { status: "error", message: "Check the highlighted fields and try again.", fieldErrors: profile.fieldErrors };
  }

  const phone = phoneFrom(formData);
  const token = formData.get("token");
  if (!validateTemporaryDemoOtp(phone, token).ok) {
    return { status: "error", message: "Verify your mobile number again." };
  }

  try {
    const userId = await signInWithTemporaryOtp(phone, token, { ensureProfile: false, signupProfile: profile.data });
    await ensureApplicantProfile(userId, profile.data);
  } catch {
    return { status: "error", message: "We could not create your account. Please try again." };
  }

  return redirectAfterAuthentication("create");
}

export async function logoutAction(): Promise<void> {
  const authorization = await authorizeCurrentReporter();
  if (!authorization.ok) redirect("/login");

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
