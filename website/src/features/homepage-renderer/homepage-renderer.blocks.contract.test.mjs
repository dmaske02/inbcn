import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
test("all block renderers reuse approved presentation boundaries",async()=>{const source=await readFile("src/features/homepage-renderer/components/homepage-block-renderers.tsx","utf8");for(const name of ["renderHeroStory","renderHeroSidebar","renderBreakingNews","renderLiveTv","renderLatestNews","renderCategorySection","renderTrending","renderOpinion","renderAdvertisement","renderCustomHtmlPlaceholder","renderFuturePlaceholder"])assert.match(source,new RegExp(`export function ${name}`,"u"));assert.match(source,/HomepageHeroSection/u);assert.match(source,/HeroSidebarRenderer/u);assert.match(source,/HomepageCategoryRails/u);assert.match(source,/LiveTvPlayer/u);assert.match(source,/AdvertisementPlaceholder/u);assert.doesNotMatch(source,/dangerouslySetInnerHTML|supabase|repository/iu);});

test("Hero renderers remain independent",async()=>{
  const sidebar=await readFile("src/features/homepage-renderer/components/hero-sidebar-renderer.tsx","utf8");
  assert.doesNotMatch(sidebar,/renderHeroStory|HomepageHeroSection|hero-story/u);
  const blocks=await readFile("src/features/homepage-renderer/components/homepage-block-renderers.tsx","utf8");
  const sidebarFunction=blocks.slice(blocks.indexOf("export function renderHeroSidebar"),blocks.indexOf("export function renderBreakingNews"));
  assert.doesNotMatch(sidebarFunction,/renderHeroStory|HomepageHeroSection/u);
});
