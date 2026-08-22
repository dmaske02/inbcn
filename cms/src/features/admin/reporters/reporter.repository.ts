import "server-only";

import type { Json } from "@inbcn/database";

import { createClient } from "../../../lib/supabase/server.ts";

export type ReporterApplicationListItem = Readonly<{
  id: string;
  profileId: string;
  legalName: string;
  displayName: string;
  status: string;
  submittedAt: string | null;
  createdAt: string;
}>;

export type ReporterApplicationDetail = Readonly<{
  id: string;
  profileId: string;
  status: string;
  legalName: string;
  dateOfBirth: string;
  age18Declared: boolean;
  homeCity: string;
  homeDistrict: string;
  homeState: string;
  bio: string | null;
  beats: readonly string[];
  publicPhotoUrl: string;
  publicPhotoVerifiedAt: string | null;
  kycStatus: string;
  verifiedLegalName: string | null;
  verifiedAdult: boolean | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  decisionReason: string | null;
  profile: Readonly<{ displayName: string; username: string; isActive: boolean }>;
  consents: readonly Readonly<{
    key: string;
    version: string;
    locale: string;
    consentedAt: string;
    withdrawnAt: string | null;
  }>[];
  payment: Readonly<{
    id: string;
    amountPaise: number;
    currency: string;
    status: string;
    capturedAt: string | null;
    refundStatus: string;
    refundFailureDetail: string | null;
  }> | null;
  reporter: Readonly<{
    publicStatus: string;
    membershipExpiresAt: string;
    membershipGraceEndsAt: string;
    canPublishDirectly: boolean;
    canBroadcastLive: boolean;
    suspensionReason: string | null;
    accessSyncStatus: string;
    accessSyncOperation: string | null;
    accessSyncFailureDetail: string | null;
    accessSyncGeneration: number;
    accessSyncDesiredRole: string;
    accessSyncClaimedAt: string | null;
  }> | null;
  audit: readonly Readonly<{ action: string; createdAt: string; metadata: Json }>[];
}>;

export class ReporterRepositoryError extends Error {
  constructor(message = "Reporter administration is temporarily unavailable.") {
    super(message);
    this.name = "ReporterRepositoryError";
  }
}

