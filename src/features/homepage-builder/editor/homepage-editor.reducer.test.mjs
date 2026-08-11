import assert from "node:assert/strict";
import test from "node:test";
import {
  createHomepageEditorState,
  homepageEditorReducer,
} from "./homepage-editor.reducer.ts";
import { draftFromSection } from "./homepage-editor.validation.ts";

function section(overrides = {}) {
  return {
    id: "section-1",
    homepageConfigurationId: "homepage-1",
    blockId: "hero-main",
    title: "Lead story",
    blockType: "hero-story",
    renderer: "hero-story",
    position: 0,
    container: "main",
    width: "full",
    enabled: true,
    startsAt: null,
    endsAt: null,
    configuration: { storyId: "11111111-1111-4111-8111-111111111111" },
    createdBy: "editor-1",
    updatedBy: "editor-1",
    createdAt: "2026-08-11T09:00:00.000Z",
    updatedAt: "2026-08-11T09:00:00.000Z",
    ...overrides,
  };
}

test("initialization creates server-confirmed drafts and selects the requested section", () => {
  const first = section();
  const second = section({
    id: "section-2",
    blockId: "latest",
    title: "Latest news",
    blockType: "latest-news",
    renderer: "latest-news",
    position: 1,
    configuration: { limit: 12 },
  });

  const state = createHomepageEditorState([first, second], second.id);

  assert.deepEqual(state.baseSections, [first, second]);
  assert.deepEqual(state.orderedIds, [first.id, second.id]);
  assert.equal(state.selectedSectionId, second.id);
  assert.equal(state.draftsBySectionId[second.id].limit, 12);
  assert.deepEqual(state.dirtySectionIds, []);
  assert.equal(state.saveStateById[first.id].status, "idle");
  assert.equal(state.viewport, "desktop");
});

test("editing marks only the changed section dirty and save errors preserve its draft", () => {
  const original = section();
  let state = createHomepageEditorState([original]);
  const edited = { ...draftFromSection(original), title: "Updated lead" };

  state = homepageEditorReducer(state, {
    type: "edit-field",
    sectionId: original.id,
    draft: edited,
  });
  state = homepageEditorReducer(state, {
    type: "validation-set",
    sectionId: original.id,
    errors: { title: "Check this title." },
  });
  state = homepageEditorReducer(state, {
    type: "save-started",
    sectionId: original.id,
    requestSequence: 1,
    draftRevision: 1,
  });
  state = homepageEditorReducer(state, {
    type: "save-failed",
    sectionId: original.id,
    requestSequence: 1,
    code: "PERSISTENCE",
    message: "Could not save the section.",
  });

  assert.deepEqual(state.dirtySectionIds, [original.id]);
  assert.equal(state.draftsBySectionId[original.id].title, "Updated lead");
  assert.deepEqual(state.validationById[original.id], { title: "Check this title." });
  assert.deepEqual(state.saveStateById[original.id], {
    status: "error",
    requestSequence: 1,
    savedDraftRevision: 0,
    message: "Could not save the section.",
  });
  assert.equal(state.previewRevision, 0);
});

test("a confirmed save replaces canonical state and clears the acknowledged draft", () => {
  const original = section();
  const persisted = section({
    title: "Updated lead",
    updatedAt: "2026-08-11T09:01:00.000Z",
  });
  let state = createHomepageEditorState([original]);
  state = homepageEditorReducer(state, {
    type: "edit-field",
    sectionId: original.id,
    draft: { ...draftFromSection(original), title: persisted.title },
  });
  state = homepageEditorReducer(state, {
    type: "save-started",
    sectionId: original.id,
    requestSequence: 3,
    draftRevision: 1,
  });
  state = homepageEditorReducer(state, {
    type: "save-succeeded",
    sectionId: original.id,
    requestSequence: 3,
    savedDraftRevision: 1,
    section: persisted,
  });

  assert.deepEqual(state.baseSections, [persisted]);
  assert.equal(state.draftsBySectionId[original.id].title, persisted.title);
  assert.deepEqual(state.dirtySectionIds, []);
  assert.deepEqual(state.saveStateById[original.id], {
    status: "saved",
    requestSequence: 3,
    savedDraftRevision: 1,
  });
  assert.equal(state.previewRevision, 1);
});

