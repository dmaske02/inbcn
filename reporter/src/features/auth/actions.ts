"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { otpProviderErrorMessage, validateIndianPhone } from "./authorization.model";

export type OtpState = Readonly<{
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Readonly<{ phone?: string[]; token?: string[]; captchaToken?: string[] }>;
}>;

function phoneFrom(formData: FormData): string | null {
  const phone = formData.get("phone");
  return validateIndianPhone(phone) ? phone : null;
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
