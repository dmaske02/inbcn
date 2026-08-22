export const REPORTER_PAYMENT_AMOUNT_PAISE = 10_000;
export const REPORTER_PAYMENT_CURRENCY = "INR";

type MembershipDates = Readonly<{
  membershipStartedAt: string;
  membershipExpiresAt: string;
  membershipGraceEndsAt: string;
}>;

function addCalendarYear(value: Date): Date {
  const result = new Date(value);
  const month = result.getUTCMonth();
  result.setUTCFullYear(result.getUTCFullYear() + 1);
  if (result.getUTCMonth() !== month) result.setUTCDate(0);
  return result;
}

export function creditRenewal(prior: MembershipDates, capturedAt: string) {
  const captured = new Date(capturedAt);
  const expires = new Date(prior.membershipExpiresAt);
  const graceEnds = new Date(prior.membershipGraceEndsAt);
  if (![captured, expires, graceEnds].every((value) => Number.isFinite(value.getTime()))) {
    throw new TypeError("Invalid membership date.");
  }
  const withinGrace = captured <= graceEnds;
  const creditedStart = withinGrace ? expires : captured;
  const creditedExpiry = addCalendarYear(creditedStart);
  const nextGrace = new Date(creditedExpiry.getTime() + 7 * 24 * 60 * 60 * 1_000);
  return {
    membershipStartedAt: withinGrace ? prior.membershipStartedAt : captured.toISOString(),
    creditedMembershipStartedAt: creditedStart.toISOString(),
    membershipExpiresAt: creditedExpiry.toISOString(),
    membershipGraceEndsAt: nextGrace.toISOString(),
  } as const;
}
