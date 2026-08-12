import { z } from "zod";

import type { Database } from "@/lib/supabase/types";
import { toLiveStreamDto, toLiveStreamViewModel } from "./live-tv.dto.ts";
import type { LiveStreamRow } from "./live-tv.dto.ts";

const nullableHttpsUrl = z
  .union([z.null(), z.literal(""), z.url({ protocol: /^https$/u })])
  .transform((value) => value || null);

const nullableTrimmed = (maximum: number) =>
  z
    .union([z.null(), z.literal(""), z.string().trim().min(1).max(maximum)])
    .transform((value) => value || null);

const nullableUuid = z
  .union([z.null(), z.literal(""), z.uuid()])
  .transform((value) => value || null);

const nullableTimestamp = z
  .union([z.null(), z.literal(""), z.iso.datetime({ offset: true })])
  .transform((value) => value || null);

export const liveStreamPersistenceSchema = z
  .object({
    languageId: z.uuid(),
    internalName: z.string().trim().min(1).max(160),
    title: z.string().trim().min(1).max(180),
    description: z.string().trim().min(1).max(2000),
    provider: z.enum(["youtube", "hls"]),
    providerStreamId: nullableTrimmed(255),
    streamUrl: nullableHttpsUrl,
    externalWatchUrl: nullableHttpsUrl,
    posterUrl: nullableHttpsUrl,
    posterAltText: nullableTrimmed(300),
    status: z.enum(["draft", "scheduled", "live", "offline", "archived"]),
    autoplay: z.boolean().default(false),
    muted: z.boolean().default(true),
    startsAt: nullableTimestamp,
    endsAt: nullableTimestamp,
    offlineMessage: nullableTrimmed(500),
    relatedCategoryId: nullableUuid,
    relatedStoryId: nullableUuid,
    seoTitle: nullableTrimmed(180),
    seoDescription: nullableTrimmed(500),
    socialImageUrl: nullableHttpsUrl,
  })
  .superRefine((value, context) => {
    if (
      value.provider === "youtube" &&
      !/^[A-Za-z0-9_-]{11}$/u.test(value.providerStreamId ?? "")
    ) {
      context.addIssue({
        code: "custom",
        path: ["providerStreamId"],
        message: "YouTube requires a valid 11-character stream identifier.",
      });
    }
    if (value.provider === "youtube" && value.streamUrl) {
      context.addIssue({
        code: "custom",
        path: ["streamUrl"],
        message: "YouTube configuration does not store a manifest URL.",
      });
    }
    if (
      value.provider === "hls" &&
      (!value.streamUrl || !new URL(value.streamUrl).pathname.endsWith(".m3u8"))
    ) {
      context.addIssue({
        code: "custom",
        path: ["streamUrl"],
        message: "HLS requires an HTTPS m3u8 manifest URL.",
      });
    }
    if (value.provider === "hls" && value.providerStreamId) {
      context.addIssue({
        code: "custom",
        path: ["providerStreamId"],
        message: "HLS configuration does not store a provider stream identifier.",
      });
    }
    if (value.autoplay && !value.muted) {
      context.addIssue({
        code: "custom",
        path: ["muted"],
        message: "Autoplay requires muted playback.",
      });
    }
    if (value.posterUrl && !value.posterAltText) {
      context.addIssue({
        code: "custom",
        path: ["posterAltText"],
        message: "Poster alternative text is required.",
      });
    }
    if (value.status === "scheduled" && !value.startsAt) {
      context.addIssue({
        code: "custom",
        path: ["startsAt"],
        message: "A scheduled stream requires a start timestamp.",
      });
    }
    if (
      value.startsAt &&
      value.endsAt &&
      Date.parse(value.endsAt) <= Date.parse(value.startsAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "The stream end must be after its start.",
      });
    }
  });

export type LiveStreamPersistenceInput = z.input<
  typeof liveStreamPersistenceSchema
>;
export type LiveStreamPersistenceModel = z.output<
  typeof liveStreamPersistenceSchema
>;

export function mapLiveStreamWrite(
  value: LiveStreamPersistenceModel,
): Database["public"]["Tables"]["live_streams"]["Insert"] {
  return {
    language_id: value.languageId,
    internal_name: value.internalName,
    title: value.title,
    description: value.description,
    provider: value.provider,
    provider_stream_id: value.providerStreamId,
    stream_url: value.streamUrl,
    external_watch_url: value.externalWatchUrl,
    poster_url: value.posterUrl,
    poster_alt_text: value.posterAltText,
    status: value.status,
    autoplay: value.autoplay,
    muted: value.muted,
    starts_at: value.startsAt,
    ends_at: value.endsAt,
    offline_message: value.offlineMessage,
    related_category_id: value.relatedCategoryId,
    related_story_id: value.relatedStoryId,
    seo_title: value.seoTitle,
    seo_description: value.seoDescription,
    social_image_url: value.socialImageUrl,
  };
}

export function mapLiveStreamRow(row: LiveStreamRow) {
  const dto = toLiveStreamDto(row);
  return { dto, view: toLiveStreamViewModel(dto) } as const;
}

