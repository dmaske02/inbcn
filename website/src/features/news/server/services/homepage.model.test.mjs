import assert from "node:assert/strict";
import test from "node:test";

import { composeHomepageData } from "./homepage.model.ts";

const categories = [
  { id: "national-id", languageId: "en-id", parentId: null, name: "National", slug: "national", description: null, sortOrder: 10 },
  { id: "world-id", languageId: "en-id", parentId: null, name: "World", slug: "world", description: null, sortOrder: 20 },
];

function story(id, index, overrides = {}) {
  return {
    id, translationGroupId: `${id}-translations`, languageId: "en-id",
    categoryId: overrides.categoryId ?? (index % 2 ? "world-id" : "national-id"),
    sourceId: null, type: "staff_article", slug: id, title: overrides.title ?? id,
    summary: `${id} summary`,
    featuredMediaId: overrides.featuredMediaId ?? null,
    featuredMedia: overrides.featuredMedia ?? null,
    externalImageUrl: overrides.externalImageUrl ?? null,
    isFeatured: overrides.isFeatured ?? false, isBreaking: overrides.isBreaking ?? false,
    isSponsored: false, publishedAt: new Date(Date.UTC(2026, 6, 31, 20 - index)).toISOString(),
  };
}

const stories = Array.from({ length: 18 }, (_, index) => story(`story-${index}`, index, {
  isFeatured: index === 1 || index === 4,
  isBreaking: index === 0 || index === 2,
}));

test("uses the newest published story as hero when no story is manually featured", () => {
  const unfeatured = Array.from({ length: 8 }, (_, index) =>
    story(`latest-${index}`, index),
  );

  const result = composeHomepageData("en", unfeatured, categories);

  assert.equal(result.featured?.id, "latest-0");
  assert.equal(result.featured?.image.src, "/images/news/story-fallback.svg");
});

test("allocates the next two newest stories to the hero side rail without duplication", () => {
  const unfeatured = Array.from({ length: 10 }, (_, index) =>
    story(`latest-${index}`, index),
  );

  const result = composeHomepageData("en", unfeatured, categories);

  assert.deepEqual(result.editorPicks.map(({ id }) => id), ["latest-1", "latest-2"]);
  assert.deepEqual(result.topHeadlines.map(({ id }) => id), ["latest-3", "latest-4", "latest-5"]);
  const visibleIds = [
    result.featured.id,
    ...result.editorPicks.map(({ id }) => id),
    ...result.topHeadlines.map(({ id }) => id),
    ...result.trending.map(({ id }) => id),
    ...result.latest.map(({ id }) => id),
    ...result.categoryRails.flatMap(({ stories: items }) => items.map(({ id }) => id)),
  ];
  assert.equal(new Set(visibleIds).size, visibleIds.length);
});

test("allocates mutually exclusive homepage collections in editorial priority order", () => {
  const pinned = { id: "alert-1", title: "District warning", message: "Official advisory", placement: "pinned_banner", dismissible: true };
  const result = composeHomepageData("en", stories, categories, undefined, [pinned]);

  assert.equal(result.featured?.id, "story-1");
  assert.deepEqual(result.breaking.map(({ id }) => id), ["story-0", "story-2"]);
  assert.deepEqual(result.topHeadlines.map(({ id }) => id), ["story-3", "story-4", "story-5"]);
  assert.deepEqual(result.trending.map(({ id }) => id), ["story-6", "story-7", "story-8"]);
  assert.equal(result.pinnedAlert?.id, "alert-1");

  const ids = [
    result.featured?.id,
    ...result.topHeadlines.map(({ id }) => id),
    ...result.trending.map(({ id }) => id),
    ...result.categoryRails.flatMap(({ stories: items }) => items.map(({ id }) => id)),
    ...result.latest.map(({ id }) => id),
    ...result.editorPicks.map(({ id }) => id),
  ].filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
});

test("hides categories with no remaining stories and returns a complete empty snapshot", () => {
  const empty = composeHomepageData("mr", [], categories, undefined, []);
  assert.equal(empty.featured, null);
  assert.deepEqual(empty.breaking, []);
  assert.equal(empty.pinnedAlert, null);
  assert.deepEqual(empty.topHeadlines, []);
  assert.deepEqual(empty.trending, []);
  assert.deepEqual(empty.categoryRails, []);
  assert.deepEqual(empty.latest, []);
  assert.deepEqual(empty.editorPicks, []);
});

test("uses only pinned-banner alerts and the provider image when media is absent", () => {
  const externalImageUrl = "https://provider.example/homepage-story.jpg";
  const input = [story("featured", 0, { isFeatured: true, externalImageUrl })];
  const alerts = [
    { id: "ticker", title: "Ticker", message: "Ticker message", placement: "breaking_ticker", dismissible: false },
    { id: "pinned", title: "Pinned", message: "Pinned message", placement: "pinned_banner", dismissible: true },
  ];
  const result = composeHomepageData("en", input, categories, "inbcn", alerts);
  assert.equal(result.featured?.image.src, externalImageUrl);
  assert.equal(result.pinnedAlert?.id, "pinned");
});

test("maps canonical media supplied by the public projection into hero and editor-pick images", () => {
  const featuredMedia = {
    publicId: "inbcn/reporter/story/story-hero/image-object",
    secureUrl: "https://res.cloudinary.com/inbcn/image/upload/story-hero.jpg",
    altText: "Submitted hero image",
    caption: null,
    width: 1200,
    height: 675,
  };
  const input = [
    story("story-hero", 0, {
      isFeatured: true,
      featuredMediaId: "hero-media-id",
      featuredMedia,
    }),
    story("story-editor", 1, {
      featuredMediaId: "editor-media-id",
      featuredMedia: {
        ...featuredMedia,
        publicId: "inbcn/reporter/story/story-editor/image-object",
        altText: "Submitted editor image",
      },
    }),
  ];

  const result = composeHomepageData("en", input, categories, "inbcn");

  assert.equal(
    result.featured?.image.src,
    "https://res.cloudinary.com/inbcn/image/upload/f_auto,q_auto/inbcn/reporter/story/story-hero/image-object",
  );
  assert.equal(result.featured?.image.alt, "Submitted hero image");
  assert.equal(
    result.editorPicks[0]?.image.src,
    "https://res.cloudinary.com/inbcn/image/upload/f_auto,q_auto/inbcn/reporter/story/story-editor/image-object",
  );
  assert.equal(result.editorPicks[0]?.image.alt, "Submitted editor image");
});

test("selects the newest active pinned alert from the service snapshot", () => {
  const alerts = [
    { id: "older", title: "Older", message: "Older message", placement: "pinned_banner", dismissible: true, startAt: "2026-08-03T10:00:00.000Z" },
    { id: "newer", title: "Newer", message: "Newer message", placement: "pinned_banner", dismissible: true, startAt: "2026-08-04T10:00:00.000Z" },
  ];
  assert.equal(composeHomepageData("en", [], categories, undefined, alerts).pinnedAlert?.id, "newer");
});
