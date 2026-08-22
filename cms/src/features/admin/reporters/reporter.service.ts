import "server-only";

import { z } from "zod";

import type { AdminIdentity } from "../auth/authorization.model.ts";
import { canReviewReporter } from "./reporter.model.ts";
import type {
  ReporterApplicationDetail,
  ReporterApplicationListItem,
} from "./reporter.repository.ts";

type AccessSyncOperation = "approval" | "suspension" | "reinstatement";
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
  approve(applicationId: string, publicPhotoIdentityMatch: boolean): Promise<Readonly<{ profileId: string }>>;
  reject(applicationId: string, reason: string): Promise<Readonly<{
    profileId: string;
    paymentId: string;
  }>>;
  suspend(profileId: string, reason: string): Promise<Readonly<{ profileId: string }>>;
  reinstate(profileId: string): Promise<Readonly<{ profileId: string }>>;
  claimAccessSync(profileId: string): Promise<AccessSyncClaimResult>;
  completeAccessSync(input: Omit<AccessSyncClaim, "state"> & Readonly<{
    succeeded: boolean;
    failureDetail: "auth-claim-update-failed" | null;
  }>): Promise<AccessSyncCompletion>;
}>;

type ReporterServiceDependencies = Readonly<{
  repository: ReporterRepository;
  setSignedRole(profileId: string, role: "reporter" | null): Promise<void>;
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

export function signedReporterMetadata(
  metadata: Readonly<Record<string, unknown>>,
  role: "reporter" | null,
): Record<string, unknown> {
  const { role: _currentRole, ...unrelated } = metadata;
  void _currentRole;
  return role ? { ...unrelated, role } : unrelated;
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
  } as const;
}

async function setSignedRole(profileId: string, role: "reporter" | null): Promise<void> {
  const { createAdminClient } = await import("../../../lib/supabase/admin.ts");
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(profileId);
  if (error || !data.user) throw new Error("Reporter auth account unavailable.");
  const appMetadata = signedReporterMetadata(data.user.app_metadata, role);
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
