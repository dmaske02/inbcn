import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArticleJsonLd,
  buildPublicStoryUrl,
  calculateReadTime,
  composeArticleSidebar,
  composeInlineRelated,
  composeStoryMetadata,
  formatPublicAuthor,
  getHeroImagePresentation,
  resolvePublicStoryImage,
  selectAdjacentStories,
  selectRelatedStories,
  splitStoryBody,
} from "./story-reader.model.ts";

const publishedStory = (id, hours, overrides = {}) => ({
  id,
  publishedAt: new Date(Date.UTC(2026, 7, 1, hours)).toISOString(),
  isBreaking: false,
  isFeatured: false,
  ...overrides,
});

test("uses external author and falls back to the localized news desk", () => {
  assert.equal(formatPublicAuthor("Reuters", "INBCN News Desk"), "Reuters");
  assert.equal(formatPublicAuthor("  ", "INBCN समाचार डेस्क"), "INBCN समाचार डेस्क");
});

test("builds localized story URLs and calculates 200-WPM read time", () => {
  assert.equal(buildPublicStoryUrl("hi", "major-update"), "/hi/story/major-update");
  assert.equal(calculateReadTime(Array.from({length: 201}, (_, index) => `word${index}`).join(" ")), 2);
});

test("selects Cloudinary media before an external image and the fallback", () => {
  const featuredMedia = {
    publicId: "inbcn/story-image",
    secureUrl: "https://res.cloudinary.com/demo/image/upload/story-image.jpg",
    altText: "Editorial image description",
  };
  const externalImageUrl = "https://provider.example/story-image.jpg";

  assert.deepEqual(
    resolvePublicStoryImage(featuredMedia, externalImageUrl, "demo", "Story title"),
    {
      src: "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/inbcn/story-image",
      alt: "Editorial image description",
      unoptimized: false,
      width: null,
      height: null,
      aspectRatio: null,
    },
  );
  assert.deepEqual(
    resolvePublicStoryImage(null, externalImageUrl, "demo", "Story title"),
    { src: externalImageUrl, alt: "Story title", unoptimized: true, width: null, height: null, aspectRatio: null },
  );
  assert.deepEqual(
    resolvePublicStoryImage(null, null, "demo", "Story title"),
    {
      src: "/images/news/story-fallback.svg",
      alt: "Story title",
      unoptimized: false,
      width: null,
      height: null,
      aspectRatio: null,
    },
  );
});

test("selects four related stories excluding the current story", () => {
  const stories = ["current", "one", "two", "three", "four", "five"].map((id) => ({ id }));
  assert.deepEqual(selectRelatedStories("current", stories).map((story) => story.id), ["one", "two", "three", "four"]);
});

test("keeps a valid remote image after an availability check", async () => {
  const { resolveAvailablePublicStoryImage } = await import("./public-story.mjs");
  assert.equal(typeof resolveAvailablePublicStoryImage, "function");
  const image = resolvePublicStoryImage(null, "https://provider.example/valid.jpg", "demo", "Valid image");

  const resolved = await resolveAvailablePublicStoryImage(
    image,
    async () => new Response(null, { status: 206, headers: { "content-type": "image/jpeg" } }),
  );

  assert.deepEqual(resolved, image);
});

test("replaces 404 and 403 remote images with the existing fallback", async () => {
  const { resolveAvailablePublicStoryImage } = await import("./public-story.mjs");
  const image = resolvePublicStoryImage(null, "https://provider.example/protected.jpg", "demo", "Protected image", 1200, 675);

  for (const status of [404, 403]) {
    const resolved = await resolveAvailablePublicStoryImage(
      image,
      async () => new Response(null, { status, headers: { "content-type": "text/html" } }),
    );
    assert.deepEqual(resolved, {
      src: "/images/news/story-fallback.svg",
      alt: "Protected image",
      unoptimized: false,
      width: null,
      height: null,
      aspectRatio: null,
    });
  }
});

test("keeps missing and null external images on the existing fallback without requesting them", async () => {
  const { resolveAvailablePublicStoryImage } = await import("./public-story.mjs");
  let requests = 0;
  const missing = resolvePublicStoryImage(null, undefined, "demo", "Missing image");
  const nullImage = resolvePublicStoryImage(null, null, "demo", "Null image");
  const fetcher = async () => { requests += 1; return new Response(null, { status: 200 }); };

  assert.deepEqual(await resolveAvailablePublicStoryImage(missing, fetcher), missing);
  assert.deepEqual(await resolveAvailablePublicStoryImage(nullImage, fetcher), nullImage);
  assert.equal(requests, 0);
});

