import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Hero Sidebar renders nothing when no stories remain available",async()=>{
  const source=await readFile("src/features/homepage-renderer/components/hero-sidebar-renderer.tsx","utf8");
  assert.match(source,/if \(!stories\.length\) return null/u);
});

test("Hero Sidebar renders accessible linked story details",async()=>{
  const source=await readFile("src/features/homepage-renderer/components/hero-sidebar-renderer.tsx","utf8");
  assert.match(source,/aria-label=\{title\}/u);
  assert.match(source,/stories\.map/u);
  assert.match(source,/LedgerStoryRow/u);
  assert.match(source,/toLedgerStory/u);
  assert.match(source,/showActions=\{false\}/u);
  assert.match(source,/className="editorial-builder-hero-sidebar"/u);
  assert.doesNotMatch(source,/proto-/u);
});
