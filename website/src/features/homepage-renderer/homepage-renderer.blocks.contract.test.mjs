import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
test("all block renderers reuse approved editorial presentation boundaries",async()=>{const source=await readFile("src/features/homepage-renderer/components/homepage-block-renderers.tsx","utf8");for(const name of ["renderHeroStory","renderHeroSidebar","renderBreakingNews","renderLiveTv","renderLatestNews","renderCategorySection","renderTrending","renderOpinion","renderAdvertisement","renderCustomHtmlPlaceholder","renderFuturePlaceholder"])assert.match(source,new RegExp(`export function ${name}`,"u"));assert.match(source,/HomepageHeroSection/u);assert.match(source,/HeroSidebarRenderer/u);assert.match(source,/HomepageCategoryRails/u);assert.match(source,/LiveTvPlayer/u);assert.match(source,/EditorialSectionHeader/u);assert.match(source,/EditorialSponsorRow/u);assert.doesNotMatch(source,/AdvertisementPlaceholder|proto-|dangerouslySetInnerHTML|supabase|repository/iu);});

test("Hero renderers remain independent",async()=>{
  const sidebar=await readFile("src/features/homepage-renderer/components/hero-sidebar-renderer.tsx","utf8");
  assert.doesNotMatch(sidebar,/renderHeroStory|HomepageHeroSection|hero-story/u);
  const blocks=await readFile("src/features/homepage-renderer/components/homepage-block-renderers.tsx","utf8");
  const sidebarFunction=blocks.slice(blocks.indexOf("export function renderHeroSidebar"),blocks.indexOf("export function renderBreakingNews"));
  assert.doesNotMatch(sidebarFunction,/renderHeroStory|HomepageHeroSection/u);
});

test("Homepage Builder Live TV uses the inverted briefing with player and schedule",async()=>{
  const [blocks,css]=await Promise.all([
    readFile("src/features/homepage-renderer/components/homepage-block-renderers.tsx","utf8"),
    readFile("src/app/globals.css","utf8"),
  ]);
  const liveRenderer=blocks.slice(blocks.indexOf("export function renderLiveTv"));
  assert.match(liveRenderer,/editorial-live-briefing/u);
  assert.match(liveRenderer,/editorial-live-programme/u);
  assert.match(liveRenderer,/view\.schedule/u);
  assert.match(liveRenderer,/LiveTvPlayer/u);
  assert.match(css,/\.editorial-live-briefing\s*\{[^}]*background:\s*var\(--editorial-inverted\)/su);
});
