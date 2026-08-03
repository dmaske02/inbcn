import assert from "node:assert/strict";
import test from "node:test";

import { composeHomepageData } from "./homepage.model.ts";

const categories = [
  { id: "national-id", languageId: "en-id", parentId: null, name: "National", slug: "national", description: null, sortOrder: 10 },
  { id: "world-id", languageId: "en-id", parentId: null, name: "World", slug: "world", description: null, sortOrder: 20 },
];

function story(overrides) {
  return {
    id: overrides.id,
    translationGroupId: `${overrides.id}-translations`,
    languageId: "en-id",
    categoryId: overrides.categoryId ?? "national-id",
    sourceId: null,
    type: "staff_article",
    slug: overrides.id,
    title: overrides.title ?? overrides.id,
    summary: `${overrides.id} summary`,
    featuredMediaId: overrides.featuredMediaId ?? null,
    featuredMedia: overrides.featuredMedia ?? null,
    externalImageUrl: overrides.externalImageUrl ?? null,
    isFeatured: overrides.isFeatured ?? false,
    isBreaking: overrides.isBreaking ?? false,
    isSponsored: false,
    publishedAt: overrides.publishedAt,
  };
}

const stories = [
  story({ id: "newest", publishedAt: "2026-07-31T10:00:00.000Z", isBreaking: true }),
  story({ id: "featured", publishedAt: "2026-07-31T09:00:00.000Z", isFeatured: true, categoryId: "world-id" }),
  story({ id: "older-featured", publishedAt: "2026-07-31T08:00:00.000Z", isFeatured: true }),
  story({ id: "oldest", publishedAt: "2026-07-31T07:00:00.000Z" }),
];

test("composes hero, editorial collections, and category groups from locale stories", () => {
  const result = composeHomepageData("en", stories, categories);

  assert.equal(result.hero?.id, "featured");
  assert.deepEqual(result.latest.map(({ id }) => id), ["newest", "older-featured", "oldest"]);
  assert.deepEqual(result.editorsPicks.map(({ id }) => id), ["older-featured"]);
  assert.deepEqual(result.trending.map(({ id }) => id), ["newest", "featured", "older-featured", "oldest"]);
  assert.deepEqual(result.sections.national.stories.map(({ id }) => id), ["newest", "older-featured", "oldest"]);
  assert.deepEqual(result.sections.world.stories.map(({ id }) => id), ["featured"]);
  assert.equal(result.sections.opinion.category, null);
});

test("uses the latest story as hero and assigns the stable fallback image", () => {
  const result = composeHomepageData("hi", [stories[0]], categories);

  assert.equal(result.hero?.id, "newest");
  assert.equal(result.hero?.href, "/hi/story/newest");
  assert.equal(result.hero?.image.src, "/images/news/story-fallback.svg");
  assert.equal(result.signal?.id, "newest");
});

test("uses a provider image when a story has no Cloudinary media", () => {
  const externalImageUrl = "https://provider.example/homepage-story.jpg";
  const result = composeHomepageData(
    "en",
    [story({ id: "external", publishedAt: "2026-08-02T10:00:00.000Z", externalImageUrl })],
    categories,
    "inbcn",
  );

  assert.equal(result.hero?.image.src, externalImageUrl);
});

test("returns a complete empty homepage model when no stories exist", () => {
  const result = composeHomepageData("mr", [], categories);

  assert.equal(result.hero, null);
  assert.equal(result.signal, null);
  assert.deepEqual(result.latest, []);
  assert.deepEqual(result.editorsPicks, []);
  assert.deepEqual(result.trending, []);
  assert.deepEqual(result.sections.opinion.stories, []);
});
