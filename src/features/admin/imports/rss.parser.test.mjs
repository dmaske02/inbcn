import assert from "node:assert/strict";
import test from "node:test";

const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Example News</title>
    <language>en-IN</language>
    <item>
      <guid isPermaLink="false">story-101</guid>
      <title>India launches a new programme</title>
      <link>https://example.com/programme?utm_source=rss</link>
      <description><![CDATA[<p>A concise programme summary.</p>]]></description>
      <content:encoded><![CDATA[<p>The complete programme report.</p>]]></content:encoded>
      <pubDate>Sun, 02 Aug 2026 10:30:00 GMT</pubDate>
      <dc:creator>Example News Desk</dc:creator>
      <category>Technology</category>
      <category>National</category>
      <media:content url="https://cdn.example.com/programme.jpg" medium="image" />
    </item>
  </channel>
</rss>`;

const atomXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <title>Example Atom</title>
  <language>hi</language>
  <entry>
    <id>tag:example.com,2026:story-202</id>
    <title>Atom headline</title>
    <link rel="alternate" href="https://example.com/atom-story" />
    <summary type="html"><![CDATA[<p>Atom summary.</p>]]></summary>
    <content type="html"><![CDATA[<p>Atom body.</p>]]></content>
    <updated>2026-08-02T11:00:00Z</updated>
    <author><name>Atom Reporter</name></author>
    <category term="World" />
    <media:thumbnail url="https://cdn.example.com/atom.jpg" />
  </entry>
</feed>`;

test("parses RSS 2.0 entries with common content and media extensions", async () => {
  const parser = await import("./rss.parser.ts").catch(() => null);
  assert.ok(parser, "RSS parser module should exist");

  const feed = parser.parseSyndicationFeed(rssXml);

  assert.equal(feed.format, "rss");
  assert.equal(feed.title, "Example News");
  assert.equal(feed.language, "en-IN");
  assert.deepEqual(feed.entries, [
    {
      id: "story-101",
      title: "India launches a new programme",
      link: "https://example.com/programme?utm_source=rss",
      summary: "<p>A concise programme summary.</p>",
      content: "<p>The complete programme report.</p>",
      publishedAt: "Sun, 02 Aug 2026 10:30:00 GMT",
      author: "Example News Desk",
      categories: ["Technology", "National"],
      imageUrl: "https://cdn.example.com/programme.jpg",
      language: "en-IN",
    },
  ]);
});

test("parses Atom entries and selects the alternate link", async () => {
  const parser = await import("./rss.parser.ts").catch(() => null);
  assert.ok(parser, "RSS parser module should exist");

  const feed = parser.parseSyndicationFeed(atomXml);

  assert.equal(feed.format, "atom");
  assert.equal(feed.title, "Example Atom");
  assert.deepEqual(feed.entries[0], {
    id: "tag:example.com,2026:story-202",
    title: "Atom headline",
    link: "https://example.com/atom-story",
    summary: "<p>Atom summary.</p>",
    content: "<p>Atom body.</p>",
    publishedAt: "2026-08-02T11:00:00Z",
    author: "Atom Reporter",
    categories: ["World"],
    imageUrl: "https://cdn.example.com/atom.jpg",
    language: "hi",
  });
});

test("rejects XML that is neither RSS nor Atom", async () => {
  const parser = await import("./rss.parser.ts").catch(() => null);
  assert.ok(parser, "RSS parser module should exist");

  assert.throws(
    () => parser.parseSyndicationFeed("<html><body>Not a feed</body></html>"),
    /valid RSS or Atom feed/i,
  );
});
