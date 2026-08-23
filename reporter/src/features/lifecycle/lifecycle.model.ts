import {
  getApplicationDeadline,
  membershipStatusAt,
  type ReporterMembershipStatus,
} from "@inbcn/domain";

export function nextMembershipState(input: Readonly<{
  expiresAt: string;
  graceEndsAt: string;
  now: string;
}>): ReporterMembershipStatus {
  return membershipStatusAt({
    publicStatus: "active",
    expiresAt: input.expiresAt,
    graceEndsAt: input.graceEndsAt,
  }, input.now);
}

export function shouldDelete(input: Readonly<{
  deleteAt: string | null;
  legalHold: boolean;
  now: string;
}>): boolean {
  const deleteAt = input.deleteAt === null ? Number.NaN : Date.parse(input.deleteAt);
  const now = Date.parse(input.now);
  return !input.legalHold && Number.isFinite(deleteAt) && Number.isFinite(now) && deleteAt <= now;
}

export function shouldRefundIncomplete(input: Readonly<{
  paidAt: string;
  status: string;
  now: string;
}>): boolean {
  if (input.status !== "kyc_pending") return false;
  try {
    return Date.parse(input.now) >= Date.parse(getApplicationDeadline(input.paidAt));
  } catch {
    return false;
  }
}
