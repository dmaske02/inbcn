import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("article page renders the approved premium server-first structure", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../../../app/[locale]/story/[slug]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(source, /<ReadingProgress articleId="story-article"/u);
  assert.match(source, /id="story-article"/u);
  assert.doesNotMatch(source, /StoryShareActions|placement="desktop"|placement="mobile"/u);
  assert.match(source, /lg:grid-cols-\[minmax\(0,760px\)_320px\]/u);
  assert.match(source, /view\.inlineRelated/u);
  assert.match(source, /view\.previous/u);
  assert.match(source, /view\.next/u);
  for (const group of ["trending", "latest", "editorPicks", "breaking"]) {
    assert.match(source, new RegExp(`view\\.sidebar\\.${group}`, "u"));
  }
  assert.match(source, /aria-label="Author information"/u);
  assert.match(source, /view\.story\.image\.caption \?/u);
  assert.match(source, /className="article-inline-related"/u);
  assert.match(source, /className="article-inline-related-label"/u);
  assert.match(css, /\.article-inline-related\s*\{[^}]*border-left:\s*2px solid var\(--editorial-accent\)[^}]*background:\s*var\(--editorial-fg-soft\)/su);
});

test("article media uses explicit loading priorities without changing the image resolver", async () => {
  const source = await readFile(new URL("../../../app/[locale]/story/[slug]/page.tsx", import.meta.url), "utf8");

  assert.match(source, /loading="eager"/u);
  assert.match(source, /fetchPriority="high"/u);
  assert.match(source, /getHeroImagePresentation\(view\.story\.image\)/u);
  assert.match(source, /maxWidth: heroImagePresentation\.maxWidth/u);
  assert.match(source, /loading="lazy"/u);
  assert.doesNotMatch(source, /resolvePublicStoryImage|externalImageUrl/u);
});

test("article page remains plain-text and does not introduce rich content parsing", async () => {
  const source = await readFile(new URL("../../../app/[locale]/story/[slug]/page.tsx", import.meta.url), "utf8");

  assert.match(source, /view\.story\.paragraphs\.map/u);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML=\{\{ __html: (?!jsonLd)|marked|markdown|sanitizeHtml/u);
});

test("article metadata preserves canonical social data and exposes author and reading time", async () => {
  const source = await readFile(new URL("../../../app/[locale]/story/[slug]/page.tsx", import.meta.url), "utf8");

  assert.match(source, /authors: \[\{ name: view\.story\.author \}\]/u);
  assert.match(source, /publishedTime: view\.story\.publishedAt/u);
  assert.match(source, /modifiedTime: view\.story\.updatedAt/u);
  assert.match(source, /"article:reading_time": String\(view\.story\.readTime\)/u);
});

test("article reporter attribution links in the header and renders one full server byline card", async () => {
  const source = await readFile(new URL("../../../app/[locale]/story/[slug]/page.tsx", import.meta.url), "utf8");

  assert.match(source, /view\.story\.reporter && reporterHref \?/u);
  assert.match(source, /buildPublicReporterUrl/u);
  assert.match(source, /<ReporterBylineCard/u);
  assert.equal((source.match(/<ReporterBylineCard\b/gu) ?? []).length, 1);
});
