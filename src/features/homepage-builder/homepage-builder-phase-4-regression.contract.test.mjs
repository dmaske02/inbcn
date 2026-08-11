import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Hero Sidebar uses the existing autosave, ordering, mutation, preview, and permission pipelines",async()=>{
  const workspace=await readFile("src/features/homepage-builder/components/workspace/homepage-builder-workspace.tsx","utf8");
  const ordering=await readFile("src/features/homepage-builder/components/sections/section-list.tsx","utf8");
  const actions=await readFile("src/features/homepage-builder/homepage-builder.actions.ts","utf8");
  const preview=await readFile("src/features/homepage-builder/preview/homepage-editor-preview.service.ts","utf8");
  assert.match(workspace,/useHomepageAutosave/u);
  assert.match(ordering,/moveHomepageSectionTo/u);
  assert.match(ordering,/duplicateHomepageSection/u);
  assert.match(ordering,/deleteHomepageSection/u);
  assert.match(actions,/requireAdminUser/u);
  assert.match(actions,/hero-sidebar/u);
  assert.match(preview,/preparePersistedHomepageBuilder/u);
});

test("Hero Sidebar leaves Hero Story and the legacy homepage data model unchanged",async()=>{
  const registry=await readFile("src/features/homepage-builder/homepage-builder.registry.ts","utf8");
  const heroDefinition=registry.match(/\["hero-story"[^\n]+/u)?.[0] ?? "";
  const legacyHomepage=await readFile("src/features/news/components/homepage.tsx","utf8");
  const homepageModel=await readFile("src/features/news/server/services/homepage.service.ts","utf8");
  assert.match(heroDefinition,/storyId/u);
  assert.doesNotMatch(heroDefinition,/storyIds|hero-sidebar/u);
  assert.doesNotMatch(legacyHomepage,/hero-sidebar|HeroSidebar/u);
  assert.doesNotMatch(homepageModel,/hero-sidebar|HeroSidebar/u);
});