async function list(): Promise<readonly ReporterApplicationListItem[]> {
  const supabase = await createClient();
  const { data: applications, error } = await supabase
    .from("reporter_applications")
    .select("id, profile_id, legal_name, status, submitted_at, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new ReporterRepositoryError();
  const profileIds = [...new Set(applications.map((item) => item.profile_id))];
  const { data: profiles, error: profileError } = profileIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", profileIds)
    : { data: [], error: null };
  if (profileError) throw new ReporterRepositoryError();
  const names = new Map(profiles.map((profile) => [profile.id, profile.display_name]));
  return applications.map((application) => ({
    id: application.id,
    profileId: application.profile_id,
    legalName: application.legal_name,
    displayName: names.get(application.profile_id) ?? application.legal_name,
    status: application.status,
    submittedAt: application.submitted_at,
    createdAt: application.created_at,
  }));
}

async function get(applicationId: string): Promise<ReporterApplicationDetail | null> {
  const supabase = await createClient();
  const { data: application, error } = await supabase
    .from("reporter_applications")
    .select("id, profile_id, status, legal_name, date_of_birth, age_18_declared, home_city, home_district, home_state, bio, beats, public_photo_url, public_photo_verified_at, kyc_status, verified_legal_name, verified_adult, submitted_at, reviewed_at, decision_reason")
    .eq("id", applicationId)
    .maybeSingle();
  if (error) throw new ReporterRepositoryError();
  if (!application) return null;

  const [
    profileResult,
    consentResult,
    paymentResult,
    reporterResult,
    applicationAuditResult,
    profileAuditResult,
  ] = await Promise.all([
    supabase.from("profiles").select("display_name, username, is_active").eq("id", application.profile_id).single(),
    supabase.from("reporter_consents").select("notice_key, notice_version, locale, consented_at, withdrawn_at").eq("application_id", application.id).order("created_at"),
    supabase.from("reporter_payments").select("id, amount_paise, currency, payment_status, captured_at, refund_status, refund_failure_detail").eq("application_id", application.id).maybeSingle(),
    supabase.from("reporter_profiles").select("public_status, membership_expires_at, membership_grace_ends_at, can_publish_directly, can_broadcast_live, suspension_reason, access_sync_status, access_sync_operation, access_sync_failure_detail, access_sync_generation, access_sync_desired_role, access_sync_claimed_at").eq("profile_id", application.profile_id).maybeSingle(),
    supabase.from("audit_events").select("action, created_at, metadata").eq("subject_type", "reporter_application").eq("subject_id", application.id).order("created_at", { ascending: false }),
    supabase.from("audit_events").select("action, created_at, metadata").eq("subject_type", "reporter_profile").eq("subject_id", application.profile_id).order("created_at", { ascending: false }),
  ]);
  if (profileResult.error || !profileResult.data || consentResult.error
    || paymentResult.error || reporterResult.error || applicationAuditResult.error
    || profileAuditResult.error) {
    throw new ReporterRepositoryError();
  }
  const payment = paymentResult.data;
  const reporter = reporterResult.data;
  const paymentAuditResult = payment
    ? await supabase
      .from("audit_events")
      .select("action, created_at, metadata")
      .eq("subject_type", "reporter_payment")
      .eq("subject_id", payment.id)
      .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (paymentAuditResult.error) throw new ReporterRepositoryError();
  return {
    id: application.id,
    profileId: application.profile_id,
    status: application.status,
    legalName: application.legal_name,
    dateOfBirth: application.date_of_birth,
    age18Declared: application.age_18_declared,
    homeCity: application.home_city,
    homeDistrict: application.home_district,
    homeState: application.home_state,
    bio: application.bio,
    beats: application.beats,
    publicPhotoUrl: application.public_photo_url,
    publicPhotoVerifiedAt: application.public_photo_verified_at,
    kycStatus: application.kyc_status,
    verifiedLegalName: application.verified_legal_name,
    verifiedAdult: application.verified_adult,
    submittedAt: application.submitted_at,
    reviewedAt: application.reviewed_at,
    decisionReason: application.decision_reason,
    profile: {
      displayName: profileResult.data.display_name,
      username: profileResult.data.username,
      isActive: profileResult.data.is_active,
    },
    consents: consentResult.data.map((consent) => ({
      key: consent.notice_key,
      version: consent.notice_version,
      locale: consent.locale,
      consentedAt: consent.consented_at,
      withdrawnAt: consent.withdrawn_at,
    })),
    payment: payment ? {
      id: payment.id,
      amountPaise: payment.amount_paise,
      currency: payment.currency,
      status: payment.payment_status,
      capturedAt: payment.captured_at,
      refundStatus: payment.refund_status,
      refundFailureDetail: payment.refund_failure_detail,
    } : null,
    reporter: reporter ? {
      publicStatus: reporter.public_status,
      membershipExpiresAt: reporter.membership_expires_at,
      membershipGraceEndsAt: reporter.membership_grace_ends_at,
      canPublishDirectly: reporter.can_publish_directly,
      canBroadcastLive: reporter.can_broadcast_live,
      suspensionReason: reporter.suspension_reason,
      accessSyncStatus: reporter.access_sync_status,
      accessSyncOperation: reporter.access_sync_operation,
      accessSyncFailureDetail: reporter.access_sync_failure_detail,
      accessSyncGeneration: reporter.access_sync_generation,
      accessSyncDesiredRole: reporter.access_sync_desired_role,
      accessSyncClaimedAt: reporter.access_sync_claimed_at,
    } : null,
    audit: [
      ...applicationAuditResult.data,
      ...profileAuditResult.data,
      ...paymentAuditResult.data,
    ]
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .map((event) => ({
        action: event.action,
        createdAt: event.created_at,
        metadata: event.metadata,
      })),
  };
}

async function approve(applicationId: string, publicPhotoIdentityMatch: boolean) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_reporter_application", {
    p_application_id: applicationId,
    p_public_photo_identity_match: publicPhotoIdentityMatch,
  });
  if (error || !data) throw new ReporterRepositoryError("The application could not be approved.");
  return { profileId: data };
}

