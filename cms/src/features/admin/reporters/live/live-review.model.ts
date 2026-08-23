import { strictTimestampMilliseconds } from "@inbcn/domain";

export function canViewLiveRequests(role: string): boolean {
  return role === "admin" || role === "editor";
}

export function canDecideLiveRequest(role: string): boolean {
  return role === "admin";
}

export function validateApprovedWindow(startsAt: string, endsAt: string, maximumMinutes: number):
  | Readonly<{ ok: true; startsAt: string; endsAt: string }>
  | Readonly<{ ok: false }> {
  const starts = strictTimestampMilliseconds(startsAt);
  const ends = strictTimestampMilliseconds(endsAt);
  if (!Number.isFinite(starts) || !Number.isFinite(ends) || !Number.isInteger(maximumMinutes) || maximumMinutes < 1 || maximumMinutes > 480 || ends <= starts || ends - starts > maximumMinutes * 60_000) return { ok: false };
  return { ok: true, startsAt: new Date(starts).toISOString(), endsAt: new Date(ends).toISOString() };
}
