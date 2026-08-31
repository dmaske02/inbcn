import "server-only";

import type { ReporterApplicationStatus } from "@inbcn/domain";

import { createAdminClient } from "../../lib/supabase/admin.ts";
import { createClient } from "../../lib/supabase/server.ts";
import type { ReporterApplicationFields } from "./application.model.ts";
import {
  hasCurrentConsentReceipts,
  type ConsentLocale,
  type ConsentNoticeKey,
  type ConsentReceipt,
} from "./consent.model.ts";
import {
  CONSENT_RECEIPT_UPSERT_OPTIONS,
  createConsentReceiptPersistence,
} from "./consent.persistence.ts";

const applicationSelect = "id, profile_id, status, kyc_status, completion_deadline, public_photo_url, public_photo_verified_at, created_at" as const;
const POSTGRES_ERROR_CODE = /^[0-9A-Z]{5}$/iu;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

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
  readonly definite: boolean;

  constructor(message = "The application could not be saved.", definite = false) {
    super(message);
    this.name = "ApplicationRepositoryError";
    this.definite = definite;
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
  applicationId: string;
  profileId: string;
  fields: ReporterApplicationFields;
  publicPhotoId: string;
  publicPhotoUrl: string;
}>): Promise<ReporterApplicationView> {
  let result;
  try {
    result = await createAdminClient()
      .from("reporter_applications")
      .insert({
        id: input.applicationId,
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
  } catch {
    throw new ApplicationRepositoryError();
  }
  const { data, error } = result;
  if (error) {
    // SQLSTATE proves that PostgreSQL rejected the transaction. PostgREST or
    // transport errors remain ambiguous and must be reconciled before cleanup.
    throw new ApplicationRepositoryError(undefined, POSTGRES_ERROR_CODE.test(error.code));
  }
  if (!data) throw new ApplicationRepositoryError();
  return applicationView(data, false);
}

export async function recoverApplicationDraft(input: Readonly<{
  applicationId: string;
  profileId: string;
  publicPhotoId: string;
}>): Promise<ReporterApplicationView | null> {
  const { data, error } = await createAdminClient()
    .from("reporter_applications")
    .select(applicationSelect)
    .eq("id", input.applicationId)
    .eq("profile_id", input.profileId)
    .eq("public_photo_id", input.publicPhotoId)
    .maybeSingle();
  if (error) throw new ApplicationRepositoryError("The application could not be recovered.");
  return data ? applicationView(data, false) : null;
}

export async function isProfilePhotoReferenced(publicPhotoId: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("reporter_applications")
    .select("id")
    .eq("public_photo_id", publicPhotoId)
    .limit(1)
    .maybeSingle();
  if (error) throw new ApplicationRepositoryError("Portrait ownership could not be reconciled.");
  return data !== null;
}

export async function insertConsentReceipts(
  applicationId: string,
  profileId: string,
  receipts: readonly ConsentReceipt[],
): Promise<void> {
  const supabase = createAdminClient();
  const persist = createConsentReceiptPersistence({
    upsert: async (rows) => {
      const { error } = await supabase.from("reporter_consents").upsert(rows.map((row) => ({
        application_id: row.applicationId,
        profile_id: row.profileId,
        notice_key: row.key,
        notice_version: row.version,
        locale: row.locale,
        // PostgreSQL's default now() is the authoritative persisted receipt time.
      })), CONSENT_RECEIPT_UPSERT_OPTIONS);
      if (error) throw new ApplicationRepositoryError("Consent receipts could not be saved.");
    },
    read: async (ownedApplicationId, ownedProfileId) => {
      const { data, error } = await supabase
        .from("reporter_consents")
        .select("notice_key, notice_version, locale, consented_at, withdrawn_at")
        .eq("application_id", ownedApplicationId)
        .eq("profile_id", ownedProfileId);
      if (error) throw new ApplicationRepositoryError("Consent receipts could not be loaded.");
      return data.map((row) => ({
        key: row.notice_key as ConsentNoticeKey,
        version: row.notice_version,
        locale: row.locale as ConsentLocale,
        consentedAt: row.consented_at,
        withdrawnAt: row.withdrawn_at,
      }));
    },
  });
  try {
    await persist(applicationId, profileId, receipts);
  } catch (error) {
    if (error instanceof ApplicationRepositoryError) throw error;
    throw new ApplicationRepositoryError("Consent receipts could not be saved.");
  }
}

async function reserveKycStart(input: Readonly<{
  applicationId: string;
  profileId: string;
}>): Promise<string | null> {
  const { data, error } = await createAdminClient().rpc("reserve_reporter_kyc_start", {
    p_application_id: input.applicationId,
    p_profile_id: input.profileId,
  });
  if (error) throw new ApplicationRepositoryError("Identity verification could not be reserved.");
  return data;
}

async function completeKycStart(input: Readonly<{
  applicationId: string;
  profileId: string;
  reservationToken: string;
  provider: string;
  reference: string;
}>): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("complete_reporter_kyc_start", {
    p_application_id: input.applicationId,
    p_profile_id: input.profileId,
    p_reservation_token: input.reservationToken,
    p_provider: input.provider,
    p_reference: input.reference,
  });
  if (error) throw new ApplicationRepositoryError("Identity verification could not be started.");
  return data;
}

async function releaseKycStart(input: Readonly<{
  applicationId: string;
  profileId: string;
  reservationToken: string;
}>): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("release_reporter_kyc_start", {
    p_application_id: input.applicationId,
    p_profile_id: input.profileId,
    p_reservation_token: input.reservationToken,
  });
  if (error) throw new ApplicationRepositoryError("Identity verification reservation could not be released.");
  return data;
}

