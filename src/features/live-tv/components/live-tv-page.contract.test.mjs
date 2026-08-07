import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../../../app/[locale]/live-tv/page.tsx", import.meta.url);
const experienceUrl = new URL("./live-tv-experience.tsx", import.meta.url);
const playerUrl = new URL("../player/live-tv-player.tsx", import.meta.url);
const storySectionUrl = new URL("./live-tv-story-section.tsx", import.meta.url);

test("localized route is server-rendered through the single page-data service", async () => {
  const source = await readFile(pageUrl, "utf8");
  assert.match(source, /getLiveTvPageData\(locale\)/u);
  assert.match(source, /<LiveTvExperience/u);
  assert.match(source, /setRequestLocale\(locale\)/u);
  assert.doesNotMatch(source, /createClient|supabase|use client|useEffect|fetch\(/u);
  assert.match(source, /generateMetadata/u);
});

test("public experience delegates playback to the isolated player and preserves the premium offline branch", async () => {
  const source = `${await readFile(experienceUrl, "utf8")}\n${await readFile(playerUrl, "utf8")}`;
  assert.match(source, /aspect-video/u);
  assert.match(source, /data\.mode === "live"/u);
  assert.match(source, /data\.offline/u);
  assert.match(source, /data\.nextScheduled/u);
  assert.match(source, /LiveTvPlayer/u);
  assert.match(source, /AdvertisementPlaceholder/u);
  assert.doesNotMatch(await readFile(experienceUrl, "utf8"), /<iframe|<video|hls\.js|youtube-player|use client/u);
});

test("breaking and latest sections render existing story view models without direct repositories", async () => {
  const source = `${await readFile(experienceUrl, "utf8")}\n${await readFile(storySectionUrl, "utf8")}`;
  assert.match(source, /data\.breaking/u);
  assert.match(source, /data\.latest/u);
  assert.match(source, /StoryCard/u);
  assert.doesNotMatch(source, /stories\.repository|getStories|createClient/u);
});
