import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLiveTvJsonLd,
  composeLiveTvMetadata,
  composeProgrammeSchedule,
  selectLiveTvRelatedStories,
} from "./live-tv-editorial.model.ts";

const item = (id, status, startsAt, endsAt) => ({
  id,
  title: id,
  description: `${id} description`,
  status,
  startsAt,
  endsAt,
  relatedStoryId: id === "current" ? "story-2" : null,
  relatedCategoryId: id === "current" ? "category-1" : null,
});

test("schedule derives completed, current, upcoming, and archive states from time and channel status", () => {
  const schedule = composeProgrammeSchedule(
    [
      item("completed", "scheduled", "2026-08-06T08:00:00Z", "2026-08-06T09:00:00Z"),
      item("current", "live", "2026-08-06T09:00:00Z", "2026-08-06T10:00:00Z"),
      item("upcoming", "scheduled", "2026-08-06T10:00:00Z", "2026-08-06T11:00:00Z"),
      item("archive", "archived", "2026-08-05T10:00:00Z", "2026-08-05T11:00:00Z"),
    ],
    new Date("2026-08-06T09:30:00Z"),
  );
  assert.deepEqual(schedule.map(({ id, state }) => [id, state]), [
    ["archive", "archive"],
    ["completed", "completed"],
    ["current", "current"],
    ["upcoming", "upcoming"],
  ]);
  assert.equal(schedule.find(({ id }) => id === "current")?.isCurrent, true);
});

test("metadata includes canonical, localized alternates, OpenGraph and Twitter imagery", () => {
  const metadata = composeLiveTvMetadata({
    siteUrl: "https://inbcn.example",
    locale: "hi",
    locales: ["en", "hi", "mr"],
    title: "लाइव टीवी",
    description: "लाइव समाचार",
    imageUrl: "/live.jpg",
  });
  assert.equal(metadata.canonical, "https://inbcn.example/hi/live-tv");
  assert.equal(metadata.languages.en, "https://inbcn.example/en/live-tv");
  assert.equal(metadata.languages["x-default"], "https://inbcn.example/en/live-tv");
  assert.deepEqual(metadata.openGraph.images, ["https://inbcn.example/live.jpg"]);
  assert.equal(metadata.twitter.card, "summary_large_image");
});

test("structured data describes breadcrumbs and a scheduled live broadcast", () => {
  const result = buildLiveTvJsonLd({
    canonical: "https://inbcn.example/en/live-tv",
    homeUrl: "https://inbcn.example/en",
    pageTitle: "Live TV",
    description: "Live news",
    imageUrl: "https://inbcn.example/live.jpg",
    programme: item("current", "live", "2026-08-06T09:00:00Z", "2026-08-06T10:00:00Z"),
    embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  });
  assert.equal(result.breadcrumb["@type"], "BreadcrumbList");
  assert.equal(result.video["@type"], "VideoObject");
  assert.equal(result.video.publication[0]["@type"], "BroadcastEvent");
  assert.equal(result.video.publication[0].isLiveBroadcast, true);
  assert.equal(result.video.embedUrl, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
});

test("offline structured data omits synthetic video records", () => {
  const result = buildLiveTvJsonLd({
    canonical: "https://inbcn.example/en/live-tv",
    homeUrl: "https://inbcn.example/en",
    pageTitle: "Live TV",
    description: "Live news",
    imageUrl: "https://inbcn.example/live.jpg",
    programme: null,
  });
  assert.equal(result.video, null);
});

test("related stories prioritize the configured story, then category, without duplicates", () => {
  const stories = [
    { id: "story-1", categoryId: "category-1" },
    { id: "story-2", categoryId: "category-2" },
    { id: "story-3", categoryId: "category-1" },
  ];
  assert.deepEqual(
    selectLiveTvRelatedStories(stories, "story-2", "category-1", 3).map(({ id }) => id),
    ["story-2", "story-1", "story-3"],
  );
});
