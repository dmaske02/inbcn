import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { validateHomepageReferences, validateHeroSidebarAdjacency } from "./homepage-builder.service-core.ts";

const storyId="11111111-1111-4111-8111-111111111111", categoryId="22222222-2222-4222-8222-222222222222";
const base = { blockId:"x", title:"X", renderer:"hero-story", container:"main", width:"full", enabled:true, startsAt:null, endsAt:null };
const refs = { stories:[{id:storyId,languageId:"en-id",title:"Story"}], categories:[{id:categoryId,languageId:"en-id",name:"News"}], liveTv:{id:"live",languageId:"en-id",title:"Live"} };

test("reference validation accepts same-language story, category, and Live TV records", () => {
  validateHomepageReferences({...base,blockType:"hero-story",configuration:{storyId}},refs,"en-id");
  validateHomepageReferences({...base,blockType:"category-section",configuration:{categoryId,limit:4}},refs,"en-id");
  validateHomepageReferences({...base,blockType:"live-tv",configuration:{}},refs,"en-id");
});

test("reference validation rejects missing and cross-locale records", () => {
  assert.throws(()=>validateHomepageReferences({...base,blockType:"hero-story",configuration:{storyId}},refs,"hi-id"),/this language/u);
  assert.throws(()=>validateHomepageReferences({...base,blockType:"category-section",configuration:{categoryId}},refs,"mr-id"),/this language/u);
  assert.throws(()=>validateHomepageReferences({...base,blockType:"live-tv",configuration:{}},refs,"hi-id"),/Live TV/u);
});

const section = (id, blockType, position, configuration) => ({
  id,
  homepageConfigurationId: "config",
  blockId: id,
  title: id,
  blockType,
  renderer: blockType,
  position,
  container: "main",
  width: "full",
  enabled: true,
  startsAt: null,
  endsAt: null,
  configuration,
  createdBy: null,
  updatedBy: null,
  createdAt: "2026-08-12T00:00:00.000Z",
  updatedAt: "2026-08-12T00:00:00.000Z",
});

test("adjacent Hero Story and Hero Sidebar cannot select the same story", () => {
  const hero = section("hero", "hero-story", 0, { storyId });
  const sidebar = section("sidebar", "hero-sidebar", 1, { storyIds: [categoryId] });

  assert.doesNotThrow(() => validateHeroSidebarAdjacency(
    { blockType: "hero-sidebar", configuration: { storyIds: [categoryId] } },
    [hero, sidebar],
    1,
  ));
  assert.throws(() => validateHeroSidebarAdjacency(
    { blockType: "hero-sidebar", configuration: { storyIds: [storyId] } },
    [hero, sidebar],
    1,
  ), /Hero Story/u);
  assert.throws(() => validateHeroSidebarAdjacency(
    { blockType: "hero-story", configuration: { storyId: categoryId } },
    [hero, sidebar],
    0,
  ), /Hero Sidebar/u);
});

test("non-adjacent Hero Sidebar selections remain independent", () => {
  const sections = [
    section("hero", "hero-story", 0, { storyId }),
    section("latest", "latest-news", 1, { limit: 5 }),
    section("sidebar", "hero-sidebar", 2, { storyIds: [storyId] }),
  ];
  assert.doesNotThrow(() => validateHeroSidebarAdjacency(
    { blockType: "hero-sidebar", configuration: { storyIds: [storyId] } },
    sections,
    2,
  ));
});

test("reordered sections are rejected when drag-and-drop creates an adjacent duplicate", () => {
  const hero = section("hero", "hero-story", 0, { storyId });
  const latest = section("latest", "latest-news", 1, { limit: 5 });
  const sidebar = section("sidebar", "hero-sidebar", 2, { storyIds: [storyId] });
  const reordered = [hero, { ...sidebar, position: 1 }, { ...latest, position: 2 }];

  assert.throws(() => validateHeroSidebarAdjacency(
    { blockType: "hero-sidebar", configuration: sidebar.configuration },
    reordered,
    1,
  ), /Hero Story/u);
});

test("visual service performs targeted validation for every Hero Sidebar story", async () => {
  const source = await readFile("src/features/homepage-builder/homepage-builder.service.ts", "utf8");
  assert.match(source, /input\.blockType === "hero-sidebar"/u);
  assert.match(source, /for \(const storyId of storyIds\)/u);
  assert.match(source, /findPublishedStoryForLocale\(storyId, locale\)/u);
  assert.match(source, /validateHeroSidebarAdjacency/u);
  assert.match(source, /validateProposedHeroSidebarOrder/u);
});