test("preserves intrinsic dimensions and contains only low-resolution hero images", () => {
  const lowResolution = resolvePublicStoryImage(null, "https://provider.example/low.jpg", "demo", "Low", 799, 450);
  const mediumResolution = resolvePublicStoryImage(null, "https://provider.example/medium.jpg", "demo", "Medium", 800, 450);
  const highResolution = resolvePublicStoryImage(null, "https://provider.example/high.jpg", "demo", "High", 1200, 675);

  assert.deepEqual(
    { width: lowResolution.width, height: lowResolution.height, aspectRatio: lowResolution.aspectRatio },
    { width: 799, height: 450, aspectRatio: 799 / 450 },
  );
  assert.equal(getHeroImagePresentation(lowResolution).objectFit, "contain");
  assert.equal(getHeroImagePresentation(mediumResolution).objectFit, "cover");
  assert.equal(getHeroImagePresentation(highResolution).objectFit, "cover");
  assert.equal(getHeroImagePresentation({ width: null, height: null }).objectFit, "cover");
});

test("fills related stories from newest fallback records without duplicates", () => {
  const preferred = [{ id: "current" }, { id: "same-1" }, { id: "same-2" }];
  const fallback = [{ id: "same-2" }, { id: "newest-1" }, { id: "current" }, { id: "newest-2" }];
  assert.deepEqual(
    selectRelatedStories("current", preferred, fallback).map(({ id }) => id),
    ["same-1", "same-2", "newest-1", "newest-2"],
  );
});

test("places one related story after every sixth paragraph", () => {
  const related = [{ id: "one" }, { id: "two" }, { id: "three" }];
  assert.deepEqual(composeInlineRelated(14, related), [
    { afterParagraph: 6, story: related[0] },
    { afterParagraph: 12, story: related[1] },
  ]);
  assert.deepEqual(composeInlineRelated(4, related), [
    { afterParagraph: 4, story: related[0] },
  ]);
});

test("selects same-category adjacent stories before publication-order fallbacks", () => {
  const current = publishedStory("current", 8);
  const preferred = [publishedStory("newer-same", 10), current, publishedStory("older-same", 6)];
  const fallback = [publishedStory("newest", 12), ...preferred, publishedStory("oldest", 4)];

  assert.deepEqual(selectAdjacentStories("current", preferred, fallback), {
    previous: preferred[2],
    next: preferred[0],
  });
  const publicationFallback = [fallback[0], current, fallback[4]];
  assert.deepEqual(selectAdjacentStories("current", [current], publicationFallback), {
    previous: publicationFallback[2],
    next: publicationFallback[0],
  });
  assert.deepEqual(selectAdjacentStories("current", preferred, fallback, new Set(["newer-same", "older-same"])), {
    previous: fallback[4],
    next: fallback[0],
  });
});

test("composes mutually exclusive sidebar groups excluding the current story", () => {
  const stories = [
    publishedStory("current", 12, { isBreaking: true, isFeatured: true }),
    publishedStory("breaking", 11, { isBreaking: true }),
    publishedStory("featured", 10, { isFeatured: true }),
    publishedStory("latest", 9),
    publishedStory("trending", 8),
  ];
  const result = composeArticleSidebar("current", stories, 1);
  assert.deepEqual(result.breaking.map(({ id }) => id), ["breaking"]);
  assert.deepEqual(result.editorPicks.map(({ id }) => id), ["featured"]);
  assert.deepEqual(result.latest.map(({ id }) => id), ["latest"]);
  assert.deepEqual(result.trending.map(({ id }) => id), ["trending"]);
  assert.equal(new Set(Object.values(result).flat().map(({ id }) => id)).size, 4);
  const excluded = composeArticleSidebar("current", stories, 1, new Set(["breaking", "featured"]));
  assert.equal(Object.values(excluded).flat().some(({ id }) => id === "breaking" || id === "featured"), false);
});

test("composes canonical Open Graph and Twitter metadata", () => {
  const result = composeStoryMetadata({
    title: "India moves forward",
    description: "A verified update.",
    canonicalUrl: null,
    siteUrl: "https://inbcn.example",
    locale: "en",
    slug: "india-moves-forward",
    imageUrl: "/images/news/story-fallback.svg",
  });
  assert.equal(result.canonical, "https://inbcn.example/en/story/india-moves-forward");
  assert.equal(result.openGraph.url, result.canonical);
  assert.equal(result.twitter.card, "summary_large_image");
});

test("generates NewsArticle JSON-LD without protected author identifiers", () => {
  const jsonLd = buildArticleJsonLd({
    title: "Published report",
    description: "Summary",
    canonical: "https://inbcn.example/en/story/published-report",
    imageUrl: "https://inbcn.example/fallback.svg",
    author: "INBCN News Desk",
    publishedAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T11:00:00.000Z",
    readTime: 5,
  });
  assert.equal(jsonLd["@type"], "NewsArticle");
  assert.deepEqual(jsonLd.author, { "@type": "Organization", name: "INBCN News Desk" });
  assert.equal(jsonLd.timeRequired, "PT5M");
  assert.equal("created_by" in jsonLd, false);
});

test("splits plain text into trimmed readable paragraphs", () => {
  assert.deepEqual(splitStoryBody(" First paragraph.\n\nSecond paragraph.\nThird line. "), [
    "First paragraph.", "Second paragraph.", "Third line.",
  ]);
});
