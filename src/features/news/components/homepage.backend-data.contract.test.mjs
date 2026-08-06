import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("homepage renders only snapshot collections and contains no demo editorial arrays", async () => {
  const source = await readFile(new URL("./homepage.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /const stories\s*=|const rails\s*=|Monsoon session opens|Cabinet clears|climate-ready neighbourhoods/u);
  for (const field of ["featured", "topHeadlines", "latest", "trending", "categoryRails", "editorPicks"]) {
    assert.match(source, new RegExp(`data\\.${field}`, "u"));
  }
  assert.match(source, /data\.featured &&/u);
  assert.match(source, /data\.trending\.length > 0/u);
  assert.match(source, /data\.categoryRails\.length > 0/u);
  assert.doesNotMatch(source, /18 \+ index|placeholder|proto-thumb tone-/u);
});

test("homepage renders resolved story images in the hero editor pick cards", async () => {
  const source = await readFile(new URL("./homepage.tsx", import.meta.url), "utf8");
  const heroDeck = source.match(/heroDeck\.map\(\(story\) => (?<card>.*?)<\/article>\)/su);

  assert.ok(heroDeck?.groups?.card, "expected the hero editor pick card renderer");
  assert.match(heroDeck.groups.card, /<StoryImage story=\{story\}/u);
});

test("desktop hero image fills its grid row with a centered cover crop", async () => {
  const styles = await readFile(new URL("../../../app/globals.css", import.meta.url), "utf8");

  assert.match(styles, /@media\(min-width:761px\)\{\.proto-hero-photo\{height:100%;aspect-ratio:auto\}\}/u);
  assert.match(styles, /\.proto-hero-photo img\{object-position:center\}/u);
});

test("homepage premium polish clamps variable editorial copy without changing typography", async () => {
  const styles = await readFile(new URL("../../../app/globals.css", import.meta.url), "utf8");

  assert.match(styles, /\.proto-hero-copy h1\{[^}]*-webkit-line-clamp:6[^}]*\}/u);
  assert.match(styles, /\.proto-hero-copy>p\{[^}]*-webkit-line-clamp:8[^}]*\}/u);
  assert.match(styles, /\.proto-brief p\{[^}]*-webkit-line-clamp:3[^}]*\}/u);
  assert.match(styles, /\.proto-headline p\{[^}]*-webkit-line-clamp:4[^}]*\}/u);
  assert.match(styles, /\.proto-rail p\{[^}]*-webkit-line-clamp:3[^}]*\}/u);
});

test("desktop hero clamp reserves glyph overflow without changing headline measure", async () => {
  const styles = await readFile(new URL("../../../app/globals.css", import.meta.url), "utf8");

  assert.match(
    styles,
    /@media\(min-width:1041px\)\{\.proto-hero-copy h1\{width:calc\(100% \+ 16px\);box-sizing:border-box;padding-right:16px\}\}/u,
  );
});

test("featured headline links to the full story and only the hero image is prioritized", async () => {
  const source = await readFile(new URL("./homepage.tsx", import.meta.url), "utf8");

  assert.match(source, /<h1><Link href=\{data\.featured\.href\}>\{data\.featured\.title\}<\/Link><\/h1>/u);
  assert.match(source, /<StoryImage story=\{data\.featured\} className="proto-photo proto-hero-photo" priority/u);
  assert.doesNotMatch(source, /heroDeck\.map\([\s\S]*?<StoryImage story=\{story\}[^>]*priority/u);
  assert.match(source, /loading=\{priority \? "eager" : "lazy"\}/u);
  assert.match(source, /fetchPriority=\{priority \? "high" : "auto"\}/u);
  assert.match(source, /getHeroImagePresentation\(story\.image\)/u);
  assert.match(source, /maxWidth: presentation\.maxWidth/u);
});
