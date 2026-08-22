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
