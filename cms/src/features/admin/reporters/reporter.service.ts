import "server-only";

import { z } from "zod";

import type { AdminIdentity } from "../auth/authorization.model.ts";
import { canReviewReporter, canSetReporterTrust } from "./reporter.model.ts";
import type {
  ReporterApplicationDetail,
  ReporterApplicationListItem,
  ReporterDirectoryItem,
} from "./reporter.repository.ts";

type AccessSyncOperation = "approval" | "reconciliation" | "suspension" | "reinstatement";
type AccessSyncDesiredRole = "none" | "reporter";
type AccessSyncClaim = Readonly<{
  state: "claimed";
  profileId: string;
  operation: AccessSyncOperation;
  desiredRole: AccessSyncDesiredRole;
  generation: number;
  claimToken: string;
}>;
type AccessSyncClaimResult = AccessSyncClaim
  | Readonly<{ state: "busy" | "succeeded"; generation: number }>;
type AccessSyncCompletion = Readonly<{
  state: "expired" | "failed" | "stale" | "succeeded";
  generation: number;
}>;

type ReporterRepository = Readonly<{
  list(): Promise<readonly ReporterApplicationListItem[]>;
  get(applicationId: string): Promise<ReporterApplicationDetail | null>;
  listReporters(): Promise<readonly ReporterDirectoryItem[]>;
  findApprovedApplicationId(profileId: string): Promise<string | null>;
  approve(applicationId: string, publicPhotoIdentityMatch: boolean): Promise<Readonly<{ profileId: string }>>;
  reject(applicationId: string, reason: string): Promise<Readonly<{
    profileId: string;
    paymentId: string;
  }>>;
  suspend(profileId: string, reason: string): Promise<Readonly<{ profileId: string }>>;
  reinstate(profileId: string): Promise<Readonly<{ profileId: string }>>;
  setTrust(profileId: string, capability: "direct_publish" | "live_broadcast", enabled: boolean, reason: string): Promise<void>;
  claimAccessSync(profileId: string): Promise<AccessSyncClaimResult>;
  completeAccessSync(input: Omit<AccessSyncClaim, "state"> & Readonly<{
    succeeded: boolean;
    failureDetail: "auth-claim-update-failed" | null;
  }>): Promise<AccessSyncCompletion>;
}>;

type ReporterServiceDependencies = Readonly<{
  repository: ReporterRepository;
  setSignedRole(profileId: string, role: "reporter" | null, generation: number): Promise<void>;
  requestFullRefund(paymentId: string): Promise<unknown>;
}>;

export class ReporterManagementError extends Error {
  readonly code:
    | "ACCESS_SYNC_FAILED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "REFUND_FAILED"
    | "VALIDATION";

  constructor(code: ReporterManagementError["code"], message: string) {
    super(message);
    this.name = "ReporterManagementError";
    this.code = code;
  }
}

function requireReviewer(admin: Pick<AdminIdentity, "role">): void {
  if (!canReviewReporter(admin.role)) {
    throw new ReporterManagementError("FORBIDDEN", "Only an administrator can manage reporters.");
  }
}

function validId(value: string): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) {
    throw new ReporterManagementError("VALIDATION", "The reporter record is invalid.");
  }
  return parsed.data;
}

function requiredReason(value: string): string {
  const reason = value.trim();
  if (!reason) {
    throw new ReporterManagementError("VALIDATION", "Enter a reason before continuing.");
  }
  return reason;
}

function requiredBoundedReason(value: string): string {
  const reason = requiredReason(value);
  if (reason.length > 2000) {
    throw new ReporterManagementError("VALIDATION", "Keep the reason within 2000 characters.");
  }
  return reason;
}

export function signedReporterMetadata(
  metadata: Readonly<Record<string, unknown>>,
  role: "reporter" | null,
  generation: number,
): Record<string, unknown> {
  const {
    role: _currentRole,
    reporter_access_generation: _currentGeneration,
    ...unrelated
  } = metadata;
  void _currentRole;
  void _currentGeneration;
  return role
    ? { ...unrelated, role, reporter_access_generation: generation }
    : { ...unrelated, reporter_access_generation: generation };
}

