import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const homepagePath = new URL("./homepage.tsx", import.meta.url);
const sectionsPath = new URL("./homepage-sections.tsx", import.meta.url);
const cssPath = new URL("../../../app/globals.css", import.meta.url);

test("homepage keeps every snapshot collection while adopting editorial composition", async () => {
  const [homepage, sections] = await Promise.all([
    readFile(homepagePath, "utf8"),
    readFile(sectionsPath, "utf8"),
  ]);

  for (const field of ["featured", "topHeadlines", "latest", "trending", "categoryRails", "editorPicks"]) {
    assert.match(homepage, new RegExp(`data\\.${field}`, "u"));
  }
  for (const component of [
    "HomepageHeroSection",
    "HomepageHeadlineSection",
    "HomepageFeedSection",
    "HomepageRankedSection",
    "HomepageCategoryRails",
    "HomepageEditorsSection",
  ]) {
    assert.match(homepage + sections, new RegExp(`export function ${component}|<${component}`, "u"));
  }
  assert.match(homepage, /className="editorial-page editorial-homepage"/u);
  assert.match(homepage, /className="editorial-container editorial-homepage-inner"/u);
  assert.match(homepage, /<div className="editorial-page editorial-homepage">/u);
  assert.doesNotMatch(homepage, /<main className="editorial-page editorial-homepage">/u);
  assert.doesNotMatch(homepage + sections, /proto-/u);
});

test("homepage hero is a 5:4 split with stable 16:10 image-first media", async () => {
  const [sections, css] = await Promise.all([
    readFile(sectionsPath, "utf8"),
    readFile(cssPath, "utf8"),
  ]);

  assert.match(sections, /getHeroImagePresentation\(story\.image\)/u);
  assert.match(sections, /priority=\{priority\}/u);
  assert.match(sections, /fetchPriority=\{priority \? "high" : "auto"\}/u);
  assert.match(sections, /className="editorial-home-hero"/u);
  assert.ok(
    sections.indexOf("editorial-home-hero-media") < sections.indexOf("editorial-home-hero-copy"),
    "hero media must precede copy in DOM order for mobile image-first rendering",
  );
  assert.match(css, /\.editorial-home-hero\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*5fr\) minmax\(0,\s*4fr\)/su);
  assert.match(
    css,
    /\.editorial-home-hero\s*\{[^}]*align-items:\s*center/su,
    "grid stretching must not distort the lead image's 16:10 frame",
  );
  assert.match(css, /\.editorial-home-hero-media,\s*\.editorial-home-editors-media\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*10/su);
  assert.match(
    css,
    /\.editorial-home-hero-media,\s*\.editorial-home-editors-media\s*\{[^}]*min-width:\s*0/su,
    "intrinsic image sizing must not overflow the hero grid track",
  );
  assert.match(
    css,
    /\.editorial-home-hero-media img,\s*\.editorial-home-editors-media img\s*\{[^}]*width:\s*100%[^}]*height:\s*100%/su,
    "lead images must fill their reserved 16:10 frame",
  );
  assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*\.editorial-home-hero\s*\{[^}]*grid-template-columns:\s*1fr/su);
});

test("homepage feeds and discovery consume shared ledger and ranked primitives", async () => {
  const [homepage, sections, css] = await Promise.all([
    readFile(homepagePath, "utf8"),
    readFile(sectionsPath, "utf8"),
    readFile(cssPath, "utf8"),
  ]);

  for (const primitive of [
    "EditorialSectionHeader",
    "EditorialSponsorRow",
    "LedgerStoryRow",
    "RankedStoryList",
    "StoryActionButtons",
  ]) {
    assert.match(homepage + sections, new RegExp(primitive, "u"));
  }
  assert.match(homepage, /className="editorial-home-discovery"/u);
  assert.match(css, /\.editorial-home-discovery\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*2fr\) minmax\(0,\s*1fr\)/su);
  assert.match(sections, /Editor&apos;s pick/u);
  assert.match(sections, /href=\{`\/\$\{locale\}\/category\/\$\{category\.slug\}`\}/u);
});
