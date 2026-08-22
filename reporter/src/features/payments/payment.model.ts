export const REPORTER_PAYMENT_AMOUNT_PAISE = 10_000;
export const REPORTER_PAYMENT_CURRENCY = "INR";

export function creditRenewal(currentExpiry: string, capturedAt: string): string {
  const expiry = new Date(currentExpiry);
  const captured = new Date(capturedAt);
  const base = expiry > captured ? expiry : captured;
  const month = base.getUTCMonth();
  const day = base.getUTCDate();
  base.setUTCDate(1);
  base.setUTCFullYear(base.getUTCFullYear() + 1);
  base.setUTCMonth(month + 1, 0);
  base.setUTCDate(Math.min(day, base.getUTCDate()));
  return base.toISOString();
}
