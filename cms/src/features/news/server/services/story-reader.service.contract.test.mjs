import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("story reader composes premium collections from its existing repository queries", async () => {
  const source = await readFile(new URL("./story-reader.service.ts", import.meta.url), "utf8");

  assert.match(source, /composeInlineRelated/u);
  assert.match(source, /selectAdjacentStories/u);
  assert.match(source, /composeArticleSidebar/u);
  for (const field of ["inlineRelated", "previous", "next", "sidebar"]) {
    assert.match(source, new RegExp(`${field}:`, "u"));
  }
  assert.match(source, /getStoriesByCategory\(locale, category\.slug\)/u);
  assert.match(source, /getStoriesByLanguage\(locale\)/u);
  assert.doesNotMatch(source, /getHomepageData|getPublicBreakingAlerts/u);
  assert.equal(source.match(/from "\.\.\/[^\"]+\.repository"/g)?.length, 2);
});
