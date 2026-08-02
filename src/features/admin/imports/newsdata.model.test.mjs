import assert from "node:assert/strict";
import test from "node:test";

import * as newsDataModel from "./newsdata.model.ts";

import {
  canManageNewsData,
  createExternalFingerprint,
  normalizeExternalUrl,
  normalizeNewsDataArticle,
  normalizeProviderLanguage,
  newsDataSourceSchema,
  parseImportRunMetadata,
  selectProviderCategory,
} from "./newsdata.model.ts";

const rawArticle = {
  article_id: "article-123",
  title: "  India launches a new digital public service  ",
  link: "https://Example.com/news/story/?utm_source=feed&b=2&a=1#section",
  description: " A concise article summary. ",
  content: " The complete provider article body. ",
  pubDate: "2026-08-02 10:30:00",
  image_url: "https://cdn.example.com/image.jpg",
  creator: ["Reporter One", "Reporter Two"],
  keywords: ["India", "Digital", "india"],
  ai_tag: ["Public services"],
  category: ["technology", "top"],
  language: "english",
  source_name: "Example News",
};

test("normalizes a provider article into stable external story metadata", () => {
  const article = normalizeNewsDataArticle(rawArticle);

  assert.equal(article.externalId, "article-123");
  assert.equal(article.title, "India launches a new digital public service");
  assert.equal(article.summary, "A concise article summary.");
  assert.equal(article.content, "The complete provider article body.");
  assert.equal(article.externalUrl, "https://example.com/news/story?a=1&b=2");
  assert.equal(article.externalAuthor, "Reporter One, Reporter Two");
  assert.equal(article.externalPublishedAt, "2026-08-02T10:30:00.000Z");
  assert.equal(article.externalImageUrl, "https://cdn.example.com/image.jpg");
  assert.deepEqual(article.tags, ["india", "digital", "public services"]);
  assert.deepEqual(article.categories, ["technology", "top"]);
  assert.equal(article.languageCode, "en");
  assert.equal(article.sourceName, "Example News");
});

test("accepts the current NewsData ai_tag string response shape", () => {
  const article = normalizeNewsDataArticle({
    ...rawArticle,
    ai_tag: "Public services",
  });

  assert.deepEqual(article.tags, ["india", "digital", "public services"]);
});

test("combines provider dates with their timezone and removes plan-gated sentinels", () => {
  const article = normalizeNewsDataArticle({
    ...rawArticle,
    pubDateTZ: "UTC",
    content: "ONLY AVAILABLE IN PAID PLANS",
    keywords: ["ONLY AVAILABLE IN PROFESSIONAL AND CORPORATE PLANS"],
    ai_tag: "ONLY AVAILABLE IN PROFESSIONAL AND CORPORATE PLANS",
  });

  assert.equal(article.externalPublishedAt, "2026-08-02T10:30:00.000Z");
  assert.equal(article.content, "A concise article summary.");
  assert.deepEqual(article.tags, []);
});

test("uses safe text fallbacks when optional provider content is absent", () => {
  const article = normalizeNewsDataArticle({
    article_id: "article-456",
    title: "Headline only",
    link: "https://example.com/headline-only",
    description: null,
    content: null,
    creator: null,
    keywords: null,
    category: null,
    language: "hi",
  });

  assert.equal(article.summary, "Headline only");
  assert.equal(article.content, "Headline only");
  assert.equal(article.externalAuthor, null);
  assert.deepEqual(article.tags, []);
  assert.deepEqual(article.categories, []);
  assert.equal(article.languageCode, "hi");
});

test("rejects provider records without a usable headline", () => {
  assert.throws(
    () => normalizeNewsDataArticle({ ...rawArticle, title: "   " }),
    /headline/i,
  );
});

test("normalizes canonical URLs and removes tracking parameters", () => {
  assert.equal(
    normalizeExternalUrl("https://EXAMPLE.com/path/?z=9&utm_medium=email&a=1#fragment"),
    "https://example.com/path?a=1&z=9",
  );
  assert.equal(normalizeExternalUrl("javascript:alert(1)"), null);
  assert.equal(normalizeExternalUrl(null), null);
});

