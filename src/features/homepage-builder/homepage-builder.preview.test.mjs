import assert from "node:assert/strict";
import test from "node:test";
import { buildHomepagePreview } from "./homepage-builder.preview.ts";

const storyId = "11111111-1111-4111-8111-111111111111";
const categoryId = "22222222-2222-4222-8222-222222222222";
const secondaryStoryId = "33333333-3333-4333-8333-333333333333";
const section = (overrides = {}) => ({ id:"s", homepageConfigurationId:"h", blockId:"lead", title:"Lead", blockType:"hero-story", renderer:"hero-story", position:0, container:"main", width:"full", enabled:true, startsAt:null, endsAt:null, configuration:{ storyId }, createdBy:null, updatedBy:null, createdAt:"", updatedAt:"", ...overrides });
const references = { stories:[{ id:storyId, languageId:"lang-en", title:"Story" }, { id:secondaryStoryId, languageId:"lang-en", title:"Secondary" }], categories:[{ id:categoryId, languageId:"lang-en", name:"News" }], liveTv:{ id:"live-en", languageId:"lang-en", title:"Live" } };

test("preview is ordered and excludes disabled or inactive sections", () => {
  const preview = buildHomepagePreview("en", [section({ id:"future", position:3, startsAt:"2026-08-12T00:00:00Z" }), section({ id:"disabled", position:2, enabled:false }), section({ id:"second", blockId:"latest", blockType:"latest-news", renderer:"latest-news", position:1, configuration:{ limit:4 } }), section()], references, new Date("2026-08-11T00:00:00Z"));
  assert.deepEqual(preview.sections.map((item) => item.id), ["s", "second"]);
  assert.equal(preview.sections[0].configuration.story.title, "Story");
});

test("preview rejects missing story, category, and Live TV references", () => {
  assert.throws(() => buildHomepagePreview("en", [section()], { ...references, stories:[] }), /story is missing/u);
  assert.throws(() => buildHomepagePreview("en", [section({ blockType:"category-section", renderer:"category-section", configuration:{ categoryId, limit:4 } })], { ...references, categories:[] }), /category is missing/u);
  assert.throws(() => buildHomepagePreview("en", [section({ blockType:"live-tv", renderer:"live-tv", configuration:{} })], { ...references, liveTv:null }), /Live TV configuration is missing/u);
});

test("preview preserves only the Hero Sidebar storyIds configuration", () => {
  const preview = buildHomepagePreview("en", [section({ blockType:"hero-sidebar", renderer:"hero-sidebar", configuration:{ storyIds:[secondaryStoryId] } })], references);
  assert.deepEqual(preview.sections[0].configuration, { storyIds:[secondaryStoryId] });
});
