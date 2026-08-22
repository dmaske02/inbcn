import "server-only";

import type { ReporterApplicationStatus } from "@inbcn/domain";

import { createAdminClient } from "../../lib/supabase/admin.ts";
import { createClient } from "../../lib/supabase/server.ts";
import type { ReporterApplicationFields } from "./application.model.ts";
import {
  hasCurrentConsentReceipts,
  missingConsentReceipts,
  type ConsentLocale,
  type ConsentNoticeKey,
  type ConsentReceipt,
} from "./consent.model.ts";

const applicationSelect = "id, profile_id, status, kyc_status, completion_deadline, public_photo_url, public_photo_verified_at, created_at" as const;

export type ReporterApplicationView = Readonly<{
  id: string;
  status: ReporterApplicationStatus;
  kycStatus: string;
  completionDeadline: string | null;
  publicPhotoUrl: string;
  publicPhotoVerifiedAt: string | null;
  consentsComplete: boolean;
  createdAt: string;
}>;

export class ApplicationRepositoryError extends Error {
  constructor(message = "The application could not be saved.") {
    super(message);
    this.name = "ApplicationRepositoryError";
  }
}

function applicationView(row: {
  id: string;
  status: string;
  kyc_status: string;
  completion_deadline: string | null;
  public_photo_url: string;
  public_photo_verified_at: string | null;
  created_at: string;
}, consentsComplete: boolean): ReporterApplicationView {
  return {
    id: row.id,
    status: row.status as ReporterApplicationStatus,
    kycStatus: row.kyc_status,
    completionDeadline: row.completion_deadline,
    publicPhotoUrl: row.public_photo_url,
    publicPhotoVerifiedAt: row.public_photo_verified_at,
    consentsComplete,
    createdAt: row.created_at,
  };
}

export async function getCurrentApplication(profileId: string): Promise<ReporterApplicationView | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reporter_applications")
    .select(applicationSelect)
    .eq("profile_id", profileId)
    .in("status", ["draft", "payment_pending", "kyc_pending", "under_review"])
    .maybeSingle();
  if (error) throw new ApplicationRepositoryError("The application could not be loaded.");
  if (!data) return null;
  const { data: consentRows, error: consentError } = await supabase
    .from("reporter_consents")
    .select("notice_key, notice_version, locale, consented_at, withdrawn_at")
    .eq("application_id", data.id)
    .eq("profile_id", profileId);
  if (consentError) throw new ApplicationRepositoryError("Consent receipts could not be loaded.");
  const consentsComplete = hasCurrentConsentReceipts(consentRows.map((row) => ({
    key: row.notice_key as ConsentNoticeKey,
    version: row.notice_version,
    locale: row.locale as ConsentLocale,
    consentedAt: row.consented_at,
    withdrawnAt: row.withdrawn_at,
  })));
  return applicationView(data, consentsComplete);
}

export async function isApplicationReadyForPayment(profileId: string, applicationId: string): Promise<boolean> {
  const application = await getCurrentApplication(profileId);
  return application?.id === applicationId
    && application.status === "draft"
    && application.consentsComplete;
}

export async function insertApplicationDraft(input: Readonly<{
  profileId: string;
  fields: ReporterApplicationFields;
  publicPhotoId: string;
  publicPhotoUrl: string;
}>): Promise<ReporterApplicationView> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reporter_applications")
    .insert({
      profile_id: input.profileId,
      legal_name: input.fields.legalName,
      date_of_birth: input.fields.dateOfBirth,
      age_18_declared: input.fields.age18Declared,
      home_city: input.fields.homeCity,
      home_district: input.fields.homeDistrict,
      home_state: input.fields.homeState,
      bio: input.fields.bio || null,
      beats: [...input.fields.beats],
      public_photo_id: input.publicPhotoId,
      public_photo_url: input.publicPhotoUrl,
    })
    .select(applicationSelect)
    .single();
  if (error || !data) throw new ApplicationRepositoryError();
  return applicationView(data, false);
}

export async function insertConsentReceipts(
  applicationId: string,
  profileId: string,
  receipts: readonly ConsentReceipt[],
): Promise<void> {
  const supabase = await createClient();
  const { data: existingRows, error: existingError } = await supabase
    .from("reporter_consents")
    .select("notice_key, notice_version, locale, consented_at, withdrawn_at")
    .eq("application_id", applicationId)
    .eq("profile_id", profileId);
  if (existingError) throw new ApplicationRepositoryError("Consent receipts could not be loaded.");
  const missing = missingConsentReceipts(receipts, existingRows.map((row) => ({
    key: row.notice_key as ConsentNoticeKey,
    version: row.notice_version,
    locale: row.locale as ConsentLocale,
    consentedAt: row.consented_at,
    withdrawnAt: row.withdrawn_at,
  })));
  if (missing.length === 0) return;
  const { error } = await supabase.from("reporter_consents").insert(missing.map((receipt) => ({
    application_id: applicationId,
    profile_id: profileId,
    notice_key: receipt.key,
    notice_version: receipt.version,
    locale: receipt.locale,
    // PostgreSQL's default now() is the authoritative persisted receipt time.
  })));
  if (error) throw new ApplicationRepositoryError("Consent receipts could not be saved.");
}

