import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("article page renders the approved premium server-first structure", async () => {
  const source = await readFile(new URL("../../../app/[locale]/story/[slug]/page.tsx", import.meta.url), "utf8");

  assert.match(source, /<ReadingProgress articleId="story-article"/u);
  assert.match(source, /id="story-article"/u);
  assert.match(source, /placement="desktop"/u);
  assert.match(source, /placement="mobile"/u);
  assert.match(source, /view\.inlineRelated/u);
  assert.match(source, /view\.previous/u);
  assert.match(source, /view\.next/u);
  for (const group of ["trending", "latest", "editorPicks", "breaking"]) {
    assert.match(source, new RegExp(`view\\.sidebar\\.${group}`, "u"));
  }
  assert.match(source, /aria-label="Author information"/u);
  assert.match(source, /view\.story\.image\.caption \?/u);
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
