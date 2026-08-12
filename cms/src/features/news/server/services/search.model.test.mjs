import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSearchHref,
  buildSearchJsonLd,
  composeSearchMetadata,
  composeSearchPageModel,
  createSearchPagination,
  getPublishedAfter,
  normalizeSearchDate,
  normalizeSearchQuery,
  parseSearchPage,
  resolveSearchPageStatus,
} from "./search.model.ts";

const story = (id, overrides = {}) => ({
  id,
  categoryId: "category-national",
  slug: `story-${id}`,
  title: `Story ${id}`,
  summary: `Summary ${id}`,
  content: "A concise verified report for readers.",
  externalAuthor: null,
  publishedAt: `2026-08-01T0${id}:00:00.000Z`,
  featuredMedia: null,
  ...overrides,
});

test("normalizes reader queries while distinguishing empty and invalid input", () => {
  assert.deepEqual(normalizeSearchQuery("  general\n election  "), {
    status: "valid",
    query: "general election",
  });
  assert.deepEqual(normalizeSearchQuery("   "), { status: "empty", query: "" });
  assert.deepEqual(normalizeSearchQuery(undefined), { status: "empty", query: "" });
  assert.deepEqual(normalizeSearchQuery(["one", "two"]), { status: "invalid", query: "" });
  assert.deepEqual(normalizeSearchQuery("x".repeat(161)), { status: "invalid", query: "" });
});

test("validates URL-driven page and date filters", () => {
  assert.equal(parseSearchPage(undefined), 1);
  assert.equal(parseSearchPage("2"), 2);
  assert.equal(parseSearchPage("0"), null);
  assert.equal(parseSearchPage(["1", "2"]), null);
  assert.equal(normalizeSearchDate(undefined), "all");
  assert.equal(normalizeSearchDate("week"), "week");
  assert.equal(normalizeSearchDate("year"), null);
  assert.equal(getPublishedAfter("day", "2026-08-02T12:00:00.000Z"), "2026-08-01T12:00:00.000Z");
  assert.equal(getPublishedAfter("all", "2026-08-02T12:00:00.000Z"), null);
});

test("preserves query and filters in pagination URLs", () => {
  assert.equal(
    buildSearchHref({
      locale: "en",
      query: "general election",
      category: "national",
      date: "week",
      page: 2,
    }),
    "/en/search?q=general+election&category=national&date=week&page=2",
  );
  assert.equal(
    buildSearchHref({ locale: "hi", query: "भारत", date: "all", page: 1 }),
    "/hi/search?q=%E0%A4%AD%E0%A4%BE%E0%A4%B0%E0%A4%A4",
  );
});

test("creates stable twelve-result pagination and detects out-of-range pages", () => {
  assert.deepEqual(createSearchPagination({ page: 2, pageSize: 12, total: 25 }), {
    page: 2,
    pageSize: 12,
    total: 25,
    totalPages: 3,
    previousPage: 1,
    nextPage: 3,
  });
  assert.equal(resolveSearchPageStatus({ page: 4, totalPages: 3 }), "out-of-range");
  assert.equal(resolveSearchPageStatus({ page: 1, totalPages: 1 }), "ready");
});

test("composes localized result cards from stable story DTOs", () => {
  const result = composeSearchPageModel({
    locale: "en",
    query: "election",
    category: null,
    date: "all",
    page: 1,
    pageSize: 12,
    total: 2,
    stories: [story("1"), story("2", { externalAuthor: "Reuters" })],
    categories: [{ id: "category-national", name: "National", slug: "national" }],
    siteUrl: "https://inbcn.example",
    labels: {
      newsDesk: "INBCN News Desk",
      title: "Search results for election",
      description: "Verified INBCN results for election.",
      emptyTitle: "No results",
      emptyDescription: "Try another search.",
    },
  });

  assert.equal(result.results[0].category, "National");
  assert.equal(result.results[0].author, "INBCN News Desk");
  assert.equal(result.results[1].author, "Reuters");
  assert.equal(result.results[0].href, "/en/story/story-1");
  assert.equal(result.results[0].readTime, 1);
  assert.equal(result.emptyState, null);
});

test("provides a useful localized empty state for a completed search", () => {
  const result = composeSearchPageModel({
    locale: "mr",
    query: "missing",
    category: null,
    date: "all",
    page: 1,
    pageSize: 12,
    total: 0,
    stories: [],
    categories: [],
    siteUrl: "https://inbcn.example",
    labels: {
      newsDesk: "INBCN न्यूज़ डेस्क",
      title: "Search",
      description: "Search INBCN.",
      emptyTitle: "No results",
      emptyDescription: "Try another search.",
    },
  });

  assert.deepEqual(result.emptyState, {
    title: "No results",
    description: "Try another search.",
  });
  assert.deepEqual(result.results, []);
});

test("composes canonical Open Graph and Twitter metadata for filtered results", () => {
  const metadata = composeSearchMetadata({
    title: "Search results for election",
    description: "Verified results.",
    siteUrl: "https://inbcn.example/",
    locale: "en",
    query: "general election",
    category: "national",
    date: "month",
    page: 2,
    imageUrl: "/images/news/story-fallback.svg",
  });

  assert.equal(
    metadata.canonical,
    "https://inbcn.example/en/search?q=general+election&category=national&date=month&page=2",
  );
  assert.equal(metadata.openGraph.url, metadata.canonical);
  assert.equal(metadata.twitter.card, "summary_large_image");
});

test("generates CollectionPage JSON-LD with visible search results", () => {
  const jsonLd = buildSearchJsonLd({
    name: "Search results for election",
    description: "Verified results.",
    canonical: "https://inbcn.example/en/search?q=election",
    siteUrl: "https://inbcn.example",
    stories: [
      { title: "First", href: "/en/story/first" },
      { title: "Second", href: "/en/story/second" },
    ],
  });

  assert.equal(jsonLd["@type"], "CollectionPage");
  assert.equal(jsonLd.mainEntity.itemListElement.length, 2);
  assert.equal(jsonLd.mainEntity.itemListElement[1].position, 2);
  assert.equal(jsonLd.mainEntity.itemListElement[0].url, "https://inbcn.example/en/story/first");
});
