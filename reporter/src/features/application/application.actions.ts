"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { authorizeCurrentReporter } from "../auth/server";
import { validateReporterApplication } from "./application.model";
import { getCurrentApplication, insertConsentReceipts } from "./application.repository";
import {
  CONSENT_NOTICE_KEYS,
  createConsentReceipts,
  type ConsentLocale,
} from "./consent.model";
import { saveApplicationDraft } from "./application.service";
import { ProfilePhotoError } from "./profile-photo.service";

export type ApplicationActionState = Readonly<{
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Readonly<Record<string, string[]>>;
}>;

function indiaCalendarDate(now: Date): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export async function saveApplicationAction(
  _previousState: ApplicationActionState,
  formData: FormData,
): Promise<ApplicationActionState> {
  const actor = await authorizeCurrentReporter();
  if (!actor.ok) return { status: "error", message: "Sign in again to continue." };
  if (actor.state !== "applicant") {
    return { status: "error", message: "This account cannot create another reporter application." };
  }

  const validation = validateReporterApplication({
    legalName: formData.get("legalName"),
    legalNameDeclared: formData.get("legalNameDeclared") === "on",
    dateOfBirth: formData.get("dateOfBirth"),
    age18Declared: formData.get("age18Declared") === "on",
    homeCity: formData.get("homeCity"),
    homeDistrict: formData.get("homeDistrict"),
    homeState: formData.get("homeState"),
    bio: formData.get("bio"),
    beats: formData.getAll("beats"),
  }, indiaCalendarDate(new Date()));
  if (!validation.ok) {
    return {
      status: "error",
      message: "Check the highlighted application fields.",
      fieldErrors: validation.fieldErrors,
    };
  }

  const portrait = formData.get("publicPortrait");
  if (!(portrait instanceof File) || portrait.size === 0
    || formData.get("portraitDeclaration") !== "on") {
    return {
      status: "error",
      message: "Upload a separate public portrait and confirm that it is not an identity-document image.",
    };
  }
  const localeValue = formData.get("consentLocale");
  if (localeValue !== "en" && localeValue !== "hi" && localeValue !== "mr") {
    return { status: "error", message: "Choose a supported consent language." };
  }

  try {
    const receipts = createConsentReceipts({
      locale: localeValue as ConsentLocale,
      acceptedKeys: CONSENT_NOTICE_KEYS.filter((key) => formData.get(`consent:${key}`) === "on"),
    }, new Date().toISOString());
    await saveApplicationDraft({
      profileId: actor.userId,
      fields: validation.data,
      receipts,
      portrait,
    });
    revalidatePath("/application");
    return { status: "success", message: "Application details and consent receipts saved." };
  } catch (error) {
    if (error instanceof ProfilePhotoError || error instanceof TypeError) {
      return { status: "error", message: error.message };
    }
    return { status: "error", message: "The application could not be saved. Please try again." };
  }
}

export async function completeConsentReceiptsAction(
  applicationId: string,
  _previousState: ApplicationActionState,
  formData: FormData,
): Promise<ApplicationActionState> {
  const actor = await authorizeCurrentReporter();
  if (!actor.ok) return { status: "error", message: "Sign in again to continue." };
  if (actor.state !== "applicant" || !z.uuid().safeParse(applicationId).success) {
    return { status: "error", message: "This application cannot be updated." };
  }
  const application = await getCurrentApplication(actor.userId);
  if (!application || application.id !== applicationId || application.status !== "draft") {
    return { status: "error", message: "This application cannot be updated." };
  }
  const locale = formData.get("consentLocale");
  if (locale !== "en" && locale !== "hi" && locale !== "mr") {
    return { status: "error", message: "Choose a supported consent language." };
  }
  try {
    const receipts = createConsentReceipts({
      locale,
      acceptedKeys: CONSENT_NOTICE_KEYS.filter((key) => formData.get(`consent:${key}`) === "on"),
    }, new Date().toISOString());
    await insertConsentReceipts(applicationId, actor.userId, receipts);
    revalidatePath("/application");
    return { status: "success", message: "All current consent receipts are stored." };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof TypeError
        ? error.message
        : "Consent receipts could not be saved. Please try again.",
    };
  }
}
