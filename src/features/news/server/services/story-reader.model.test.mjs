import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArticleJsonLd,
  buildPublicStoryUrl,
  calculateReadTime,
  composeStoryMetadata,
  formatPublicAuthor,
  selectRelatedStories,
  splitStoryBody,
} from "./story-reader.model.ts";

test("uses external author and falls back to the localized news desk", () => {
  assert.equal(formatPublicAuthor("Reuters", "INBCN News Desk"), "Reuters");
  assert.equal(formatPublicAuthor("  ", "INBCN समाचार डेस्क"), "INBCN समाचार डेस्क");
});

test("builds localized story URLs and calculates 200-WPM read time", () => {
  assert.equal(buildPublicStoryUrl("hi", "major-update"), "/hi/story/major-update");
  assert.equal(calculateReadTime(Array.from({length: 201}, (_, index) => `word${index}`).join(" ")), 2);
});

test("selects four related stories excluding the current story", () => {
  const stories = ["current", "one", "two", "three", "four", "five"].map((id) => ({ id }));
  assert.deepEqual(selectRelatedStories("current", stories).map((story) => story.id), ["one", "two", "three", "four"]);
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
  });
  assert.equal(jsonLd["@type"], "NewsArticle");
  assert.deepEqual(jsonLd.author, { "@type": "Organization", name: "INBCN News Desk" });
  assert.equal("created_by" in jsonLd, false);
});

test("splits plain text into trimmed readable paragraphs", () => {
  assert.deepEqual(splitStoryBody(" First paragraph.\n\nSecond paragraph.\nThird line. "), [
    "First paragraph.", "Second paragraph.", "Third line.",
  ]);
});