async function claimKycWebhook(input: Readonly<{
  eventId: string;
  eventType: string;
}>): Promise<
  | Readonly<{ state: "claimed"; token: string }>
  | Readonly<{ state: "busy" }>
  | Readonly<{ state: "processed" }>
> {
  const { data, error } = await createAdminClient().rpc("claim_kyc_webhook_event", {
    p_event_id: input.eventId,
    p_event_type: input.eventType,
  });
  if (error) throw new ApplicationRepositoryError("The webhook receipt could not be claimed.");
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new ApplicationRepositoryError("The webhook claim was invalid.");
  }
  if (data.state === "claimed" && typeof data.token === "string") {
    return { state: "claimed", token: data.token };
  }
  if (data.state === "busy" || data.state === "processed") return { state: data.state };
  throw new ApplicationRepositoryError("The webhook claim was invalid.");
}

async function completeKycWebhook(input: Readonly<{
  eventId: string;
  processingToken: string;
  provider: string;
  reference: string;
  verified: boolean;
  legalName: string | null;
  adult: boolean | null;
  verifiedAt: string;
}>): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("complete_kyc_webhook_event", {
    p_event_id: input.eventId,
    p_processing_token: input.processingToken,
    p_provider: input.provider,
    p_reference: input.reference,
    p_verified: input.verified,
    p_legal_name: input.legalName,
    p_adult: input.adult,
    p_verified_at: input.verifiedAt,
  });
  if (error) throw new ApplicationRepositoryError("The webhook receipt could not be completed.");
  return data;
}

async function failKycWebhook(input: Readonly<{
  eventId: string;
  processingToken: string;
  failureDetail: string;
}>): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("fail_kyc_webhook_event", {
    p_event_id: input.eventId,
    p_processing_token: input.processingToken,
    p_failure_detail: input.failureDetail,
  });
  if (error) throw new ApplicationRepositoryError("The webhook failure could not be recorded.");
  return data;
}

function resultRecord(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new ApplicationRepositoryError("The temporary onboarding response was invalid.");
  }
  return data as Record<string, unknown>;
}

function generationFrom(data: Record<string, unknown>): number {
  if (typeof data.generation !== "number"
    || !Number.isSafeInteger(data.generation)
    || data.generation < 1) {
    throw new ApplicationRepositoryError("The temporary onboarding response was invalid.");
  }
  return data.generation;
}

export async function completeTemporaryPayment(
  profileId: string,
  applicationId: string,
): Promise<Readonly<{ state: "completed" }>> {
  const { data, error } = await createAdminClient().rpc("complete_temporary_reporter_payment", {
    p_profile_id: profileId,
    p_application_id: applicationId,
  });
  if (error) throw new ApplicationRepositoryError("Temporary payment could not be completed.");
  if (resultRecord(data).state !== "completed") {
    throw new ApplicationRepositoryError("The temporary payment response was invalid.");
  }
  return { state: "completed" };
}

