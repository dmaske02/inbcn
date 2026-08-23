export function canViewLiveRequests(role: string): boolean {
  return role === "admin" || role === "editor";
}

export function canDecideLiveRequest(role: string): boolean {
  return role === "admin";
}

function strictTimestampMilliseconds(value: string): number {
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

export function validateApprovedWindow(startsAt: string, endsAt: string, maximumMinutes: number):
  | Readonly<{ ok: true; startsAt: string; endsAt: string }>
  | Readonly<{ ok: false }> {
  const starts = strictTimestampMilliseconds(startsAt);
  const ends = strictTimestampMilliseconds(endsAt);
  if (!Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts || ends - starts > maximumMinutes * 60_000) return { ok: false };
  return { ok: true, startsAt: new Date(starts).toISOString(), endsAt: new Date(ends).toISOString() };
}
