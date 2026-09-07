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

test("Hero Sidebar matches the public homepage supporting-story structure",async()=>{
  const source=await readFile("src/features/homepage-renderer/components/hero-sidebar-renderer.tsx","utf8");
  assert.match(source,/className="editorial-builder-hero-sidebar"/u);
  assert.match(source,/className="editorial-ledger-row log-row"/u);
  assert.match(source,/className="editorial-ledger-meta"/u);
  assert.match(source,/className="editorial-ledger-image"/u);
  assert.match(source,/className="editorial-ledger-copy"/u);
  assert.doesNotMatch(source,/proto-hero-sidebar/u);
});

test("Hero Sidebar keeps the public desktop, tablet, and mobile layout rules",async()=>{
  const css=await readFile("src/app/globals.css","utf8");
  assert.match(css,/\.editorial-builder-hero-composition\s*>\s*\.editorial-builder-hero-sidebar\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/su);
  assert.match(css,/\.editorial-ledger-image\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*10/su);
  assert.match(css,/@media\s*\(max-width:\s*820px\)[\s\S]*?\.editorial-builder-hero-composition\s*>\s*\.editorial-builder-hero-sidebar\s*\{[^}]*grid-template-columns:\s*1fr/su);
  assert.match(css,/@media\s*\(max-width:\s*640px\)[\s\S]*?\.editorial-builder-hero-composition\s*>\s*\.editorial-builder-hero-sidebar\s+\.editorial-ledger-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+116px/su);
});

test("Hero Supporting Stories is the direct grid child rather than a nested squeezed grid",async()=>{
  const layout=await readFile("src/features/homepage-renderer/components/homepage-builder-layout.tsx","utf8");
  assert.match(layout,/<div>\{item\.hero\.node\}<\/div>\s*\{item\.sidebar\.node\}/su);
  assert.doesNotMatch(layout,/<div className="editorial-builder-hero-sidebar">\{item\.sidebar\.node\}<\/div>/u);
});
