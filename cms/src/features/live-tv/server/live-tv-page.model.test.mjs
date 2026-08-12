import assert from "node:assert/strict";
import test from "node:test";

import { composeLiveTvPageData } from "./live-tv-page.model.ts";

const labels = {
  pageTitle: "Live TV",
  live: "LIVE",
  nowPlaying: "Now Playing",
  liveNow: "Live now",
  liveUntil: (time) => `Live until ${time}`,
  scheduled: "Scheduled",
  startsAt: (time) => `Starts ${time}`,
  offline: "Offline",
  defaultOfflineMessage: "The broadcast is currently offline.",
  provider: { youtube: "YouTube broadcast", hls: "HLS broadcast" },
  sections: { breaking: "Breaking News", latest: "Latest Stories" },
  advertisement: "Advertisement",
  player: {
    play: "Play live broadcast", loading: "Loading live broadcast",
    offline: "Broadcast offline", unavailable: "Broadcast unavailable",
    unsupported: "This browser cannot play the broadcast.",
    youtubeUnavailable: "YouTube is unavailable.", hlsUnavailable: "The HLS stream is unavailable.",
  },
};

const stream = {
  id: "live-1",
  languageId: "language-en",
  internalName: "English main",
  title: "INBCN News Live",
  description: "Live reporting from the INBCN newsroom.",
  provider: "youtube",
  providerStreamId: "dQw4w9WgXcQ",
  streamUrl: null,
  externalWatchUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  posterUrl: "https://example.com/live.jpg",
  posterAltText: "INBCN newsroom",
  status: "live",
  autoplay: false,
  muted: true,
  startsAt: "2026-08-06T10:00:00.000Z",
  endsAt: null,
  offlineMessage: null,
  relatedCategoryId: null,
  relatedStoryId: null,
  seoTitle: null,
  seoDescription: null,
  socialImageUrl: null,
  createdAt: "2026-08-06T09:00:00.000Z",
  updatedAt: "2026-08-06T10:00:00.000Z",
};

const breaking = [{ id: "breaking-1", title: "Breaking headline" }];
const latest = [{ id: "latest-1", title: "Latest headline" }];

test("composition selects the effective live stream and preserves news integrations", () => {
  const data = composeLiveTvPageData({
    locale: "en",
    streams: [stream],
    breaking,
    latest,
    labels,
    now: new Date("2026-08-06T12:00:00.000Z"),
    allowedHlsHosts: ["stream.inbcn.example"],
  });
  assert.equal(data.mode, "live");
  assert.equal(data.stream?.id, "live-1");
  assert.equal(data.stream?.providerLabel, "YouTube broadcast");
  assert.equal(data.stream?.statusLabel, "Live now");
  assert.deepEqual(data.stream?.playback, {
    status: "live",
    provider: "youtube",
    providerStreamId: "dQw4w9WgXcQ",
    streamUrl: null,
    autoplay: false,
    muted: true,
    allowedHlsHosts: ["stream.inbcn.example"],
  });
  assert.deepEqual(data.breaking, breaking);
  assert.deepEqual(data.latest, latest);
  assert.equal(data.stream?.poster.src, "https://example.com/live.jpg");
  assert.equal(data.stream?.poster.unoptimized, true);
});

test("composition excludes future and expired live records", () => {
  const data = composeLiveTvPageData({
    locale: "en",
    streams: [
      { ...stream, id: "future", startsAt: "2026-08-06T13:00:00.000Z" },
      { ...stream, id: "expired", endsAt: "2026-08-06T11:00:00.000Z" },
    ],
    breaking: [],
    latest: [],
    labels,
    now: new Date("2026-08-06T12:00:00.000Z"),
  });
  assert.equal(data.mode, "offline");
  assert.equal(data.stream, null);
});

test("offline composition uses the newsroom message and earliest future programme", () => {
  const data = composeLiveTvPageData({
    locale: "en",
    streams: [
      {
        ...stream,
        id: "offline",
        status: "offline",
        offlineMessage: "We will return after the briefing.",
      },
      {
        ...stream,
        id: "later",
        status: "scheduled",
        startsAt: "2026-08-07T15:00:00.000Z",
      },
      {
        ...stream,
        id: "next",
        title: "Morning Bulletin",
        status: "scheduled",
        startsAt: "2026-08-07T08:00:00.000Z",
      },
    ],
    breaking: [],
    latest: [],
    labels,
    now: new Date("2026-08-06T12:00:00.000Z"),
  });
  assert.equal(data.mode, "offline");
  assert.equal(data.offline.message, "We will return after the briefing.");
  assert.equal(data.nextScheduled?.id, "next");
  assert.equal(data.nextScheduled?.title, "Morning Bulletin");
  assert.match(data.nextScheduled?.statusLabel ?? "", /^Starts /u);
});

test("no configured stream produces a complete offline view without empty records", () => {
  const data = composeLiveTvPageData({
    locale: "en",
    streams: [],
    breaking: [],
    latest: [],
    labels,
    now: new Date("2026-08-06T12:00:00.000Z"),
  });
  assert.equal(data.mode, "offline");
  assert.equal(data.stream, null);
  assert.equal(data.nextScheduled, null);
  assert.equal(data.offline.message, labels.defaultOfflineMessage);
  assert.equal(data.offline.poster.src, "/images/news/story-fallback.svg");
});
