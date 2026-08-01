import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCategoryJsonLd,
  composeCategoryMetadata,
  composeCategoryPageModel,
  createCategoryPagination,
  resolveCategoryPageStatus,
  selectCategoryHero,
} from "./category.model.ts";

const story = (id, overrides = {}) => ({
  id,
  slug: `story-${id}`,
  title: `Story ${id}`,
  summary: `Summary ${id}`,
  content: "A short category story.",
  externalAuthor: null,
  publishedAt: `2026-08-01T0${id}:00:00.000Z`,
  isFeatured: false,
  ...overrides,
});

test("selects the newest featured candidate before the newest published fallback", () => {
  const latest = story("1");
  const featured = story("2", { isFeatured: true });

  assert.equal(selectCategoryHero([featured], [latest]), featured);
  assert.equal(selectCategoryHero([], [latest]), latest);
  assert.equal(selectCategoryHero([], []), null);
});

test("keeps pagination stable by excluding the same hero from every page query", () => {
  assert.deepEqual(createCategoryPagination({ page: 1, pageSize: 12, total: 25, heroId: "hero" }), {
    page: 1,
    pageSize: 12,
    total: 25,
    totalPages: 3,
    offset: 0,
    excludeStoryId: "hero",
    outOfRange: false,
    previousPage: null,
    nextPage: 2,
  });
  assert.deepEqual(createCategoryPagination({ page: 2, pageSize: 12, total: 25, heroId: "hero" }), {
    page: 2,
    pageSize: 12,
    total: 25,
    totalPages: 3,
    offset: 12,
    excludeStoryId: "hero",
    outOfRange: false,
    previousPage: 1,
    nextPage: 3,
  });
  assert.equal(createCategoryPagination({ page: 4, pageSize: 12, total: 25, heroId: "hero" }).outOfRange, true);
});

test("composes page one with a hero excluded from the story grid", () => {
  const hero = story("1", { isFeatured: true, externalAuthor: "External Desk" });
  const gridStories = [story("2"), story("3")];
  const result = composeCategoryPageModel({
    locale: "en",
    category: { id: "category", name: "National", slug: "national", description: "National reporting." },
    hero,
    stories: gridStories,
    relatedCategories: [],
    page: 1,
    pageSize: 12,
    total: 2,
    siteUrl: "https://inbcn.example",
    labels: { newsDesk: "INBCN News Desk", emptyTitle: "No stories", emptyDescription: "Check again soon." },
  });

  assert.equal(result.hero?.id, "1");
  assert.deepEqual(result.stories.map((item) => item.id), ["2", "3"]);
  assert.equal(result.hero?.author, "External Desk");
  assert.equal(result.stories[0].author, "INBCN News Desk");
  assert.equal(result.storyCount, 3);
  assert.equal(result.emptyState, null);
});

test("composes a localized empty state when the category has no published stories", () => {
  const result = composeCategoryPageModel({
    locale: "hi",
    category: { id: "category", name: "राष्ट्रीय", slug: "national", description: null },
    hero: null,
    stories: [],
    relatedCategories: [],
    page: 1,
    pageSize: 12,
    total: 0,
    siteUrl: "https://inbcn.example",
    labels: { newsDesk: "INBCN समाचार डेस्क", emptyTitle: "कोई समाचार नहीं", emptyDescription: "बाद में देखें।" },
  });

  assert.deepEqual(result.emptyState, { title: "कोई समाचार नहीं", description: "बाद में देखें।" });
  assert.equal(result.hero, null);
  assert.deepEqual(result.stories, []);
});

test("composes canonical Open Graph and Twitter category metadata", () => {
  const metadata = composeCategoryMetadata({
    categoryName: "Technology",
    description: "Technology reporting from INBCN.",
    siteUrl: "https://inbcn.example/",
    locale: "en",
    slug: "technology",
    page: 2,
    pageLabel: "Page",
    imageUrl: "/images/news/story-fallback.svg",
  });

  assert.equal(metadata.canonical, "https://inbcn.example/en/category/technology?page=2");
  assert.equal(metadata.openGraph.url, metadata.canonical);
  assert.equal(metadata.twitter.card, "summary_large_image");
  assert.deepEqual(metadata.openGraph.images, ["https://inbcn.example/images/news/story-fallback.svg"]);
});

test("uses the localized page label in paginated metadata titles", () => {
  const metadata = composeCategoryMetadata({
    categoryName: "राष्ट्रीय",
    description: "राष्ट्रीय बातम्या.",
    siteUrl: "https://inbcn.example",
    locale: "mr",
    slug: "national",
    page: 2,
    pageLabel: "पृष्ठ",
    imageUrl: "/images/news/story-fallback.svg",
  });

  assert.equal(metadata.title, "राष्ट्रीय - पृष्ठ 2");
});

test("generates CollectionPage JSON-LD with an ItemList of visible stories", () => {
  const jsonLd = buildCategoryJsonLd({
    name: "World",
    description: "World news.",
    canonical: "https://inbcn.example/en/category/world",
    stories: [
      { title: "First", href: "/en/story/first" },
      { title: "Second", href: "/en/story/second" },
    ],
    siteUrl: "https://inbcn.example",
  });

  assert.equal(jsonLd["@type"], "CollectionPage");
  assert.equal(jsonLd.mainEntity.itemListElement.length, 2);
  assert.equal(jsonLd.mainEntity.itemListElement[1].position, 2);
  assert.equal(jsonLd.mainEntity.itemListElement[0].url, "https://inbcn.example/en/story/first");
});

test("marks unknown categories and invalid or out-of-range pages for notFound", () => {
  assert.equal(resolveCategoryPageStatus({ categoryExists: false, page: 1, totalPages: 1 }), "not-found");
  assert.equal(resolveCategoryPageStatus({ categoryExists: true, page: 0, totalPages: 1 }), "out-of-range");
  assert.equal(resolveCategoryPageStatus({ categoryExists: true, page: Number.NaN, totalPages: 1 }), "out-of-range");
  assert.equal(resolveCategoryPageStatus({ categoryExists: true, page: 3, totalPages: 2 }), "out-of-range");
  assert.equal(resolveCategoryPageStatus({ categoryExists: true, page: 2, totalPages: 2 }), "ready");
});
