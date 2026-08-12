import assert from "node:assert/strict";
import test from "node:test";

test("extracts og:image, twitter:image, and a primary article image in priority order", async () => {
  const images = await import("./rss.article-image.ts").catch(() => null);
  assert.ok(images, "RSS article image module should exist");

  assert.deepEqual(
    images.extractArticleImage(`<meta name="twitter:image" content="/twitter.jpg"><meta property="og:image" content="/og.jpg">`, "https://news.example.com/story"),
    { url: "https://news.example.com/og.jpg", width: null, height: null, source: "og" },
  );
  assert.deepEqual(
    images.extractArticleImage(`<meta name="twitter:image" content="/twitter.jpg">`, "https://news.example.com/story"),
    { url: "https://news.example.com/twitter.jpg", width: null, height: null, source: "twitter" },
  );
  assert.deepEqual(
    images.extractArticleImage(`<article><figure><img src="/hero.jpg"></figure></article>`, "https://news.example.com/story"),
    { url: "https://news.example.com/hero.jpg", width: null, height: null, source: "primary" },
  );
});

test("prefers article metadata over feed media and preserves entry order", async () => {
  const images = await import("./rss.article-image.ts").catch(() => null);
  assert.ok(images, "RSS article image module should exist");
  const calls = [];
  const entries = [
    { id: "1", link: "https://news.example.com/one", imageUrl: null, imageWidth: null, imageHeight: null },
    { id: "2", link: "https://news.example.com/two", imageUrl: "https://cdn.example.com/feed.jpg", imageWidth: 400, imageHeight: 225 },
  ];

  const enriched = await images.enrichRssEntryImages(entries, async (url) => {
    calls.push(url);
    return { url: `https://cdn.example.com/article-${url.endsWith("one") ? "one" : "two"}.jpg`, width: 1200, height: 675, source: "og" };
  }, async () => null);

  assert.deepEqual(calls, ["https://news.example.com/one", "https://news.example.com/two"]);
  assert.equal(enriched[0].imageUrl, "https://cdn.example.com/article-one.jpg");
  assert.equal(enriched[1].imageUrl, "https://cdn.example.com/article-two.jpg");
  assert.equal(enriched[1].imageWidth, 1200);
  assert.deepEqual(enriched.map((entry) => entry.id), ["1", "2"]);
});

test("does not replace feed media with a lower-priority primary article image", async () => {
  const images = await import("./rss.article-image.ts");
  const entries = [{ id: "1", link: "https://news.example.com/one", imageUrl: "https://cdn.example.com/feed.jpg", imageWidth: 1200, imageHeight: 675 }];
  const enriched = await images.enrichRssEntryImages(
    entries,
    async () => ({ url: "https://news.example.com/article-img.jpg", width: 400, height: 225, source: "primary" }),
    async () => null,
  );
  assert.equal(enriched[0].imageUrl, "https://cdn.example.com/feed.jpg");
  assert.equal(enriched[0].imageWidth, 1200);
});
