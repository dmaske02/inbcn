import assert from "node:assert/strict";
import test from "node:test";
import { getHomepageBlockDefinition } from "../homepage-builder.registry.ts";
import {
  draftFromSection,
  toHomepageSectionInput,
  validateHomepageEditorDraft,
} from "./homepage-editor.validation.ts";

const configurations = [
  ["hero-story", { storyId: "11111111-1111-4111-8111-111111111111" }],
  ["hero-sidebar", { storyIds: ["22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"] }],
  ["breaking-news", { limit: 10 }],
  ["live-tv", {}],
  ["latest-news", { limit: 12 }],
  ["category-section", { categoryId: "22222222-2222-4222-8222-222222222222", limit: 8 }],
  ["trending", { limit: 8 }],
  ["opinion", { limit: 6 }],
  ["advertisement-placeholder", { label: "Advertisement" }],
  ["custom-html-placeholder", { content: "Reserved module" }],
  ["future-placeholder", { note: "Future newsroom module" }],
];

function section(blockType, configuration, overrides = {}) {
  const definition = getHomepageBlockDefinition(blockType);
  return {
    id: `${blockType}-section`,
    homepageConfigurationId: "homepage-1",
    blockId: `${blockType}-main`,
    title: definition.type,
    blockType,
    renderer: definition.renderer,
    position: 0,
    container: "main",
    width: "full",
    enabled: true,
    startsAt: null,
    endsAt: null,
    configuration,
    createdBy: "editor-1",
    updatedBy: "editor-1",
    createdAt: "2026-08-11T09:00:00.000Z",
    updatedAt: "2026-08-11T09:00:00.000Z",
    ...overrides,
  };
}

test("all block drafts map to the existing validated section input contract", () => {
  for (const [blockType, configuration] of configurations) {
    const persisted = section(blockType, configuration);
    const definition = getHomepageBlockDefinition(blockType);
    const draft = draftFromSection(persisted);
    const input = toHomepageSectionInput(draft, definition);

    assert.deepEqual(input, {
      blockId: persisted.blockId,
      title: persisted.title,
      blockType,
      renderer: definition.renderer,
      container: "main",
      width: "full",
      enabled: true,
      startsAt: null,
      endsAt: null,
      configuration,
    });
    assert.deepEqual(validateHomepageEditorDraft(draft, definition), {});
  }
});

test("visual drafts expose typed fields rather than a configuration JSON value", () => {
  const hero = draftFromSection(section("hero-story", configurations[0][1]));
  const category = draftFromSection(section("category-section", configurations[5][1]));

  assert.equal(hero.storyId, "11111111-1111-4111-8111-111111111111");
  assert.equal(category.categoryId, "22222222-2222-4222-8222-222222222222");
  assert.equal(category.limit, 8);
  assert.equal("configuration" in hero, false);
  assert.equal("configuration" in category, false);
});

test("Hero Sidebar drafts preserve configured order and reject invalid selections", () => {
  const definition = getHomepageBlockDefinition("hero-sidebar");
  const draft = draftFromSection(section("hero-sidebar", configurations[1][1]));

  assert.deepEqual(draft.storyIds, [
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
  ]);
  assert.deepEqual(toHomepageSectionInput(draft, definition).configuration, configurations[1][1]);
  assert.deepEqual(validateHomepageEditorDraft(draft, definition), {});
  assert.equal(validateHomepageEditorDraft({ ...draft, storyIds: [] }, definition).storyIds, "Select between 1 and 3 unique stories.");
  assert.equal(validateHomepageEditorDraft({ ...draft, storyIds: [draft.storyIds[0], draft.storyIds[0]] }, definition).storyIds, "Select between 1 and 3 unique stories.");
  assert.equal(validateHomepageEditorDraft({ ...draft, storyIds: ["bad"] }, definition).storyIds, "Select between 1 and 3 unique stories.");
});

test("client validation mirrors common and block registry boundaries", () => {
  const definition = getHomepageBlockDefinition("hero-story");
  const draft = {
    ...draftFromSection(section("hero-story", { storyId: "" })),
    title: "   ",
    startsAt: "2026-08-11T12:00:00.000Z",
    endsAt: "2026-08-11T11:00:00.000Z",
  };

  const errors = validateHomepageEditorDraft(draft, definition);

  assert.equal(errors.title, "Enter a section title.");
  assert.equal(errors.storyId, "Select a valid story.");
  assert.equal(errors.endsAt, "Schedule end must be after schedule start.");
});

test("list and placeholder limits are reported against their visual fields", () => {
  const latestDefinition = getHomepageBlockDefinition("latest-news");
  const advertisementDefinition = getHomepageBlockDefinition("advertisement-placeholder");
  const latest = {
    ...draftFromSection(section("latest-news", { limit: 12 })),
    limit: 101,
  };
  const advertisement = {
    ...draftFromSection(section("advertisement-placeholder", { label: "Advertisement" })),
    label: " ",
  };

  assert.equal(validateHomepageEditorDraft(latest, latestDefinition).limit, "Choose between 1 and 100 items.");
  assert.equal(validateHomepageEditorDraft(advertisement, advertisementDefinition).label, "Enter an advertisement label.");
});

test("mapping rejects a registry definition for another block type", () => {
  const draft = draftFromSection(section("hero-story", configurations[0][1]));
  const wrongDefinition = getHomepageBlockDefinition("latest-news");

  assert.throws(
    () => toHomepageSectionInput(draft, wrongDefinition),
    /does not match the editor draft/u,
  );
});
