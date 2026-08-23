export const reporterApplicationStatuses = [
  "draft",
  "payment_pending",
  "kyc_pending",
  "under_review",
  "approved",
  "rejected",
  "cancelled",
] as const;

export type ReporterApplicationStatus = (typeof reporterApplicationStatuses)[number];

export type ReporterMembershipStatus =
  | "approved"
  | "active"
  | "grace_period"
  | "expired"
  | "suspended";

export type ReporterMembershipAccess =
  | "read-only"
  | "reviewed-submissions-only"
  | "direct-publish"
  | "reviewed-submissions-and-live"
  | "direct-publish-and-live";

const transitions: Readonly<Record<ReporterApplicationStatus, readonly ReporterApplicationStatus[]>> = {
  draft: ["payment_pending"],
  payment_pending: ["kyc_pending"],
  kyc_pending: ["under_review", "cancelled"],
  under_review: ["approved", "rejected"],
  approved: [],
  rejected: [],
  cancelled: [],
};

export function canTransitionApplication(
  from: ReporterApplicationStatus,
  to: ReporterApplicationStatus,
): boolean {
  return transitions[from].includes(to);
}

export function getApplicationDeadline(paidAt: string): string {
  const deadline = new Date(paidAt);
  if (Number.isNaN(deadline.getTime())) throw new TypeError("Invalid payment timestamp.");
  deadline.setUTCDate(deadline.getUTCDate() + 30);
  return deadline.toISOString();
}

function calendarDate(value: string): readonly [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    ? [year, month, day]
    : null;
}

export function isAtLeast18(dateOfBirth: string, today: string): boolean {
  const birth = calendarDate(dateOfBirth);
  const current = calendarDate(today);
  if (!birth || !current) return false;
  const [birthYear, birthMonth, birthDay] = birth;
  const [currentYear, currentMonth, currentDay] = current;
  const years = currentYear - birthYear;
  return years > 18
    || (years === 18
      && (currentMonth > birthMonth
        || (currentMonth === birthMonth && currentDay >= birthDay)));
}

export function membershipStatusAt(
  input: Readonly<{
    publicStatus: string;
    expiresAt: string;
    graceEndsAt: string;
  }>,
  now: string,
): ReporterMembershipStatus {
  if (input.publicStatus === "suspended") return "suspended";
  const current = Date.parse(now);
  const expires = Date.parse(input.expiresAt);
  const graceEnds = Date.parse(input.graceEndsAt);
  if (![current, expires, graceEnds].every(Number.isFinite)) return "expired";
  if (current <= expires) return "active";
  return current <= graceEnds ? "grace_period" : "expired";
}

export function membershipAccess(input: Readonly<{
  status: ReporterMembershipStatus;
  direct: boolean;
  live: boolean;
}>): ReporterMembershipAccess {
  if (input.status === "expired" || input.status === "suspended") {
    return "read-only";
  }
  if (input.status === "grace_period") return "reviewed-submissions-only";
  if (input.direct && input.live) return "direct-publish-and-live";
  if (input.direct) return "direct-publish";
  if (input.live) return "reviewed-submissions-and-live";
  return "reviewed-submissions-only";
}

export function strictTimestampMilliseconds(value: string): number {
  const match = value.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2})(?::([0-9]{2})(?:\.[0-9]{1,3})?)?(Z|[+-][0-9]{2}:[0-9]{2})$/u);
  if (!match) return Number.NaN;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = "00", timezone] = match;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (year < 1 || !daysInMonth || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) return Number.NaN;
  if (timezone !== "Z") {
    const [offsetHour, offsetMinute] = timezone.slice(1).split(":").map(Number);
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return Number.NaN;
  }
  return Date.parse(value);
}
