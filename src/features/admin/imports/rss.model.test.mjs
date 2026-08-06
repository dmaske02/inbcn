import assert from "node:assert/strict";
import test from "node:test";

const entry = {
  id: "story-101",
  title: "  India launches a new programme  ",
  link: "https://example.com/programme?utm_source=rss&edition=india",
  summary: "<p>A concise &amp; verified summary.</p>",
  content: "<p>The <strong>complete</strong> programme report.</p>",
  publishedAt: "Sun, 02 Aug 2026 10:30:00 GMT",
  author: " Example News Desk ",
  categories: ["Technology", "National", "Technology"],
  imageUrl: "https://cdn.example.com/programme.jpg",
  imageWidth: 1600,
  imageHeight: 900,
  language: "en-IN",
};

test("normalizes an RSS entry into the shared external article shape", async () => {
  const model = await import("./rss.model.ts").catch(() => null);
  assert.ok(model, "RSS model module should exist");

  assert.deepEqual(model.normalizeRssEntry(entry), {
    externalId: "story-101",
    externalUrl: "https://example.com/programme?edition=india",
    title: "India launches a new programme",
    summary: "A concise & verified summary.",
    content: "The complete programme report.",
    externalAuthor: "Example News Desk",
    externalPublishedAt: "2026-08-02T10:30:00.000Z",
    externalImageUrl: "https://cdn.example.com/programme.jpg",
    externalImageWidth: 1600,
    externalImageHeight: 900,
    tags: ["technology", "national"],
    categories: ["technology", "national"],
    languageCode: "en",
  });
});

test("uses safe text fallbacks and rejects an entry without a headline", async () => {
  const model = await import("./rss.model.ts").catch(() => null);
  assert.ok(model, "RSS model module should exist");

  const normalized = model.normalizeRssEntry({
    ...entry,
    id: null,
    summary: null,
    content: null,
    author: null,
    publishedAt: "not-a-date",
    imageUrl: null,
  });
  assert.equal(normalized.summary, "India launches a new programme");
  assert.equal(normalized.content, "India launches a new programme");
  assert.equal(normalized.externalPublishedAt, null);
  assert.equal(normalized.externalId, null);

  assert.throws(
    () => model.normalizeRssEntry({ ...entry, title: "  " }),
    /headline is missing/i,
  );
});

test("validates RSS source configuration and rejects unsafe feed URLs", async () => {
  const model = await import("./rss.model.ts").catch(() => null);
  assert.ok(model, "RSS model module should exist");

  const source = model.rssSourceSchema.parse({
    id: "",
    name: "Example RSS",
    slug: "example-rss",
    feedUrl: "https://feeds.example.com/news.xml",
    defaultLanguageId: "32c65ab1-e214-4a3e-8535-582438568ce8",
    defaultCategoryId: "8e188942-28ce-4325-8d16-0d06f5ce322b",
    country: "IN",
    ingestionPriority: "25",
    isActive: true,
  });
  assert.equal(source.feedUrl, "https://feeds.example.com/news.xml");
  assert.equal(source.country, "in");

  for (const feedUrl of [
    "file:///etc/passwd",
    "http://localhost/feed.xml",
    "http://127.0.0.1/feed.xml",
    "https://user:password@feeds.example.com/news.xml",
  ]) {
    assert.equal(
      model.rssSourceSchema.safeParse({ ...source, feedUrl }).success,
      false,
      feedUrl,
    );
  }
});