test("maps supported provider language names and codes", () => {
  assert.equal(normalizeProviderLanguage("english"), "en");
  assert.equal(normalizeProviderLanguage("hindi"), "hi");
  assert.equal(normalizeProviderLanguage("marathi"), "mr");
  assert.equal(normalizeProviderLanguage("EN"), "en");
  assert.equal(normalizeProviderLanguage("french"), null);
});

test("selects a supported provider category or the configured fallback", () => {
  assert.equal(selectProviderCategory(["top", "technology"], ["national", "technology"], "national"), "technology");
  assert.equal(selectProviderCategory(["other"], ["national", "business"], "national"), "national");
});

test("creates the same title and source fingerprint despite case and spacing", () => {
  assert.equal(
    createExternalFingerprint("  A Major Headline ", "Example   News"),
    createExternalFingerprint("a major headline", " example news "),
  );
});

test("validates and normalizes NewsData source configuration", () => {
  assert.deepEqual(
    newsDataSourceSchema.parse({
      id: "",
      name: "  NewsData India  ",
      slug: "newsdata-india",
      defaultLanguageId: "00000000-0000-4000-8000-000000000001",
      defaultCategoryId: "00000000-0000-4000-8000-000000000002",
      country: "IN",
      ingestionPriority: "10",
      isActive: true,
    }),
    {
      id: "",
      name: "NewsData India",
      slug: "newsdata-india",
      defaultLanguageId: "00000000-0000-4000-8000-000000000001",
      defaultCategoryId: "00000000-0000-4000-8000-000000000002",
      country: "in",
      ingestionPriority: 10,
      isActive: true,
    },
  );
});

test("rejects invalid source country and priority values", () => {
  const base = {
    id: "",
    name: "NewsData India",
    slug: "newsdata-india",
    defaultLanguageId: "00000000-0000-4000-8000-000000000001",
    defaultCategoryId: "00000000-0000-4000-8000-000000000002",
    isActive: true,
  };
  assert.equal(newsDataSourceSchema.safeParse({ ...base, country: "india", ingestionPriority: 10 }).success, false);
  assert.equal(newsDataSourceSchema.safeParse({ ...base, country: "in", ingestionPriority: 101 }).success, false);
});

test("allows only editors and admins to manage NewsData imports", () => {
  assert.equal(canManageNewsData("writer"), false);
  assert.equal(canManageNewsData("editor"), true);
  assert.equal(canManageNewsData("admin"), true);
});

test("marks a source ready only when its active references are consistent", () => {
  const source = {
    isActive: true,
    defaultLanguageId: "language-en",
    defaultCategoryId: "category-national",
  };
  const references = {
    languages: [{ id: "language-en" }],
    categories: [
      { id: "category-national", languageId: "language-en" },
    ],
  };

  assert.equal(
    newsDataModel.isNewsDataSourceReady?.(source, references),
    true,
  );
  assert.equal(
    newsDataModel.isNewsDataSourceReady?.(source, {
      ...references,
      categories: [],
    }),
    false,
  );
  assert.equal(
    newsDataModel.isNewsDataSourceReady?.(source, {
      ...references,
      categories: [
        { id: "category-national", languageId: "language-hi" },
      ],
    }),
    false,
  );
  assert.equal(
    newsDataModel.isNewsDataSourceReady?.(
      { ...source, isActive: false },
      references,
    ),
    false,
  );
});

test("parses persisted import history metadata defensively", () => {
  assert.deepEqual(
    parseImportRunMetadata({
      skipped: 2,
      duplicates: 1,
      details: [{ externalId: "a", title: "Headline", outcome: "duplicate", reason: "Already imported." }],
      quota: { apiCreditsRemaining: 90, windowRemaining: 50 },
    }),
    {
      skipped: 2,
      duplicates: 1,
      details: [{ externalId: "a", title: "Headline", outcome: "duplicate", reason: "Already imported." }],
      quota: { apiCreditsRemaining: 90, windowRemaining: 50 },
    },
  );
  assert.deepEqual(parseImportRunMetadata(null), {
    skipped: 0,
    duplicates: 0,
    details: [],
    quota: null,
  });
});
