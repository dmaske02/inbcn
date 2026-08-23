import { z } from "zod";
import { strictTimestampMilliseconds } from "@inbcn/domain";

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
  supportingNotes: z.preprocess((value) => value ?? "", z.string().trim().max(2000, "Keep notes within 2000 characters.")).transform((value) => value || null),
});

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
