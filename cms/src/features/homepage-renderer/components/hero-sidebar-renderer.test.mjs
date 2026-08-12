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
  assert.match(source,/HomepageStoryImage/u);
  assert.match(source,/story\.href/u);
  assert.match(source,/story\.title/u);
  assert.match(source,/story\.summary/u);
  assert.match(source,/story\.categoryName/u);
  assert.match(source,/publishedLabel\(locale,story\.publishedAt\)/u);
  assert.match(source,/<article/u);
});
