import assert from "node:assert/strict";
import test from "node:test";

const validFeed = `<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title><item><guid>1</guid><title>Headline</title><link>https://example.com/story</link></item></channel></rss>`;

test("fetches and parses a valid RSS response without caching", async () => {
  const request = await import("./rss.request.ts").catch(() => null);
  assert.ok(request, "RSS request module should exist");
  const calls = [];

  const feed = await request.requestRssFeed(
    "https://feeds.example.com/news.xml",
    async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(validFeed, {
        status: 200,
        headers: { "content-type": "application/rss+xml" },
      });
    },
  );

  assert.equal(feed.entries[0].title, "Headline");
  assert.equal(calls[0].url, "https://feeds.example.com/news.xml");
  assert.equal(calls[0].init.cache, "no-store");
  assert.equal(calls[0].init.headers.Accept.includes("application/rss+xml"), true);
});

test("returns safe repository errors for unavailable and invalid feeds", async () => {
  const request = await import("./rss.request.ts").catch(() => null);
  assert.ok(request, "RSS request module should exist");

  await assert.rejects(
    request.requestRssFeed(
      "https://feeds.example.com/missing.xml",
      async () => new Response("provider details", { status: 503 }),
    ),
    (error) =>
      error instanceof request.RssRepositoryError &&
      error.code === "UNAVAILABLE" &&
      !error.message.includes("provider details"),
  );
  await assert.rejects(
    request.requestRssFeed(
      "https://feeds.example.com/not-a-feed.xml",
      async () =>
        new Response("<html>Not a feed</html>", {
          status: 200,
          headers: { "content-type": "application/xml" },
        }),
    ),
    (error) =>
      error instanceof request.RssRepositoryError &&
      error.code === "INVALID_FEED",
  );
});

test("rejects an oversized feed before parsing it", async () => {
  const request = await import("./rss.request.ts").catch(() => null);
  assert.ok(request, "RSS request module should exist");

  await assert.rejects(
    request.requestRssFeed(
      "https://feeds.example.com/large.xml",
      async () =>
        new Response(validFeed, {
          status: 200,
          headers: {
            "content-length": String(6 * 1024 * 1024),
            "content-type": "application/rss+xml",
          },
        }),
    ),
    (error) =>
      error instanceof request.RssRepositoryError &&
      error.code === "TOO_LARGE",
  );
});

test("validates every redirect target before following it", async () => {
  const request = await import("./rss.request.ts").catch(() => null);
  assert.ok(request, "RSS request module should exist");
  const calls = [];

  await assert.rejects(
    request.requestRssFeed(
      "https://feeds.example.com/news.xml",
      async (url, init) => {
        calls.push({ url: String(url), init });
        return new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/internal.xml" },
        });
      },
    ),
    (error) =>
      error instanceof request.RssRepositoryError &&
      error.code === "INVALID_URL",
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.redirect, "manual");
});
