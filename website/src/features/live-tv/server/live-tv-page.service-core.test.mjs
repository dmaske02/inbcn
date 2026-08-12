import assert from "node:assert/strict";
import test from "node:test";

import { createLiveTvPageDataService } from "./live-tv-page.service-core.ts";

test("page service composes localized streams and homepage news through one entry", async () => {
  const calls = [];
  const service = createLiveTvPageDataService({
    getStreams: async (locale) => (calls.push(["streams", locale]), []),
    getNews: async (locale) =>
      (calls.push(["news", locale]), { breaking: [{ id: "b1" }], latest: [{ id: "l1" }] }),
    getLabels: async (locale) =>
      (calls.push(["labels", locale]), {
        pageTitle: "Live TV", live: "LIVE", nowPlaying: "Now Playing",
        liveNow: "Live now", liveUntil: (time) => `Live until ${time}`,
        scheduled: "Scheduled", startsAt: (time) => `Starts ${time}`,
        offline: "Offline", defaultOfflineMessage: "Offline",
        provider: { youtube: "YouTube", hls: "HLS" },
        sections: { breaking: "Breaking", latest: "Latest" }, advertisement: "Advertisement",
        player: { play: "Play", loading: "Loading", offline: "Offline", unavailable: "Unavailable", unsupported: "Unsupported", youtubeUnavailable: "YouTube unavailable", hlsUnavailable: "HLS unavailable" },
      }),
    now: () => new Date("2026-08-06T12:00:00.000Z"),
  });
  const result = await service("hi");
  assert.deepEqual(calls, [["streams", "hi"], ["news", "hi"], ["labels", "hi"]]);
  assert.equal(result.locale, "hi");
  assert.deepEqual(result.breaking, [{ id: "b1" }]);
  assert.deepEqual(result.latest, [{ id: "l1" }]);
});

test("page service degrades missing stream persistence to the offline state", async () => {
  const service = createLiveTvPageDataService({
    getStreams: async () => { throw new Error("live_streams is unavailable"); },
    getNews: async () => ({ breaking: [], latest: [] }),
    getLabels: async () => ({
      pageTitle: "Live TV", live: "LIVE", nowPlaying: "Now Playing",
      liveNow: "Live now", liveUntil: (time) => `Live until ${time}`,
      scheduled: "Scheduled", startsAt: (time) => `Starts ${time}`,
      offline: "Offline", defaultOfflineMessage: "Offline",
      provider: { youtube: "YouTube", hls: "HLS" },
      sections: { breaking: "Breaking", latest: "Latest" }, advertisement: "Advertisement",
      player: { play: "Play", loading: "Loading", offline: "Offline", unavailable: "Unavailable", unsupported: "Unsupported", youtubeUnavailable: "YouTube unavailable", hlsUnavailable: "HLS unavailable" },
    }),
    now: () => new Date("2026-08-06T12:00:00.000Z"),
  });
  const result = await service("en");
  assert.equal(result.mode, "offline");
  assert.equal(result.stream, null);
});

test("page service keeps Live TV available when secondary news rails fail", async () => {
  const service = createLiveTvPageDataService({
    getStreams: async () => [],
    getNews: async () => { throw new Error("stories unavailable"); },
    getLabels: async () => ({
      pageTitle: "Live TV", live: "LIVE", nowPlaying: "Now Playing",
      liveNow: "Live now", liveUntil: (time) => `Live until ${time}`,
      scheduled: "Scheduled", startsAt: (time) => `Starts ${time}`,
      offline: "Offline", defaultOfflineMessage: "Offline",
      provider: { youtube: "YouTube", hls: "HLS" },
      sections: { breaking: "Breaking", latest: "Latest" }, advertisement: "Advertisement",
      player: { play: "Play", loading: "Loading", offline: "Offline", unavailable: "Unavailable", unsupported: "Unsupported", youtubeUnavailable: "YouTube unavailable", hlsUnavailable: "HLS unavailable" },
    }),
  });
  const result = await service("en");
  assert.deepEqual(result.breaking, []);
  assert.deepEqual(result.latest, []);
  assert.deepEqual(result.related, []);
});
