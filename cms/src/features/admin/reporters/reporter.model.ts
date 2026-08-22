export {
  membershipAccess,
  membershipStatusAt,
  type ReporterMembershipAccess,
  type ReporterMembershipStatus,
} from "@inbcn/domain";

export function canReviewReporter(role: string): boolean {
  return role === "admin";
}

export function canSetReporterTrust(role: string): boolean {
  return role === "admin";
}