async function reject(applicationId: string, reason: string) {
  const supabase = await createClient();
  const { data: application, error: applicationError } = await supabase
    .from("reporter_applications")
    .select("profile_id")
    .eq("id", applicationId)
    .single();
  if (applicationError || !application) throw new ReporterRepositoryError("The application could not be rejected.");
  const { data, error } = await supabase.rpc("reject_reporter_application", {
    p_application_id: applicationId,
    p_decision_reason: reason,
  });
  if (error || !data) throw new ReporterRepositoryError("The application could not be rejected.");
  return { profileId: application.profile_id, paymentId: data };
}

async function suspend(profileId: string, reason: string) {
  const { data, error } = await (await createClient()).rpc("suspend_reporter", {
    p_profile_id: profileId,
    p_reason: reason,
  });
  if (error || !data) throw new ReporterRepositoryError("The reporter could not be suspended.");
  return { profileId: data };
}

async function reinstate(profileId: string) {
  const { data, error } = await (await createClient()).rpc("reinstate_reporter", {
    p_profile_id: profileId,
  });
  if (error || !data) throw new ReporterRepositoryError("The reporter could not be reinstated.");
  return { profileId: data };
}

function jsonRecord(value: Json): Readonly<Record<string, Json | undefined>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : null;
}

async function claimAccessSync(profileId: string) {
  const { data, error } = await (await createClient()).rpc("claim_reporter_access_sync", {
    p_profile_id: profileId,
  });
  const result = data === null ? null : jsonRecord(data);
  if (error || !result || !Number.isSafeInteger(result.generation)) {
    throw new ReporterRepositoryError("Reporter access synchronization could not be reserved.");
  }
  const generation = result.generation as number;
  if (result.state === "busy" || result.state === "succeeded") {
    return { state: result.state, generation } as const;
  }
  if (result.state !== "claimed"
    || result.profile_id !== profileId
    || !["approval", "reconciliation", "suspension", "reinstatement"].includes(String(result.operation))
    || !["none", "reporter"].includes(String(result.desired_role))
    || typeof result.claim_token !== "string") {
    throw new ReporterRepositoryError("Reporter access synchronization could not be reserved.");
  }
  return {
    state: "claimed" as const,
    profileId,
    operation: result.operation as "approval" | "reconciliation" | "suspension" | "reinstatement",
    desiredRole: result.desired_role as "none" | "reporter",
    generation,
    claimToken: result.claim_token,
  };
}

async function completeAccessSync(input: Readonly<{
  profileId: string;
  operation: "approval" | "reconciliation" | "suspension" | "reinstatement";
  desiredRole: "none" | "reporter";
  generation: number;
  claimToken: string;
  succeeded: boolean;
  failureDetail: "auth-claim-update-failed" | null;
}>) {
  const { data, error } = await (await createClient()).rpc("complete_reporter_access_sync", {
    p_profile_id: input.profileId,
    p_generation: input.generation,
    p_claim_token: input.claimToken,
    p_succeeded: input.succeeded,
    p_failure_detail: input.failureDetail,
  });
  const result = data === null ? null : jsonRecord(data);
  if (error || !result
    || !["expired", "failed", "stale", "succeeded"].includes(String(result.state))
    || !Number.isSafeInteger(result.generation)) {
    throw new ReporterRepositoryError("Reporter access synchronization could not be recorded.");
  }
  return {
    state: result.state as "expired" | "failed" | "stale" | "succeeded",
    generation: result.generation as number,
  };
}

export const reporterRepository = {
  list,
  get,
  approve,
  reject,
  suspend,
  reinstate,
  claimAccessSync,
  completeAccessSync,
} as const;
