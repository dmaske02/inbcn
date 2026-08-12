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

test("enriches a feed entry from the linked article when RSS media is absent", async () => {
  const request = await import("./rss.request.ts").catch(() => null);
  assert.ok(request, "RSS request module should exist");
  const calls = [];

  const feed = await request.requestRssFeed(
    "https://feeds.example.com/news.xml",
    async (url) => {
      calls.push(String(url));
      if (String(url).includes("/images/hero.jpg")) {
        const pngHeader = new Uint8Array(24);
        pngHeader.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        new DataView(pngHeader.buffer).setUint32(16, 640);
        new DataView(pngHeader.buffer).setUint32(20, 360);
        return new Response(pngHeader, { status: 206, headers: { "content-type": "image/png" } });
      }
      return String(url).includes("/story")
        ? new Response('<meta property="og:image" content="/images/hero.jpg">', {
            status: 200,
            headers: { "content-type": "text/html" },
          })
        : new Response(validFeed, {
            status: 200,
            headers: { "content-type": "application/rss+xml" },
          });
    },
  );

  assert.deepEqual(calls, [
    "https://feeds.example.com/news.xml",
    "https://example.com/story",
    "https://example.com/images/hero.jpg",
  ]);
  assert.equal(feed.entries[0].imageUrl, "https://example.com/images/hero.jpg");
  assert.equal(feed.entries[0].imageWidth, 640);
  assert.equal(feed.entries[0].imageHeight, 360);
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

test("reports HTTP 404 and 403 provider failures without exposing response bodies", async () => {
  const request = await import("./rss.request.ts");

  for (const [status, label] of [[404, "Feed returned HTTP 404 (text/html)."], [403, "Feed returned HTTP 403 (text/html)."]]) {
    await assert.rejects(
      request.requestRssFeed(
        `https://feeds.example.com/${status}.xml`,
        async () => new Response("private provider response", {
          status,
          headers: { "content-type": "text/html; charset=UTF-8" },
        }),
      ),
      (error) =>
        error instanceof request.RssRepositoryError &&
        error.message === label &&
        !error.message.includes("private provider response"),
    );
  }
});

test("distinguishes HTML and malformed XML responses", async () => {
  const request = await import("./rss.request.ts");

  await assert.rejects(
    request.requestRssFeed(
      "https://feeds.example.com/html.xml",
      async () => new Response("<!DOCTYPE html><html><title>Error</title></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    ),
    (error) => error instanceof request.RssRepositoryError && error.message === "Feed returned HTML instead of RSS.",
  );
  await assert.rejects(
    request.requestRssFeed(
      "https://feeds.example.com/broken.xml",
      async () => new Response("<rss><channel><item></rss>", {
        status: 200,
        headers: { "content-type": "application/rss+xml" },
      }),
    ),
    (error) => error instanceof request.RssRepositoryError && error.message === "Invalid RSS: response could not be parsed.",
  );
});

test("follows a valid redirect and recovers with a successful feed", async () => {
  const request = await import("./rss.request.ts");
  const calls = [];
  const feed = await request.requestRssFeed(
    "https://feeds.example.com/old.xml",
    async (url) => {
      calls.push(String(url));
      return calls.length === 1
        ? new Response(null, { status: 301, headers: { location: "/current.xml" } })
        : new Response(validFeed, { status: 200, headers: { "content-type": "application/rss+xml" } });
    },
  );

  assert.deepEqual(calls, [
    "https://feeds.example.com/old.xml",
    "https://feeds.example.com/current.xml",
    "https://example.com/story",
  ]);
  assert.equal(feed.entries[0].title, "Headline");
});

test("reports request timeouts explicitly", async () => {
  const request = await import("./rss.request.ts");

  await assert.rejects(
    request.requestRssFeed(
      "https://feeds.example.com/slow.xml",
      async () => { throw new DOMException("timed out", "TimeoutError"); },
    ),
    (error) => error instanceof request.RssRepositoryError && error.message === "Feed request timed out after 15 seconds.",
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
