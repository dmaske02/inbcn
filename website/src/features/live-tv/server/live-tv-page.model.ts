import type { HomepageStory } from "@/features/news/server/services/homepage.model";
import type { LiveStreamViewModel } from "./live-tv.types.ts";
import type { PlayerInput } from "../player/player-resolution.ts";
import { composeProgrammeSchedule, selectLiveTvRelatedStories } from "./live-tv-editorial.model.ts";

export type LiveTvPageLabels = Readonly<{
  pageTitle: string;
  live: string;
  nowPlaying: string;
  liveNow: string;
  liveUntil: (time: string) => string;
  scheduled: string;
  startsAt: (time: string) => string;
  offline: string;
  defaultOfflineMessage: string;
  provider: Readonly<{ youtube: string; hls: string }>;
  sections: Readonly<{ breaking: string; latest: string; related: string; schedule: string }>;
  schedule: Readonly<{ current: string; upcoming: string; completed: string; archive: string; offline: string }>;
  share: Readonly<{ label: string; copied: string }>;
  advertisement: string;
  player: Readonly<{
    play: string;
    loading: string;
    offline: string;
    unavailable: string;
    unsupported: string;
    youtubeUnavailable: string;
    hlsUnavailable: string;
  }>;
  playerLabel?: string;
  home?: string;
}>;

type Poster = Readonly<{ src: string; alt: string; unoptimized: boolean }>;

export type LiveTvProgramme = Readonly<{
  id: string;
  title: string;
  description: string;
  provider: LiveStreamViewModel["provider"];
  status: LiveStreamViewModel["status"];
  providerLabel: string;
  statusLabel: string;
  poster: Poster;
  playback: PlayerInput;
  startsAt: string | null;
  endsAt: string | null;
  relatedStoryId: string | null;
  relatedCategoryId: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  socialImageUrl: string | null;
}>;

export type LiveTvPageViewModel = Readonly<{
  locale: string;
  mode: "live" | "offline";
  labels: LiveTvPageLabels;
  stream: LiveTvProgramme | null;
  offline: Readonly<{ message: string; poster: Poster }>;
  nextScheduled: LiveTvProgramme | null;
  breaking: readonly HomepageStory[];
  latest: readonly HomepageStory[];
  related: readonly HomepageStory[];
  schedule: readonly (LiveTvProgramme & Readonly<{ state: "archive" | "completed" | "current" | "upcoming" | "offline"; isCurrent: boolean; timeLabel: string }>)[];
}>;

const FALLBACK_POSTER = "/images/news/story-fallback.svg";

function posterFor(
  stream: LiveStreamViewModel | null,
  fallbackAlt: string,
): Poster {
  if (stream?.posterUrl) {
    try {
      const url = new URL(stream.posterUrl);
      if (url.protocol === "https:") {
        return {
          src: stream.posterUrl,
          alt: stream.posterAltText ?? fallbackAlt,
          unoptimized: url.hostname !== "res.cloudinary.com",
        };
      }
    } catch {
      // Persistence validation normally prevents invalid URLs; use the safe fallback.
    }
  }
  return { src: FALLBACK_POSTER, alt: fallbackAlt, unoptimized: true };
}

function programme(
  stream: LiveStreamViewModel,
  statusLabel: string,
  labels: LiveTvPageLabels,
  allowedHlsHosts: readonly string[],
): LiveTvProgramme {
  return {
    id: stream.id,
    title: stream.title,
    description: stream.description,
    provider: stream.provider,
    status: stream.status,
    providerLabel: labels.provider[stream.provider],
    statusLabel,
    poster: posterFor(stream, stream.title),
    playback: {
      status: stream.status,
      provider: stream.provider,
      providerStreamId: stream.providerStreamId,
      streamUrl: stream.streamUrl,
      autoplay: stream.autoplay,
      muted: stream.muted,
      allowedHlsHosts,
    },
    startsAt: stream.startsAt,
    endsAt: stream.endsAt,
    relatedStoryId: stream.relatedStoryId,
    relatedCategoryId: stream.relatedCategoryId,
    seoTitle: stream.seoTitle,
    seoDescription: stream.seoDescription,
    socialImageUrl: stream.socialImageUrl,
  };
}

function isEffectiveLive(stream: LiveStreamViewModel, now: number): boolean {
  return (
    stream.status === "live" &&
    (!stream.startsAt || Date.parse(stream.startsAt) <= now) &&
    (!stream.endsAt || Date.parse(stream.endsAt) > now)
  );
}

function formatDateTime(locale: string, value: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function composeLiveTvPageData({
  locale,
  streams,
  breaking,
  latest,
  allStories = latest,
  labels,
  now = new Date(),
  allowedHlsHosts = [],
}: Readonly<{
  locale: string;
  streams: readonly LiveStreamViewModel[];
  breaking: readonly HomepageStory[];
  latest: readonly HomepageStory[];
  allStories?: readonly HomepageStory[];
  labels: LiveTvPageLabels;
  now?: Date;
  allowedHlsHosts?: readonly string[];
}>): LiveTvPageViewModel {
  const nowTime = now.getTime();
  const active = streams
    .filter((item) => isEffectiveLive(item, nowTime))
    .toSorted(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    )[0] ?? null;
  const offlineConfiguration = streams
    .filter((item) => item.status === "offline")
    .toSorted(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    )[0] ?? null;
  const scheduled = streams
    .filter(
      (item) =>
        item.status === "scheduled" &&
        Boolean(item.startsAt) &&
        Date.parse(item.startsAt ?? "") > nowTime,
    )
    .toSorted(
      (left, right) =>
        Date.parse(left.startsAt ?? "") - Date.parse(right.startsAt ?? ""),
    )[0] ?? null;
  const posterSource = offlineConfiguration ?? scheduled;
  const scheduleLabels = labels.schedule ?? {
    current: labels.liveNow,
    upcoming: labels.scheduled,
    completed: labels.offline,
    archive: labels.offline,
    offline: labels.offline,
  };
  const schedule = composeProgrammeSchedule(streams, now).map((item) => ({
    ...programme(item, scheduleLabels[item.state], labels, allowedHlsHosts),
    state: item.state,
    isCurrent: item.isCurrent,
    timeLabel: item.startsAt ? formatDateTime(locale, item.startsAt) : "",
  }));
  const relationshipSource = active ?? scheduled ?? offlineConfiguration;

  return {
    locale,
    mode: active ? "live" : "offline",
    labels,
    stream: active
      ? programme(
          active,
          active.endsAt
            ? labels.liveUntil(formatDateTime(locale, active.endsAt))
            : labels.liveNow,
          labels,
          allowedHlsHosts,
        )
      : null,
    offline: {
      message:
        offlineConfiguration?.offlineMessage ?? labels.defaultOfflineMessage,
      poster: posterFor(posterSource, labels.pageTitle),
    },
    nextScheduled: scheduled
      ? programme(
          scheduled,
          labels.startsAt(formatDateTime(locale, scheduled.startsAt ?? "")),
          labels,
          allowedHlsHosts,
        )
      : null,
    breaking,
    latest,
    related: selectLiveTvRelatedStories(
      allStories,
      relationshipSource?.relatedStoryId ?? null,
      relationshipSource?.relatedCategoryId ?? null,
      4,
    ),
    schedule,
  };
}
