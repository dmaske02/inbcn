import { z } from "zod";

import {
  mapPublicReporter,
  type PublicReporter,
} from "../reporters/public-reporter.model.ts";

const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const publicLocale = z.enum(["en", "hi", "mr"]);
const httpsUrl = z.url({ protocol: /^https$/u }).max(2_048).refine((value) => {
  const url = new URL(value);
  return !url.username && !url.password;
});
const timestamp = z.iso.datetime({ offset: true });

const publicReplayRow = z.object({
  id: z.string().regex(canonicalUuid),
  status: z.literal("published"),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().min(1).max(4_000),
  duration_seconds: z.number().positive().max(86_400),
  recording_started_at: timestamp,
  recording_ended_at: timestamp,
  published_at: timestamp,
  language_code: publicLocale,
  category_slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(100),
  category_name: z.string().trim().min(1).max(100),
  thumbnail_url: httpsUrl,
  thumbnail_alt_text: z.string().trim().min(1).max(500),
  thumbnail_width: z.number().int().positive().nullable(),
  thumbnail_height: z.number().int().positive().nullable(),
  reporter_public_slug: z.string(),
  reporter_legal_display_name: z.string(),
  reporter_avatar_url: z.string(),
  reporter_public_status: z.string(),
  reporter_home_district: z.string(),
  reporter_bio: z.string().nullable(),
  reporter_beats: z.array(z.string()),
}).strict().refine((row) =>
  Date.parse(row.recording_ended_at) >= Date.parse(row.recording_started_at),
{ message: "Replay recording window is invalid." });

export type PublicReplay = Readonly<{
  id: string;
  status: "published";
  title: string;
  description: string;
  durationSeconds: number;
  recordingStartedAt: string;
  recordingEndedAt: string;
  publishedAt: string;
  locale: "en" | "hi" | "mr";
  category: Readonly<{ slug: string; name: string }>;
  thumbnail: Readonly<{ url: string; alt: string; width: number | null; height: number | null }>;
  reporter: PublicReporter;
  playbackUrl: string;
}>;

export function isCanonicalReplayId(value: unknown): value is string {
  return typeof value === "string" && canonicalUuid.test(value);
}

export function mapPublicReplay(row: unknown): PublicReplay | null {
  const parsed = publicReplayRow.safeParse(row);
  if (!parsed.success) return null;
  const value = parsed.data;
  const reporter = mapPublicReporter({
    public_slug: value.reporter_public_slug,
    legal_display_name: value.reporter_legal_display_name,
    avatar_url: value.reporter_avatar_url,
    public_status: value.reporter_public_status,
    home_district: value.reporter_home_district,
    bio: value.reporter_bio,
    beats: value.reporter_beats,
  });
  if (!reporter) return null;
  return {
    id: value.id,
    status: "published",
    title: value.title,
    description: value.description,
    durationSeconds: value.duration_seconds,
    recordingStartedAt: value.recording_started_at,
    recordingEndedAt: value.recording_ended_at,
    publishedAt: value.published_at,
    locale: value.language_code,
    category: { slug: value.category_slug, name: value.category_name },
    thumbnail: {
      url: value.thumbnail_url,
      alt: value.thumbnail_alt_text,
      width: value.thumbnail_width,
      height: value.thumbnail_height,
    },
    reporter,
    playbackUrl: `/api/replays/${value.id}`,
  };
}