export async function waiveDemoReporterApplicationPayment(
  profileId: string,
  applicationId: string,
): Promise<Readonly<{ state: "waived"; applicationId: string; status: "kyc_pending"; waivedAt: string }>> {
  const { data, error } = await createAdminClient().rpc("waive_demo_reporter_application_payment", {
    p_profile_id: profileId,
    p_application_id: applicationId,
  });
  if (error) throw new ApplicationRepositoryError("Demo payment waiver could not be completed.");
  const result = resultRecord(data);
  if (result.state !== "waived" || result.application_id !== applicationId
    || result.status !== "kyc_pending" || typeof result.waived_at !== "string") {
    throw new ApplicationRepositoryError("The demo payment waiver response was invalid.");
  }
  return { state: "waived", applicationId, status: "kyc_pending", waivedAt: result.waived_at };
}

export async function completeTemporaryKycApproval(
  profileId: string,
  applicationId: string,
): Promise<Readonly<{ profileId: string; generation: number }>> {
  const { data, error } = await createAdminClient().rpc("complete_temporary_reporter_kyc_approval", {
    p_profile_id: profileId,
    p_application_id: applicationId,
  });
  if (error) throw new ApplicationRepositoryError("Temporary identity verification could not be completed.");
  const result = resultRecord(data);
  if (result.state !== "completed" || result.profile_id !== profileId) {
    throw new ApplicationRepositoryError("The temporary approval response was invalid.");
  }
  return { profileId, generation: generationFrom(result) };
}

export async function claimTemporaryAccessSync(profileId: string): Promise<
  | Readonly<{ state: "busy"; generation: number }>
  | Readonly<{ state: "succeeded"; generation: number }>
  | Readonly<{ state: "claimed"; profileId: string; generation: number; claimToken: string }>
> {
  const { data, error } = await createAdminClient().rpc("claim_temporary_reporter_access_sync", {
    p_profile_id: profileId,
  });
  if (error) throw new ApplicationRepositoryError("Temporary reporter access could not be claimed.");
  const result = resultRecord(data);
  const generation = generationFrom(result);
  if (result.state === "busy" || result.state === "succeeded") {
    return { state: result.state, generation };
  }
  if (result.state === "claimed"
    && result.profile_id === profileId
    && typeof result.claim_token === "string"
    && UUID.test(result.claim_token)) {
    return { state: "claimed", profileId, generation, claimToken: result.claim_token };
  }
  throw new ApplicationRepositoryError("The temporary access claim was invalid.");
}

export async function completeTemporaryAccessSync(input: Readonly<{
  profileId: string;
  generation: number;
  claimToken: string;
  succeeded: boolean;
  failureDetail: "auth-claim-update-failed" | null;
}>): Promise<Readonly<{ state: "succeeded" | "failed" | "stale" | "expired"; generation: number }>> {
  const { data, error } = await createAdminClient().rpc("complete_temporary_reporter_access_sync", {
    p_profile_id: input.profileId,
    p_generation: input.generation,
    p_claim_token: input.claimToken,
    p_succeeded: input.succeeded,
    p_failure_detail: input.failureDetail,
  });
  if (error) throw new ApplicationRepositoryError("Temporary reporter access could not be completed.");
  const result = resultRecord(data);
  if (!(["succeeded", "failed", "stale", "expired"] as const).includes(
    result.state as "succeeded" | "failed" | "stale" | "expired",
  )) {
    throw new ApplicationRepositoryError("The temporary access completion was invalid.");
  }
  return {
    state: result.state as "succeeded" | "failed" | "stale" | "expired",
    generation: generationFrom(result),
  };
}

export const applicationRepository = {
  reserveKycStart,
  completeKycStart,
  releaseKycStart,
  claimKycWebhook,
  completeKycWebhook,
  failKycWebhook,
  completeTemporaryPayment,
  completeTemporaryKycApproval,
  claimTemporaryAccessSync,
  completeTemporaryAccessSync,
} as const;