async function findOwnedApplication(profileId: string, applicationId: string) {
  const { data, error } = await createAdminClient()
    .from("reporter_applications")
    .select("id, profile_id, status, kyc_status")
    .eq("id", applicationId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw new ApplicationRepositoryError("The application could not be loaded.");
  return data ? {
    id: data.id,
    profileId: data.profile_id,
    status: data.status,
    kycStatus: data.kyc_status,
  } : null;
}

async function markKycStarted(input: Readonly<{
  applicationId: string;
  profileId: string;
  provider: string;
  reference: string;
  startedAt: string;
}>): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("reporter_applications")
    .update({
      kyc_provider: input.provider,
      kyc_reference: input.reference,
      kyc_status: "pending",
      kyc_started_at: input.startedAt,
      kyc_completed_at: null,
      verified_legal_name: null,
      verified_adult: null,
      updated_at: input.startedAt,
    })
    .eq("id", input.applicationId)
    .eq("profile_id", input.profileId)
    .eq("status", "kyc_pending")
    .in("kyc_status", ["not_started", "pending", "failed"])
    .select("id")
    .maybeSingle();
  if (error) throw new ApplicationRepositoryError("Identity verification could not be started.");
  return data !== null;
}

async function claimKycWebhook(input: Readonly<{
  eventId: string;
  eventType: string;
  signatureVerifiedAt: string;
}>): Promise<"claimed" | "processed" | "retry"> {
  const admin = createAdminClient();
  const { error } = await admin.from("webhook_events").insert({
    provider: "kyc",
    provider_event_id: input.eventId,
    event_type: input.eventType,
    signature_verified_at: input.signatureVerifiedAt,
    processing_status: "pending",
    attempt_count: 1,
  });
  if (!error) return "claimed";
  if (error.code !== "23505") throw new ApplicationRepositoryError("The webhook receipt could not be recorded.");
  const { data, error: lookupError } = await admin
    .from("webhook_events")
    .select("processing_status")
    .eq("provider", "kyc")
    .eq("provider_event_id", input.eventId)
    .single();
  if (lookupError) throw new ApplicationRepositoryError("The webhook receipt could not be loaded.");
  return data.processing_status === "failed" ? "retry" : "processed";
}

async function findApplicationByKycReference(provider: string, reference: string) {
  const { data, error } = await createAdminClient()
    .from("reporter_applications")
    .select("id, profile_id, status, kyc_status")
    .eq("kyc_provider", provider)
    .eq("kyc_reference", reference)
    .maybeSingle();
  if (error) throw new ApplicationRepositoryError("The KYC application could not be loaded.");
  return data ? {
    id: data.id,
    profileId: data.profile_id,
    status: data.status,
    kycStatus: data.kyc_status,
  } : null;
}

async function applyKycResult(input: Readonly<{
  applicationId: string;
  provider: string;
  reference: string;
  applicationStatus: "kyc_pending" | "under_review";
  kycStatus: "failed" | "verified";
  legalName: string | null;
  adult: boolean | null;
  completedAt: string;
  processedAt: string;
}>): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("reporter_applications")
    .update({
      status: input.applicationStatus,
      kyc_status: input.kycStatus,
      kyc_completed_at: input.completedAt,
      verified_legal_name: input.legalName,
      verified_adult: input.adult,
      submitted_at: input.applicationStatus === "under_review" ? input.processedAt : null,
      updated_at: input.processedAt,
    })
    .eq("id", input.applicationId)
    .eq("status", "kyc_pending")
    .eq("kyc_provider", input.provider)
    .eq("kyc_reference", input.reference)
    .in("kyc_status", ["pending", "failed"])
    .select("id")
    .maybeSingle();
  if (error) throw new ApplicationRepositoryError("The KYC result could not be saved.");
  return data !== null;
}

async function completeKycWebhook(input: Readonly<{
  eventId: string;
  applicationId: string | null;
  processedAt: string;
}>): Promise<void> {
  const { error } = await createAdminClient()
    .from("webhook_events")
    .update({
      processing_status: "processed",
      subject_type: input.applicationId ? "reporter_application" : null,
      subject_id: input.applicationId,
      failure_detail: null,
      processed_at: input.processedAt,
      updated_at: input.processedAt,
    })
    .eq("provider", "kyc")
    .eq("provider_event_id", input.eventId);
  if (error) throw new ApplicationRepositoryError("The webhook receipt could not be completed.");
}

async function failKycWebhook(input: Readonly<{ eventId: string; failureDetail: string }>): Promise<void> {
  const { error } = await createAdminClient()
    .from("webhook_events")
    .update({ processing_status: "failed", failure_detail: input.failureDetail, updated_at: new Date().toISOString() })
    .eq("provider", "kyc")
    .eq("provider_event_id", input.eventId);
  if (error) throw new ApplicationRepositoryError("The webhook failure could not be recorded.");
}

export const applicationRepository = {
  findOwnedApplication,
  markKycStarted,
  claimKycWebhook,
  findApplicationByKycReference,
  applyKycResult,
  completeKycWebhook,
  failKycWebhook,
} as const;
