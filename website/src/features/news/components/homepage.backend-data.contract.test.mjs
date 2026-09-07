import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function sources() {
  return [
    await readFile(new URL("./homepage.tsx", import.meta.url), "utf8"),
    await readFile(new URL("./homepage-sections.tsx", import.meta.url), "utf8"),
  ];
}

test("homepage renders only snapshot collections through reusable sections", async () => {
  const [homepage, sections] = await sources();
  assert.doesNotMatch(homepage + sections, /const stories\s*=|const rails\s*=|Monsoon session opens|Cabinet clears|climate-ready neighbourhoods/u);
  for (const field of ["featured", "topHeadlines", "latest", "trending", "categoryRails", "editorPicks"]) {
    assert.match(homepage, new RegExp(`data\\.${field}`, "u"));
  }
  for (const component of ["HomepageHeroSection", "HomepageHeadlineSection", "HomepageFeedSection", "HomepageRankedSection", "HomepageCategoryRails", "HomepageEditorsSection"]) {
    assert.match(homepage, new RegExp(component, "u"));
  }
});

test("shared story images preserve priority and resolved hero presentation", async () => {
  const [, source] = await sources();
  assert.match(source, /HomepageStoryImage/u);
  assert.match(source, /loading=\{priority \? "eager" : "lazy"\}/u);
  assert.match(source, /fetchPriority=\{priority \? "high" : "auto"\}/u);
  assert.match(source, /getHeroImagePresentation\(story\.image\)/u);
  assert.match(source, /maxWidth: presentation\.maxWidth/u);
  assert.match(source, /<h1><Link href=\{story\.href\}>\{story\.title\}<\/Link><\/h1>/u);
});

test("homepage presentation no longer depends on legacy prototype selectors", async () => {
  const [homepage, sections] = await sources();
  assert.doesNotMatch(homepage + sections, /proto-/u);
  assert.match(sections, /toLedgerStory/u);
  assert.match(sections, /category: story\.categoryName \?\? "News"/u);
});
