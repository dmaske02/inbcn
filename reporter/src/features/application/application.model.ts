import { isAtLeast18 as calendarAdult } from "@inbcn/domain";
import { z } from "zod";

export {
  canTransitionApplication,
  getApplicationDeadline,
  isAtLeast18,
  reporterApplicationStatuses,
  type ReporterApplicationStatus,
} from "@inbcn/domain";

const applicationSchema = z.object({
  legalName: z.string().trim().min(2).max(120),
  legalNameDeclared: z.literal(true),
  dateOfBirth: z.iso.date(),
  age18Declared: z.literal(true),
  homeCity: z.string().trim().min(2).max(100),
  homeDistrict: z.string().trim().min(2).max(100),
  homeState: z.string().trim().min(2).max(100),
  bio: z.string().trim().max(500),
  beats: z.array(z.string().trim().min(1).max(50)).min(1).max(12)
    .transform((beats) => [...new Set(beats)]),
});

export type ReporterApplicationFields = Readonly<{
  legalName: string;
  dateOfBirth: string;
  age18Declared: true;
  homeCity: string;
  homeDistrict: string;
  homeState: string;
  bio: string;
  beats: readonly string[];
}>;

export type ReporterApplicationValidation =
  | Readonly<{ ok: true; data: ReporterApplicationFields }>
  | Readonly<{ ok: false; fieldErrors: Readonly<Record<string, string[]>> }>;

export function validateReporterApplication(
  input: unknown,
  today: string,
): ReporterApplicationValidation {
  const parsed = applicationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  if (!calendarAdult(parsed.data.dateOfBirth, today)) {
    return { ok: false, fieldErrors: { dateOfBirth: ["Applicants must be at least 18 years old."] } };
  }
  const { legalNameDeclared: _, ...data } = parsed.data;
  void _;
  return { ok: true, data };
}
