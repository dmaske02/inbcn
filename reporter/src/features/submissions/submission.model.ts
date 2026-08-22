import { z } from "zod";

export const REPORTER_LANGUAGE_CODES = ["en", "hi", "mr"] as const;
export type ReporterLanguageCode = (typeof REPORTER_LANGUAGE_CODES)[number];

export type ReporterStoryInput = Readonly<{
  title: string;
  summary: string;
  body: string;
  languageCode: ReporterLanguageCode;
  languageId: string;
  categoryId: string;
  eventOccurredAt: string;
  mediaIds: readonly string[];
  featuredMediaId: string | null;
}>;

export type CapturedLocation = Readonly<{
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
}>;

export type SubmissionEvidence = Readonly<{
  locality: string;
  location: CapturedLocation;
}>;

export type ReporterDraftActionTarget = Readonly<{
  storyId: string;
  redirectToEditor: boolean;
}>;

export type ReporterStoryState =
  | "draft"
  | "changes_requested"
  | "pending_review"
  | "approved"
  | "scheduled"
  | "published"
  | "rejected"
  | "withdrawn"
  | "archived";

export type FieldValidationResult<T> =
  | Readonly<{ ok: true; data: T }>
  | Readonly<{ ok: false; fieldErrors: Readonly<Record<string, string[]>> }>;

const storySchema = z.object({
  title: z.string().trim().min(1, "Headline is required.").max(240, "Headline is too long."),
  summary: z.string().trim().min(1, "Summary is required.").max(1000, "Summary is too long."),
  body: z.string().trim().min(1, "Body is required.").max(100_000, "Body is too long."),
  languageCode: z.enum(REPORTER_LANGUAGE_CODES, "Choose English, Hindi, or Marathi."),
  languageId: z.uuid("Choose a valid language."),
  categoryId: z.uuid("Choose a valid category."),
  eventOccurredAt: z.string().trim().min(1, "Event time is required."),
  mediaIds: z.array(z.uuid("Choose valid uploaded media.")),
  featuredMediaId: z.union([z.uuid("Choose valid featured media."), z.null()]),
}).superRefine((value, context) => {
  if (new Set(value.mediaIds).size !== value.mediaIds.length) {
    context.addIssue({ code: "custom", path: ["mediaIds"], message: "Remove duplicate media." });
  }
  if (value.featuredMediaId && !value.mediaIds.includes(value.featuredMediaId)) {
    context.addIssue({ code: "custom", path: ["featuredMediaId"], message: "Featured media must be attached to this story." });
  }
});

const locationSchema = z.object({
  latitude: z.coerce.number().finite().min(-90, "Latitude is invalid.").max(90, "Latitude is invalid."),
  longitude: z.coerce.number().finite().min(-180, "Longitude is invalid.").max(180, "Longitude is invalid."),
  accuracy: z.coerce.number().finite().positive("Location accuracy must be positive.").max(10_000, "Location accuracy is too imprecise."),
  capturedAt: z.string().trim().min(1, "Capture time is required."),
});

function nowMilliseconds(now: string | number | Date): number {
  return now instanceof Date ? now.getTime() : typeof now === "number" ? now : strictTimestampMilliseconds(now);
}

function strictTimestampMilliseconds(value: string): number {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/u,
  );
  if (!match) return Number.NaN;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = "00", timezone] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (year < 1 || !daysInMonth || day < 1 || day > daysInMonth
    || hour > 23 || minute > 59 || second > 59) {
    return Number.NaN;
  }
  if (timezone !== "Z") {
    const [offsetHour, offsetMinute] = timezone.slice(1).split(":").map(Number);
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) {
      return Number.NaN;
    }
  }
  return Date.parse(value);
}

export function createNewReporterDraftTarget(randomId: () => string): ReporterDraftActionTarget {
  const storyId = randomId();
  if (!z.uuid().safeParse(storyId).success) throw new Error("Generated reporter story ID is invalid.");
  return { storyId, redirectToEditor: true };
}

function fieldErrors(error: z.ZodError): Readonly<Record<string, string[]>> {
  const flattened = error.flatten().fieldErrors;
  return Object.fromEntries(Object.entries(flattened).filter((entry): entry is [string, string[]] => Boolean(entry[1])));
}

export function isFreshCapture(
  capturedAt: string | number | Date,
  now: string | number | Date,
): boolean {
  const captured = nowMilliseconds(capturedAt);
  const current = nowMilliseconds(now);
  return Number.isFinite(captured)
    && Number.isFinite(current)
    && captured <= current
    && captured >= current - 30 * 60_000;
}

export function canonicalReporterStoryState(
  canonicalStatus: string,
  latestRevisionOutcome: string | null,
): ReporterStoryState {
  if (canonicalStatus === "draft" && latestRevisionOutcome === "changes_requested") {
    return "changes_requested";
  }
  if (canonicalStatus === "rejected" && latestRevisionOutcome === "withdrawn") {
    return "withdrawn";
  }
  return ([
    "draft",
    "pending_review",
    "approved",
    "scheduled",
    "published",
    "rejected",
    "archived",
  ] as const).includes(canonicalStatus as never)
    ? canonicalStatus as ReporterStoryState
    : "draft";
}

export function parseCapturedLocation(
  input: unknown,
  now: string | number | Date,
): FieldValidationResult<CapturedLocation> {
  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) {
    const errors = { ...fieldErrors(parsed.error) };
    const capturedAt = typeof input === "object" && input !== null
      ? (input as Record<string, unknown>).capturedAt
      : undefined;
    if (!isFreshCapture(typeof capturedAt === "string" ? capturedAt : Number.NaN, now)) {
      errors.capturedAt = ["Capture location again before submitting."];
    }
    return { ok: false, fieldErrors: errors };
  }
  const captured = strictTimestampMilliseconds(parsed.data.capturedAt);
  if (!isFreshCapture(captured, now)) {
    return { ok: false, fieldErrors: { capturedAt: ["Capture location again before submitting."] } };
  }
  return {
    ok: true,
    data: { ...parsed.data, capturedAt: new Date(captured).toISOString() },
  };
}

export function validateReporterStoryInput(
  input: unknown,
  now: string | number | Date,
): FieldValidationResult<ReporterStoryInput> {
  const parsed = storySchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const eventTime = strictTimestampMilliseconds(parsed.data.eventOccurredAt);
  const current = nowMilliseconds(now);
  if (!Number.isFinite(eventTime) || !Number.isFinite(current) || eventTime > current + 5 * 60_000) {
    return { ok: false, fieldErrors: { eventOccurredAt: ["Enter a valid event time no more than five minutes in the future."] } };
  }
  return {
    ok: true,
    data: { ...parsed.data, eventOccurredAt: new Date(eventTime).toISOString() },
  };
}

export function validateSubmissionEvidence(
  input: unknown,
  now: string | number | Date,
): FieldValidationResult<SubmissionEvidence> {
  const record = typeof input === "object" && input !== null ? input as Record<string, unknown> : {};
  const locality = z.string().trim().min(1, "Locality is required.").max(200, "Locality is too long.")
    .safeParse(record.locality);
  const location = parseCapturedLocation(record.location, now);
  const errors: Record<string, string[]> = {};
  if (!locality.success) errors.locality = locality.error.issues.map((issue) => issue.message);
  if (!location.ok) Object.assign(errors, location.fieldErrors);
  if (!locality.success || !location.ok) return { ok: false, fieldErrors: errors };
  return { ok: true, data: { locality: locality.data, location: location.data } };
}
