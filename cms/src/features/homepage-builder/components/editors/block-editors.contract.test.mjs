import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const directory = "src/features/homepage-builder/components/editors";

async function sources() {
  const names = [
    "shared-section-fields.tsx",
    "hero-story-editor.tsx",
    "hero-sidebar-editor.tsx",
    "category-section-editor.tsx",
    "list-block-editor.tsx",
    "live-tv-editor.tsx",
    "advertisement-editor.tsx",
    "placeholder-editor.tsx",
  ];
  return Object.fromEntries(await Promise.all(names.map(async (name) => [name, await readFile(`${directory}/${name}`, "utf8")])));
}

test("Hero and Category editors use human-readable pickers without identifier inputs", async () => {
  const source = await sources();
  assert.match(source["hero-story-editor.tsx"], /<StoryPicker/u);
  assert.match(source["hero-story-editor.tsx"], /selectedStory/u);
  assert.match(source["category-section-editor.tsx"], /<CategoryPicker/u);
  assert.match(source["category-section-editor.tsx"], /publishedStoryCount/u);
  assert.doesNotMatch(source["hero-story-editor.tsx"], /type="hidden"|name="storyId"/u);
  assert.doesNotMatch(source["category-section-editor.tsx"], /type="hidden"|name="categoryId"/u);
});

test("Hero Sidebar editor exposes three accessible Story Pickers and prevents duplicate selections", async () => {
  const source = await sources();
  const sidebar = source["hero-sidebar-editor.tsx"];
  assert.match(sidebar, /Secondary Story \{index \+ 1\}/u);
  assert.match(sidebar, /<StoryPicker/u);
  assert.match(sidebar, /storyIds/u);
  assert.match(sidebar, /already selected/u);
  assert.match(sidebar, /aria-live="polite"/u);
  assert.match(sidebar, /selectedStoriesById\[draft\.storyIds\[index\] \?\? ""\]/u);
  assert.doesNotMatch(sidebar, /type="hidden"|name="storyIds"|JSON/u);
});

test("shared and block editors cover approved visual controls and zero-configuration states", async () => {
  const source = await sources();
  assert.match(source["shared-section-fields.tsx"], /Section title/u);
  assert.match(source["shared-section-fields.tsx"], /Starts at/u);
  assert.match(source["shared-section-fields.tsx"], /Container/u);
  assert.match(source["list-block-editor.tsx"], /Story count/u);
  assert.match(source["list-block-editor.tsx"], /min=\{1\}/u);
  assert.match(source["list-block-editor.tsx"], /max=\{100\}/u);
  assert.match(source["live-tv-editor.tsx"], /automatically uses the Live TV configuration/u);
  assert.doesNotMatch(source["live-tv-editor.tsx"], /<input|<select|<textarea/u);
  assert.match(source["advertisement-editor.tsx"], /Advertisement slot/u);
  assert.match(source["advertisement-editor.tsx"], /slots\.includes/u);
  assert.match(source["placeholder-editor.tsx"], /never executes HTML/u);
  assert.doesNotMatch(source["placeholder-editor.tsx"], /dangerouslySetInnerHTML/u);
});

test("supported visual editors never render developer persistence controls", async () => {
  const source = Object.values(await sources()).join("\n");
  for (const forbidden of ["Configuration JSON", "Renderer", "Block ID", "UUID"]) {
    assert.doesNotMatch(source, new RegExp(`>${forbidden}<|${forbidden} field`, "iu"));
  }
  assert.doesNotMatch(source, /name="configuration"|name="renderer"|name="blockId"/u);
  assert.doesNotMatch(source, /<textarea[^>]*configuration/iu);
});
