import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../../../app/[locale]/live-tv/page.tsx", import.meta.url);
const experienceUrl = new URL("./live-tv-experience.tsx", import.meta.url);
const playerUrl = new URL("../player/live-tv-player.tsx", import.meta.url);
const storySectionUrl = new URL("./live-tv-story-section.tsx", import.meta.url);
const cssUrl = new URL("../../../app/globals.css", import.meta.url);

test("localized route is server-rendered through the single page-data service", async () => {
  const source = await readFile(pageUrl, "utf8");
  assert.match(source, /getLiveTvPageData\(locale\)/u);
  assert.match(source, /<LiveTvExperience/u);
  assert.match(source, /setRequestLocale\(locale\)/u);
  assert.doesNotMatch(source, /createClient|supabase|use client|useEffect|fetch\(/u);
  assert.match(source, /generateMetadata/u);
});

test("public experience delegates playback to the isolated player and preserves the premium offline branch", async () => {
  const experience = await readFile(experienceUrl, "utf8");
  const source = `${experience}\n${await readFile(playerUrl, "utf8")}`;
  assert.match(source, /aspect-video/u);
  assert.match(source, /data\.mode === "live"/u);
  assert.match(source, /data\.offline/u);
  assert.match(source, /data\.nextScheduled/u);
  assert.match(source, /LiveTvPlayer/u);
  assert.match(source, /EditorialSponsorRow/u);
  assert.doesNotMatch(experience, /AdvertisementPlaceholder|<iframe|<video|hls\.js|youtube-player|use client/u);
});

test("player and schedule share the inverted editorial briefing boundary", async () => {
  const [experience, css] = await Promise.all([
    readFile(experienceUrl, "utf8"),
    readFile(cssUrl, "utf8"),
  ]);

  assert.match(
    experience,
    /className="editorial-live-briefing"[\s\S]*aria-labelledby="live-broadcast-title"[\s\S]*aria-labelledby="live-tv-schedule-title"/u,
  );
  assert.match(css, /--editorial-inverted:\s*oklch\(17% 0\.018 70\)/u);
  assert.match(css, /\.editorial-live-briefing\s*\{[^}]*background:\s*var\(--editorial-inverted\)/su);
  assert.match(css, /\.editorial-live-programme\s*\{[^}]*grid-template-columns:/su);
});

test("breaking, related, and latest sections render existing stories as ledger rows", async () => {
  const source = `${await readFile(experienceUrl, "utf8")}\n${await readFile(storySectionUrl, "utf8")}`;
  assert.match(source, /data\.breaking/u);
  assert.match(source, /data\.related/u);
  assert.match(source, /data\.latest/u);
  assert.match(source, /LedgerStoryRow/u);
  assert.match(source, /EditorialSectionHeader/u);
  assert.doesNotMatch(source, /StoryCard/u);
  assert.doesNotMatch(source, /stories\.repository|getStories|createClient/u);
});