test("stale save responses cannot overwrite a newer request or draft", () => {
  const original = section();
  let state = createHomepageEditorState([original]);
  state = homepageEditorReducer(state, {
    type: "edit-field",
    sectionId: original.id,
    draft: { ...draftFromSection(original), title: "First edit" },
  });
  state = homepageEditorReducer(state, {
    type: "save-started",
    sectionId: original.id,
    requestSequence: 1,
    draftRevision: 1,
  });
  state = homepageEditorReducer(state, {
    type: "edit-field",
    sectionId: original.id,
    draft: { ...draftFromSection(original), title: "Second edit" },
  });
  state = homepageEditorReducer(state, {
    type: "save-started",
    sectionId: original.id,
    requestSequence: 2,
    draftRevision: 2,
  });

  const stale = homepageEditorReducer(state, {
    type: "save-succeeded",
    sectionId: original.id,
    requestSequence: 1,
    savedDraftRevision: 1,
    section: section({ title: "First edit" }),
  });
  assert.equal(stale, state);

  const current = homepageEditorReducer(state, {
    type: "save-succeeded",
    sectionId: original.id,
    requestSequence: 2,
    savedDraftRevision: 1,
    section: section({ title: "First edit" }),
  });
  assert.equal(current.baseSections[0].title, "First edit");
  assert.equal(current.draftsBySectionId[original.id].title, "Second edit");
  assert.deepEqual(current.dirtySectionIds, [original.id]);
  assert.equal(current.saveStateById[original.id].status, "dirty");
  assert.equal(current.previewRevision, 1);
});

test("conflict responses retain local work and expose a distinct conflict state", () => {
  const original = section();
  let state = createHomepageEditorState([original]);
  state = homepageEditorReducer(state, {
    type: "edit-field",
    sectionId: original.id,
    draft: { ...draftFromSection(original), title: "Local edit" },
  });
  state = homepageEditorReducer(state, {
    type: "save-started",
    sectionId: original.id,
    requestSequence: 4,
    draftRevision: 1,
  });
  state = homepageEditorReducer(state, {
    type: "save-failed",
    sectionId: original.id,
    requestSequence: 4,
    code: "CONFLICT",
    message: "Changed elsewhere—reload required.",
  });

  assert.equal(state.draftsBySectionId[original.id].title, "Local edit");
  assert.equal(state.saveStateById[original.id].status, "conflict");
  assert.deepEqual(state.dirtySectionIds, [original.id]);
});

test("optimistic reorder can return exactly to the last server-confirmed order", () => {
  const first = section();
  const second = section({ id: "section-2", blockId: "latest", position: 1 });
  const third = section({ id: "section-3", blockId: "opinion", position: 2 });
  let state = createHomepageEditorState([first, second, third]);

  state = homepageEditorReducer(state, {
    type: "reorder-optimistic",
    orderedIds: [third.id, first.id, second.id],
  });
  assert.deepEqual(state.orderedIds, [third.id, first.id, second.id]);

  state = homepageEditorReducer(state, { type: "reorder-reverted" });
  assert.deepEqual(state.orderedIds, [first.id, second.id, third.id]);
});

test("server-confirmed ordering updates canonical positions without discarding local drafts", () => {
  const first = section();
  const second = section({ id: "section-2", blockId: "latest", position: 1 });
  let state = createHomepageEditorState([first, second]);
  state = homepageEditorReducer(state, {
    type: "edit-field",
    sectionId: first.id,
    draft: { ...draftFromSection(first), title: "Unsaved title" },
  });
  state = homepageEditorReducer(state, {
    type: "reorder-optimistic",
    orderedIds: [second.id, first.id],
  });
  state = homepageEditorReducer(state, {
    type: "reorder-succeeded",
    sections: [{ ...second, position: 0 }, { ...first, position: 1 }],
  });

  assert.deepEqual(state.orderedIds, [second.id, first.id]);
  assert.deepEqual(state.baseSections.map((item) => [item.id, item.position]), [[second.id, 0], [first.id, 1]]);
  assert.equal(state.draftsBySectionId[first.id].title, "Unsaved title");
  assert.deepEqual(state.dirtySectionIds, [first.id]);
  assert.equal(state.previewRevision, 1);
});

test("duplicate inserts optimistically, accepts server identity, and rolls back exactly", () => {
  const first = section();
  const second = section({ id: "section-2", blockId: "latest", position: 1 });
  const initial = createHomepageEditorState([first, second]);
  const optimistic = homepageEditorReducer(initial, {
    type: "duplicate-optimistic",
    sourceSectionId: first.id,
    temporaryId: "temporary-copy",
  });
  assert.deepEqual(optimistic.orderedIds, [first.id, "temporary-copy", second.id]);
  assert.equal(optimistic.selectedSectionId, "temporary-copy");

  const reverted = homepageEditorReducer(optimistic, { type: "structural-reverted" });
  assert.deepEqual(reverted, initial);

  const confirmedCopy = section({ id: "copy", blockId: "hero-copy", title: "Lead story Copy", position: 1 });
  const confirmed = homepageEditorReducer(optimistic, {
    type: "duplicate-succeeded",
    temporaryId: "temporary-copy",
    section: confirmedCopy,
    sections: [{ ...first, position: 0 }, confirmedCopy, { ...second, position: 2 }],
  });
  assert.deepEqual(confirmed.orderedIds, [first.id, confirmedCopy.id, second.id]);
  assert.equal(confirmed.selectedSectionId, confirmedCopy.id);
  assert.equal(confirmed.previewRevision, 1);
});

