export const publicLocales = ["en", "hi", "mr"] as const;
export type PublicLocale = (typeof publicLocales)[number];

export {
  canTransitionApplication,
  getApplicationDeadline,
  isAtLeast18,
  membershipAccess,
  membershipStatusAt,
  reporterApplicationStatuses,
  type ReporterMembershipAccess,
  type ReporterMembershipStatus,
  type ReporterApplicationStatus,
} from "./reporter.ts";

export const websiteRevalidationEvents = ["all", "stories", "alerts", "media", "live-tv", "homepage"] as const;
export type WebsiteRevalidationEvent = (typeof websiteRevalidationEvents)[number];
