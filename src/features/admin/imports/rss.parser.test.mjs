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
      <media:content url="https://cdn.example.com/programme.jpg" medium="image" width="1600" height="900" />
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
      imageWidth: 1600,
      imageHeight: 900,
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
    imageWidth: null,
    imageHeight: null,
    language: "hi",
  });
});

test("prefers an enclosure over a smaller media thumbnail", async () => {
  const parser = await import("./rss.parser.ts").catch(() => null);
  assert.ok(parser, "RSS parser module should exist");
  const feed = parser.parseSyndicationFeed(`<?xml version="1.0"?>
    <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>Feed</title><item>
      <guid>priority-story</guid><title>Priority story</title>
      <media:thumbnail url="https://cdn.example.com/thumb.jpg" width="320" height="180" />
      <enclosure url="https://cdn.example.com/full.jpg" type="image/jpeg" length="1000" />
    </item></channel></rss>`);

  assert.equal(feed.entries[0].imageUrl, "https://cdn.example.com/full.jpg");
});

test("parses an RSS item image element before falling back to article enrichment", async () => {
  const parser = await import("./rss.parser.ts").catch(() => null);
  assert.ok(parser, "RSS parser module should exist");
  const feed = parser.parseSyndicationFeed(`<?xml version="1.0"?>
    <rss version="2.0"><channel><title>Feed</title><item>
      <guid>image-story</guid><title>Image story</title>
      <link>https://example.com/image-story</link>
      <image><url>https://cdn.example.com/item-image.jpg</url></image>
    </item></channel></rss>`);

  assert.equal(feed.entries[0].imageUrl, "https://cdn.example.com/item-image.jpg");
});

test("rejects XML that is neither RSS nor Atom", async () => {
  const parser = await import("./rss.parser.ts").catch(() => null);
  assert.ok(parser, "RSS parser module should exist");

  assert.throws(
    () => parser.parseSyndicationFeed("<html><body>Not a feed</body></html>"),
    /valid RSS or Atom feed/i,
  );
});

test("parses Marathi UTF-8 RDF with CDATA and media and enclosure fields", async () => {
  const parser = await import("./rss.parser.ts");
  const feed = parser.parseSyndicationFeed(`<?xml version="1.0" encoding="UTF-8"?>
    <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">
      <channel><title>मराठी बातम्या</title><dc:language>mr</dc:language></channel>
      <item><title><![CDATA[महाराष्ट्र बातमी]]></title><link>https://example.com/mr-story</link>
        <description><![CDATA[<p>मराठी सारांश</p>]]></description>
        <media:content url="https://cdn.example.com/mr.jpg" medium="image" width="1200" height="675" />
        <media:thumbnail url="https://cdn.example.com/mr-thumb.jpg" width="320" height="180" />
        <enclosure url="https://cdn.example.com/mr-enclosure.jpg" type="image/jpeg" />
      </item>
    </rdf:RDF>`);

  assert.equal(feed.format, "rss");
  assert.equal(feed.language, "mr");
  assert.equal(feed.entries[0].title, "महाराष्ट्र बातमी");
  assert.equal(feed.entries[0].summary, "<p>मराठी सारांश</p>");
  assert.equal(feed.entries[0].imageUrl, "https://cdn.example.com/mr.jpg");
});
