import { z } from "zod";

export type LiveRequestInput = Readonly<{
  title: string;
  purpose: string;
  intendedLocality: string;
  expectedStartsAt: string;
  expectedDurationMinutes: number;
  supportingNotes: string | null;
}>;

export type ValidationResult<T> =
  | Readonly<{ ok: true; data: T }>
  | Readonly<{ ok: false; fieldErrors: Readonly<Record<string, string[]>> }>;

const requestSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(240, "Keep the title within 240 characters."),
  purpose: z.string().trim().min(1, "Purpose is required.").max(2000, "Keep the purpose within 2000 characters."),
  intendedLocality: z.string().trim().min(1, "Intended locality is required.").max(200, "Keep the locality within 200 characters."),
  expectedStartsAt: z.string(),
  expectedDurationMinutes: z.coerce.number().int("Enter whole minutes.").finite("Enter a valid duration.").min(1, "Duration must be at least one minute.").max(480, "Duration can be at most 480 minutes."),
  supportingNotes: z.string().trim().max(2000, "Keep notes within 2000 characters.").transform((value) => value || null),
});

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

function errors(error: z.ZodError): Readonly<Record<string, string[]>> {
  return Object.fromEntries(Object.entries(error.flatten().fieldErrors)
    .filter((entry): entry is [string, string[]] => Boolean(entry[1])));
}

export function canRequestLive(access: Readonly<{ membership: string; canBroadcastLive: boolean }>): boolean {
  return access.membership === "active" && access.canBroadcastLive;
}

export function validateLiveRequestInput(input: unknown): ValidationResult<LiveRequestInput> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: errors(parsed.error) };
  const startsAt = strictTimestampMilliseconds(parsed.data.expectedStartsAt);
  if (!Number.isFinite(startsAt)) {
    return { ok: false, fieldErrors: { expectedStartsAt: ["Enter a valid expected start time."] } };
  }
  return { ok: true, data: { ...parsed.data, expectedStartsAt: new Date(startsAt).toISOString() } };
}

export function validateApprovedWindow(
  startsAt: string,
  endsAt: string,
  maximumMinutes = 480,
): ValidationResult<Readonly<{ startsAt: string; endsAt: string }>> {
  const starts = strictTimestampMilliseconds(startsAt);
  const ends = strictTimestampMilliseconds(endsAt);
  if (!Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts || ends - starts > maximumMinutes * 60_000) {
    return { ok: false, fieldErrors: { window: ["Enter a valid approval window within the requested duration."] } };
  }
  return { ok: true, data: { startsAt: new Date(starts).toISOString(), endsAt: new Date(ends).toISOString() } };
}
