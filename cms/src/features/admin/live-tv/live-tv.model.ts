import { z } from "zod";

import type { AdminRole } from "../auth/authorization.model.ts";
import { validateProviderConfiguration } from "../../live-tv/providers/provider-registry.ts";
import type { LiveStreamOperationalState } from "../../live-tv/providers/provider-policy.ts";
import type { LiveStreamProvider } from "../../live-tv/providers/provider-types.ts";

const nullableText = (maximum: number) =>
  z.union([z.null(), z.literal(""), z.string().trim().min(1).max(maximum)]).transform((value) => value || null);
const nullableUuid = z.union([z.null(), z.literal(""), z.uuid("Select a valid option.")]).transform((value) => value || null);
const nullableHttpsUrl = z
  .union([z.null(), z.literal(""), z.url("Enter a valid URL.")])
  .refine((value) => !value || new URL(value).protocol === "https:", "Use an HTTPS URL.")
  .transform((value) => value || null);
const scheduleTimestamp = (value: string) =>
  new Date(/[zZ]|[+-]\d{2}:\d{2}$/u.test(value) ? value : `${value}Z`);
const nullableTimestamp = z
  .union([z.null(), z.literal(""), z.string().trim().min(1)])
  .refine((value) => !value || !Number.isNaN(scheduleTimestamp(value).getTime()), "Enter a valid date and time.")
  .transform((value) => value ? scheduleTimestamp(value).toISOString() : null);

export const liveTvFormSchema = z
  .object({
    languageId: z.uuid("Select a language."),
    streamTitle: z.string().trim().min(1, "Stream title is required.").max(160),
    shortDescription: z.string().trim().min(1, "Short description is required.").max(500),
    provider: z.enum(["youtube", "hls"], { message: "Select a supported provider." }),
    providerUrl: z.string().trim().min(1, "Provider URL is required."),
    status: z.enum(["draft", "scheduled", "live", "offline", "archived"]),
    posterUrl: nullableHttpsUrl,
    posterAltText: nullableText(300),
    autoplay: z.boolean(),
    muted: z.boolean(),
    currentProgramme: z.string().trim().min(1, "Current programme is required.").max(180),
    programmeDescription: z.string().trim().min(1, "Programme description is required.").max(2000),
    scheduleStart: nullableTimestamp,
    scheduleEnd: nullableTimestamp,
    relatedStoryId: nullableUuid,
    relatedCategoryId: nullableUuid,
    seoTitle: nullableText(180),
    seoDescription: nullableText(500),
    openGraphImageUrl: nullableHttpsUrl,
    canonicalUrl: nullableHttpsUrl,
  })
  .superRefine((value, context) => {
    if (value.posterUrl && !value.posterAltText) {
      context.addIssue({ code: "custom", path: ["posterAltText"], message: "Alternative text is required for the poster image." });
    }
    if (value.autoplay && !value.muted) {
      context.addIssue({ code: "custom", path: ["muted"], message: "Autoplay requires muted playback." });
    }
    if (value.status === "scheduled" && !value.scheduleStart) {
      context.addIssue({ code: "custom", path: ["scheduleStart"], message: "A scheduled stream requires a start time." });
    }
    if (value.scheduleStart && value.scheduleEnd && Date.parse(value.scheduleEnd) <= Date.parse(value.scheduleStart)) {
      context.addIssue({ code: "custom", path: ["scheduleEnd"], message: "Schedule end must be after schedule start." });
    }
  });

export type LiveTvFormInput = z.input<typeof liveTvFormSchema>;
export type LiveTvFormValues = z.output<typeof liveTvFormSchema>;

export function canManageLiveTv(role: AdminRole): boolean {
  return role === "editor" || role === "admin";
}

export function canRemoveLiveTv(role: AdminRole): boolean {
  return role === "admin";
}

export function parseLiveTvProviderConfiguration(
  input: Pick<LiveTvFormInput, "provider" | "providerUrl" | "autoplay" | "muted">,
  allowedHlsHosts: readonly string[],
) {
  const configuration = validateProviderConfiguration(
    {
      provider: input.provider as LiveStreamProvider,
      source: input.providerUrl,
      autoplay: input.autoplay,
      muted: input.muted,
    },
    { allowedHosts: { hls: allowedHlsHosts } },
  );

  return {
    provider: configuration.provider,
    providerStreamId: configuration.provider === "youtube" ? configuration.videoId : null,
    streamUrl: configuration.provider === "hls" ? configuration.manifestUrl : null,
    externalWatchUrl: configuration.externalWatchUrl,
    autoplay: configuration.autoplay,
    muted: configuration.muted,
  } satisfies Readonly<{
    provider: LiveStreamProvider;
    providerStreamId: string | null;
    streamUrl: string | null;
    externalWatchUrl: string | null;
    autoplay: boolean;
    muted: boolean;
  }>;
}

export function providerUrlFromRecord(record: Readonly<{
  provider: LiveStreamProvider;
  providerStreamId: string | null;
  streamUrl: string | null;
}>): string {
  return record.provider === "youtube" && record.providerStreamId
    ? `https://www.youtube.com/watch?v=${record.providerStreamId}`
    : record.streamUrl ?? "";
}

export type ManagedLiveTvIdentity = Readonly<{ id: string; role: AdminRole }>;
export type ManagedLiveTvStatus = LiveStreamOperationalState;
