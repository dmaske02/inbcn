import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const directory = "src/features/homepage-builder/components/pickers";
const read = (name) => readFile(`${directory}/${name}`, "utf8");

test("Story Picker uses the authenticated locale-aware action and renders editorial summaries", async () => {
  const source = await read("story-picker.tsx");
  assert.match(source, /^"use client";/u);
  assert.match(source, /searchHomepageStories/u);
  assert.match(source, /locale=\{locale\}/u);
  assert.match(source, /thumbnail/u);
  assert.match(source, /publishedAt/u);
  assert.match(source, /category\?\.name/u);
  assert.doesNotMatch(source, /\{item\.id\}/u);
  assert.match(source, /title = "Choose a hero story"/u);
  assert.match(source, /triggerLabel = selected \? "Change story" : "Choose story"/u);
});

test("Category Picker uses the authenticated locale-aware action and published counts", async () => {
  const source = await read("category-picker.tsx");
  assert.match(source, /^"use client";/u);
  assert.match(source, /searchHomepageCategories/u);
  assert.match(source, /locale=\{locale\}/u);
  assert.match(source, /publishedStoryCount/u);
  assert.doesNotMatch(source, /\{item\.id\}/u);
});

test("picker dialog debounces, resets pagination, rejects stale responses, and restores focus", async () => {
  const source = await read("picker-dialog.tsx");
  assert.match(source, /setTimeout\([^]*300\)/u);
  assert.ok(source.indexOf("setLoading(true)") > source.indexOf("window.setTimeout"));
  assert.match(source, /setPage\(1\)/u);
  assert.match(source, /requestSequence/u);
  assert.match(source, /sequence !== requestSequence\.current/u);
  assert.match(source, /onCloseAutoFocus/u);
  assert.match(source, /triggerRef\.current\?\.focus\(\)/u);
  assert.match(source, /useId\(\)/u);
  assert.match(source, /requestSequence\.current \+= 1/u);
  assert.match(source, /DialogPrimitive\.Title/u);
  assert.match(source, /DialogPrimitive\.Description/u);
  assert.match(source, /aria-label=\{searchLabel\}/u);
  assert.match(source, /autoFocus/u);
});

test("story publication dates use the selected locale deterministically", async () => {
  const source = await read("story-picker.tsx");
  assert.match(source, /en-IN/u);
  assert.match(source, /hi-IN/u);
  assert.match(source, /mr-IN/u);
  assert.match(source, /Intl\.DateTimeFormat\(dateLocale/u);
});

test("picker results expose loading, empty, error, and keyboard-selectable result states", async () => {
  const results = await read("picker-results.tsx");
  const pagination = await read("picker-pagination.tsx");
  assert.match(results, /role="status"/u);
  assert.match(results, /role="alert"/u);
  assert.match(results, /No results found/u);
  assert.match(results, /<button/u);
  assert.match(results, /onKeyDown/u);
  assert.match(results, /event\.key === "Enter"/u);
  assert.match(pagination, /Previous/u);
  assert.match(pagination, /Next/u);
  assert.match(pagination, /aria-label="Picker pagination"/u);
});
