import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(
  new URL("../../../app/[locale]/live-tv/page.tsx", import.meta.url),
  "utf8",
);
const experience = await readFile(
  new URL("../../live-tv/components/live-tv-experience.tsx", import.meta.url),
  "utf8",
);

test("localized page resolves an optional internal viewer session on the server", () => {
  assert.match(route, /getInternalBroadcastViewerSession/u);
  assert.match(route, /getLiveTvPageData/u);
  assert.match(route, /internalBroadcast/u);
  assert.doesNotMatch(route, /generateViewerToken|LIVEKIT_API_SECRET|use client/u);
});

test("internal broadcast changes only the player region and retains existing page sections", () => {
  assert.match(experience, /internalBroadcast/u);
  assert.match(experience, /<LiveViewer/u);
  assert.match(experience, /offlineFallback/u);
  assert.match(experience, /AdvertisementPlaceholder/u);
  assert.match(experience, /data\.schedule/u);
  assert.match(experience, /data\.breaking/u);
  assert.match(experience, /data\.related/u);
  assert.match(experience, /data\.latest/u);
  assert.match(experience, /buildLiveTvJsonLd/u);
  assert.match(experience, /composeLiveTvMetadata/u);
});
