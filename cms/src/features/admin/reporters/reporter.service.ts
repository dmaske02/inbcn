import "server-only";

import { z } from "zod";

import type { AdminIdentity } from "../auth/authorization.model.ts";
import { canReviewReporter } from "./reporter.model.ts";
import type {
  ReporterApplicationDetail,
  ReporterApplicationListItem,
} from "./reporter.repository.ts";

type AccessSyncOperation = "approval" | "suspension" | "reinstatement";
type AccessSyncTarget = Readonly<{
  profileId: string;
  operation: AccessSyncOperation;
}>;

type ReporterRepository = Readonly<{
  list(): Promise<readonly ReporterApplicationListItem[]>;
  get(applicationId: string): Promise<ReporterApplicationDetail | null>;
  approve(applicationId: string, publicPhotoIdentityMatch: boolean): Promise<AccessSyncTarget>;
  reject(applicationId: string, reason: string): Promise<Readonly<{
    profileId: string;
    paymentId: string;
  }>>;
  suspend(profileId: string, reason: string): Promise<AccessSyncTarget>;
  reinstate(profileId: string): Promise<AccessSyncTarget>;
  retryTarget(profileId: string): Promise<AccessSyncTarget>;
  finishAccessSync(input: AccessSyncTarget & Readonly<{
    succeeded: boolean;
    failureDetail: "auth-claim-update-failed" | null;
  }>): Promise<void>;
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
  async function syncAccess(target: AccessSyncTarget): Promise<void> {
    const role = target.operation === "suspension" ? null : "reporter";
    try {
      await dependencies.setSignedRole(target.profileId, role);
    } catch {
      await dependencies.repository.finishAccessSync({
        ...target,
        succeeded: false,
        failureDetail: "auth-claim-update-failed",
      });
      throw new ReporterManagementError(
        "ACCESS_SYNC_FAILED",
        "Database access is safely disabled, but the signed role could not be synchronized. Retry the access sync.",
      );
    }
    await dependencies.repository.finishAccessSync({
      ...target,
      succeeded: true,
      failureDetail: null,
    });
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
      await syncAccess(target);
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
      await syncAccess(target);
    },

    async reinstate(admin: AdminIdentity, profileId: string) {
      requireReviewer(admin);
      const target = await dependencies.repository.reinstate(validId(profileId));
      await syncAccess(target);
    },

    async retryAccessSync(admin: AdminIdentity, profileId: string) {
      requireReviewer(admin);
      await syncAccess(await dependencies.repository.retryTarget(validId(profileId)));
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