test("delete removes optimistically, restores exactly, and selects the nearest confirmed section", () => {
  const first = section();
  const second = section({ id: "section-2", blockId: "latest", position: 1 });
  const initial = createHomepageEditorState([first, second], first.id);
  const optimistic = homepageEditorReducer(initial, { type: "delete-optimistic", sectionId: first.id });
  assert.deepEqual(optimistic.orderedIds, [second.id]);
  assert.equal(optimistic.selectedSectionId, second.id);

  assert.deepEqual(homepageEditorReducer(optimistic, { type: "structural-reverted" }), initial);

  const confirmed = homepageEditorReducer(optimistic, {
    type: "delete-succeeded",
    sectionId: first.id,
    sections: [{ ...second, position: 0 }],
  });
  assert.deepEqual(confirmed.orderedIds, [second.id]);
  assert.equal(confirmed.selectedSectionId, second.id);
  assert.equal(confirmed.previewRevision, 1);
});

test("duplicate, delete, selection, viewport, and locale events remain deterministic", () => {
  const first = section();
  const duplicate = section({
    id: "section-copy",
    blockId: "hero-copy",
    title: "Lead story Copy",
    position: 1,
  });
  let state = createHomepageEditorState([first]);

  state = homepageEditorReducer(state, { type: "select", sectionId: first.id });
  state = homepageEditorReducer(state, { type: "delete-requested", sectionId: first.id });
  assert.equal(state.pendingDeleteId, first.id);
  state = homepageEditorReducer(state, { type: "delete-cancelled" });
  state = homepageEditorReducer(state, { type: "duplicate-succeeded", section: duplicate });
  assert.deepEqual(state.orderedIds, [first.id, duplicate.id]);
  assert.equal(state.selectedSectionId, duplicate.id);

  state = homepageEditorReducer(state, { type: "delete-succeeded", sectionId: duplicate.id });
  assert.deepEqual(state.orderedIds, [first.id]);
  assert.equal(state.selectedSectionId, first.id);

  state = homepageEditorReducer(state, { type: "viewport-changed", viewport: "mobile" });
  state = homepageEditorReducer(state, { type: "locale-changed", sections: [], selectedSectionId: null });
  assert.equal(state.viewport, "mobile");
  assert.deepEqual(state.baseSections, []);
  assert.equal(state.selectedSectionId, null);
  assert.equal(state.pendingDeleteId, null);
});

test("explicit section creation keeps an incomplete visual draft separate until the server confirms it", () => {
  const first = section();
  const draft = {
    ...draftFromSection(section({
      id: "new-section",
      blockId: "new-section",
      title: "Latest News",
      blockType: "latest-news",
      renderer: "latest-news",
      configuration: { limit: 12 },
    })),
  };
  let state = createHomepageEditorState([first]);

  state = homepageEditorReducer(state, { type: "new-section-started", draft });
  assert.deepEqual(state.newSectionDraft, draft);
  assert.deepEqual(state.baseSections, [first]);

  state = homepageEditorReducer(state, {
    type: "new-section-changed",
    draft: { ...draft, title: "Latest headlines" },
  });
  assert.equal(state.newSectionDraft.title, "Latest headlines");

  const created = section({
    id: "created-section",
    blockId: "latest-server-id",
    title: "Latest headlines",
    blockType: "latest-news",
    renderer: "latest-news",
    position: 1,
    configuration: { limit: 12 },
  });
  state = homepageEditorReducer(state, { type: "new-section-succeeded", section: created });
  assert.equal(state.newSectionDraft, null);
  assert.deepEqual(state.orderedIds, [first.id, created.id]);
  assert.equal(state.selectedSectionId, created.id);
  assert.equal(state.previewRevision, 1);

  state = homepageEditorReducer(state, { type: "new-section-started", draft });
  state = homepageEditorReducer(state, { type: "new-section-cancelled" });
  assert.equal(state.newSectionDraft, null);
});