export function createReporterService(dependencies: ReporterServiceDependencies) {
  async function syncAccess(profileId: string): Promise<void> {
    for (let reconciliation = 0; reconciliation < 4; reconciliation += 1) {
      const claim = await dependencies.repository.claimAccessSync(profileId);
      if (claim.state !== "claimed") {
        if (claim.state === "succeeded") return;
        throw new ReporterManagementError(
          "ACCESS_SYNC_FAILED",
          "Reporter access synchronization is already in progress. Retry after the current lease finishes.",
        );
      }
      const { state: _claimState, ...target } = claim;
      void _claimState;

      try {
        await dependencies.setSignedRole(
          claim.profileId,
          claim.desiredRole === "reporter" ? "reporter" : null,
          claim.generation,
        );
      } catch {
        const completion = await dependencies.repository.completeAccessSync({
          ...target,
          succeeded: false,
          failureDetail: "auth-claim-update-failed",
        });
        if (completion.state === "stale" || completion.state === "expired") continue;
        throw new ReporterManagementError(
          "ACCESS_SYNC_FAILED",
          "Database access is safely disabled, but the signed role could not be synchronized. Retry the access sync.",
        );
      }

      const completion = await dependencies.repository.completeAccessSync({
        ...target,
        succeeded: true,
        failureDetail: null,
      });
      if (completion.state === "succeeded") return;
      if (completion.state === "stale" || completion.state === "expired") continue;
      throw new ReporterManagementError(
        "ACCESS_SYNC_FAILED",
        "Reporter access synchronization could not be confirmed. Retry the access sync.",
      );
    }
    throw new ReporterManagementError(
      "ACCESS_SYNC_FAILED",
      "Reporter access changed repeatedly during synchronization. Retry the newest pending generation.",
    );
  }

  return {
    async list(admin: AdminIdentity) {
      requireReviewer(admin);
      return dependencies.repository.list();
    },

    async get(admin: AdminIdentity, applicationId: string) {
      requireReviewer(admin);
      return dependencies.repository.get(validId(applicationId));
    },

    async listReporters(admin: AdminIdentity) {
      requireReviewer(admin);
      return dependencies.repository.listReporters();
    },

    async getReporter(admin: AdminIdentity, profileId: string) {
      requireReviewer(admin);
      const applicationId = await dependencies.repository.findApprovedApplicationId(validId(profileId));
      return applicationId ? dependencies.repository.get(applicationId) : null;
    },

    async approve(
      admin: AdminIdentity,
      applicationId: string,
      publicPhotoIdentityMatch: boolean,
    ) {
      requireReviewer(admin);
      if (!publicPhotoIdentityMatch) {
        throw new ReporterManagementError(
          "VALIDATION",
          "Confirm that the separately supplied public portrait matches the verified applicant.",
        );
      }
      const target = await dependencies.repository.approve(
        validId(applicationId),
        publicPhotoIdentityMatch,
      );
      await syncAccess(target.profileId);
    },

    async reject(admin: AdminIdentity, applicationId: string, reason: string) {
      requireReviewer(admin);
      const decision = await dependencies.repository.reject(
        validId(applicationId),
        requiredReason(reason),
      );
      try {
        return await dependencies.requestFullRefund(decision.paymentId);
      } catch {
        throw new ReporterManagementError(
          "REFUND_FAILED",
          "The application is rejected, but refund initiation needs an administrator retry.",
        );
      }
    },

    async suspend(admin: AdminIdentity, profileId: string, reason: string) {
      requireReviewer(admin);
      const target = await dependencies.repository.suspend(
        validId(profileId),
        requiredReason(reason),
      );
      await syncAccess(target.profileId);
    },

    async reinstate(admin: AdminIdentity, profileId: string) {
      requireReviewer(admin);
      const target = await dependencies.repository.reinstate(validId(profileId));
      await syncAccess(target.profileId);
    },

    async retryAccessSync(admin: AdminIdentity, profileId: string) {
      requireReviewer(admin);
      await syncAccess(validId(profileId));
    },

    async setTrust(
      admin: AdminIdentity,
      profileId: string,
      capability: string,
      enabled: boolean,
      reason: string,
    ) {
      if (!canSetReporterTrust(admin.role)) {
        throw new ReporterManagementError("FORBIDDEN", "Only an administrator can change reporter trust.");
      }
      const parsedCapability = z.enum(["direct_publish", "live_broadcast"]).safeParse(capability);
      if (!parsedCapability.success) {
        throw new ReporterManagementError("VALIDATION", "Select a valid reporter capability.");
      }
      await dependencies.repository.setTrust(
        validId(profileId),
        parsedCapability.data,
        enabled,
        requiredBoundedReason(reason),
      );
    },
  } as const;
}

async function setSignedRole(
  profileId: string,
  role: "reporter" | null,
  generation: number,
): Promise<void> {
  const { createAdminClient } = await import("../../../lib/supabase/admin.ts");
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(profileId);
  if (error || !data.user) throw new Error("Reporter auth account unavailable.");
  const appMetadata = signedReporterMetadata(data.user.app_metadata, role, generation);
  const { error: updateError } = await admin.auth.admin.updateUserById(profileId, {
    app_metadata: appMetadata,
  });
  if (updateError) throw new Error("Reporter signed role update failed.");
}

export async function reporterService() {
  const [{ reporterRepository }, { requestFullRefund }] = await Promise.all([
    import("./reporter.repository.ts"),
    import("./reporter-refund.service.ts"),
  ]);
  return createReporterService({
    repository: reporterRepository,
    setSignedRole,
    requestFullRefund,
  });
}
