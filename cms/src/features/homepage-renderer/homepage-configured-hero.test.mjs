import assert from "node:assert/strict";
import test from "node:test";
import { createHomepageRendererService } from "./homepage-renderer.service-core.ts";
import { buildHomepagePreview } from "../homepage-builder/homepage-builder.preview.ts";
import { resolveHomepageRendererPayload } from "./homepage-renderer.references.ts";
import { parseHomepageRendererPayload } from "./homepage-renderer.contract.ts";
import { createHomepageBuilderOperations } from "../homepage-builder/homepage-builder.operations.ts";
import { createHomepageEditorState, homepageEditorReducer } from "../homepage-builder/editor/homepage-editor.reducer.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
function story(id, locale = "en") {
  return { id, slug: id, href: `/${locale}/story/${id}`, title: id === A ? "Amrit Bharat (fixture)" : "New selected story (fixture)", summary: "Published test story", publishedAt: "2026-01-01T00:00:00Z", categoryId: "category", categoryName: "News", categorySlug: "news", isBreaking: false, isFeatured: id === A, image: { src: "/images/news/story-fallback.svg", alt: "", unoptimized: true, width: null, height: null, aspectRatio: null } };
}
function fixture({ outsideFeed = false, brokenCategory = true, heroOverrides = {}, target = story(B) } = {}) {
  let saved = { id: "hero", homepageConfigurationId: "config-en", blockId: "hero-en", title: "Hero Story", blockType: "hero-story", renderer: "hero-story", position: 0, container: "main", width: "full", enabled: true, startsAt: null, endsAt: null, configuration: { storyId: A }, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", ...heroOverrides };
  const calls = [];
  const repository = {
    getSection: async () => structuredClone(saved),
    updateSectionIfCurrent: async (id, timestamp, values) => {
      assert.equal(id, saved.id); assert.equal(timestamp, saved.updatedAt);
      saved = { ...saved, ...values, updatedAt: "2026-01-02T00:00:00Z" };
      return structuredClone(saved);
    },
  };
  const deps = {
    loadLegacy: async (locale) => {
      const stories = [story(A, locale), ...(!outsideFeed ? [story(B, locale)] : [])];
      return { all: stories, featured: stories[0], breaking: [], pinnedAlert: null, topHeadlines: [], latest: stories.slice(1), trending: [], categoryRails: [], editorPicks: [] };
    },
    loadConfiguration: async (locale) => {
      calls.push(["config", locale]);
      return { configuration: { id: `config-${locale}`, locale, languageId: `language-${locale}` }, sections: locale === "en" ? [structuredClone(saved), ...(brokenCategory ? [{ ...saved, id: "category", position: 1, blockType: "category-section", renderer: "category-section", configuration: { categoryId: "33333333-3333-4333-8333-333333333333", limit: 3 } }] : [])] : [] };
    },
    loadStory: async (locale, id) => { calls.push(["story", locale, id]); return target; },
    composePreview: (config, homepage) => buildHomepagePreview(config.configuration.locale, config.sections, { stories: homepage.all.map(s => ({ id: s.id, languageId: config.configuration.languageId, title: s.title })), categories: [], liveTv: null }),
    resolvePayload: resolveHomepageRendererPayload,
    validatePayload: parseHomepageRendererPayload,
    renderSection: section => section.data.kind === "story" ? section.data.story.id : section.id,
    log: () => {},
  };
  return { repository, calls, render: createHomepageRendererService(deps), operations: createHomepageBuilderOperations(repository) };
}

test("changing the persisted Hero Story changes the center preview despite another section requiring fallback", async () => {
  const f = fixture();
  assert.equal((await f.render("en", true)).legacy.featured.id, A);
  const row = await f.repository.getSection();
  let state = createHomepageEditorState([row]);
  state = homepageEditorReducer(state, { type: "edit-field", sectionId: row.id, draft: { ...state.draftsBySectionId[row.id], storyId: B } });
  state = homepageEditorReducer(state, { type: "save-started", sectionId: row.id, requestSequence: 1 });
  const saved = await f.operations.updateIfCurrent({ id: "editor", role: "editor" }, row.id, row.homepageConfigurationId, row.updatedAt, { ...row, configuration: { storyId: B } });
  state = homepageEditorReducer(state, { type: "save-succeeded", sectionId: row.id, requestSequence: 1, savedDraftRevision: state.draftRevisionById[row.id], section: saved });
  assert.equal(state.previewRevision, 1);
  assert.equal(saved.configuration.storyId, B);
  for (const locale of ["en", "en", "hi", "mr", "en"]) {
    const result = await f.render(locale, true);
    assert.equal(result.legacy.featured.id, locale === "en" ? B : A);
    assert.ok(result.legacy.featured.href.startsWith(`/${locale}/`));
    assert.equal(result.legacy.latest[0].id, B, "existing non-Hero section content is preserved");
  }
  assert.equal(createHomepageEditorState([await f.repository.getSection()]).draftsBySectionId.hero.storyId, B);
});

test("an explicit published hero outside the latest feed is resolved by ID for builder and fallback output", async () => {
  for (const brokenCategory of [false, true]) {
    const f = fixture({ outsideFeed: true, brokenCategory, heroOverrides: { configuration: { storyId: B } } });
    const result = await f.render("en", true);
    assert.equal(result.kind === "builder" ? result.sections[0].node : result.legacy.featured.id, B);
    assert.deepEqual(f.calls, [["config", "en"], ["story", "en", B]]);
  }
});

test("disabled and scheduled-out heroes preserve the existing default", async () => {
  for (const override of [{ enabled: false }, { startsAt: "2099-01-01T00:00:00Z" }, { startsAt: "2000-01-01T00:00:00Z", endsAt: "2001-01-01T00:00:00Z" }]) {
    const f = fixture({ heroOverrides: { configuration: { storyId: B }, ...override } });
    assert.equal((await f.render("en", true)).legacy.featured.id, A);
  }
});

test("unavailable or cross-locale explicit heroes are never substituted with the default story", async () => {
  for (const target of [null, story(B, "mr")]) {
    const f = fixture({ outsideFeed: true, target, heroOverrides: { configuration: { storyId: B } } });
    assert.equal((await f.render("en", true)).legacy.featured, null);
  }
});
