import assert from "node:assert/strict";
import test from "node:test";

import {
  NEW_REPORTER_DRAFT_ID,
  chooseLocalDraft,
  createDraftPersistence,
  createDraftSaveTracker,
  draftStorageKey,
  loadLocalDraft,
  saveLocalDraft,
} from "./local-draft.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const storyId = "22222222-2222-4222-8222-222222222222";
const local = {
  version: 1,
  userId,
  storyId,
  updatedAt: "2026-08-23T12:01:00.000Z",
  fields: {
    title: "Water main repaired",
    summary: "Supply has resumed.",
    body: "Crews completed repairs before noon.",
    languageCode: "en",
    languageId: "33333333-3333-4333-8333-333333333333",
    categoryId: "44444444-4444-4444-8444-444444444444",
    eventOccurredAt: "2026-08-23T11:00:00.000Z",
    media: [{ id: "55555555-5555-4555-8555-555555555555", title: "Road", type: "image" }],
    featuredMediaId: "55555555-5555-4555-8555-555555555555",
  },
};

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
    values,
  };
}

test("scopes versioned local drafts exactly to a reporter and stable story UUID", () => {
  assert.equal(draftStorageKey(userId, storyId), `inbcn:reporter-draft:${userId}:${storyId}`);
  assert.equal(saveLocalDraft(memoryStorage(), local), true);
  assert.equal(JSON.stringify(local).includes("latitude"), false);
  assert.equal(JSON.stringify(local).includes("capturedAt"), false);
});

test("uses one discoverable current-user new-draft alias without weakening UUID scoping", () => {
  const draft = { ...local, storyId: NEW_REPORTER_DRAFT_ID };
  const storage = memoryStorage();
  assert.equal(draftStorageKey(userId, NEW_REPORTER_DRAFT_ID), `inbcn:reporter-draft:${userId}:new`);
  assert.equal(saveLocalDraft(storage, draft), true);
  assert.deepEqual(loadLocalDraft(storage, userId, NEW_REPORTER_DRAFT_ID), draft);
  assert.equal(loadLocalDraft(storage, "99999999-9999-4999-8999-999999999999", NEW_REPORTER_DRAFT_ID), null);
});

test("loads only bounded current-version drafts for their matching owner and story", () => {
  const key = draftStorageKey(userId, storyId);
  const storage = memoryStorage({ [key]: JSON.stringify(local) });
  assert.deepEqual(loadLocalDraft(storage, userId, storyId), local);
  for (const patch of [
    { version: 2 },
    { userId: "99999999-9999-4999-8999-999999999999" },
    { storyId: "99999999-9999-4999-8999-999999999999" },
    { fields: { ...local.fields, title: "x".repeat(241) } },
  ]) {
    storage.values.set(key, JSON.stringify({ ...local, ...patch }));
    assert.equal(loadLocalDraft(storage, userId, storyId), null);
  }
});

test("ignores corrupt or oversized records and safely handles disabled or quota storage", () => {
  const key = draftStorageKey(userId, storyId);
  const storage = memoryStorage({ [key]: "{" });
  assert.equal(loadLocalDraft(storage, userId, storyId), null);
  storage.values.set(key, "x".repeat(20_001));
  assert.equal(loadLocalDraft(storage, userId, storyId), null);
  const broken = {
    getItem() { throw new Error("disabled"); },
    setItem() { throw new Error("quota"); },
    removeItem() { throw new Error("disabled"); },
  };
  assert.equal(loadLocalDraft(broken, userId, storyId), null);
  assert.equal(saveLocalDraft(broken, local), false);
});

test("retains bounded partial editor fields, including an empty event time and body beyond fifteen thousand characters", () => {
  const partial = {
    ...local,
    fields: { ...local.fields, body: "x".repeat(50_000), eventOccurredAt: "", languageCode: "", languageId: "", categoryId: "" },
  };
  const storage = memoryStorage();
  assert.equal(saveLocalDraft(storage, partial), true);
  assert.deepEqual(loadLocalDraft(storage, userId, storyId), partial);
});

test("offers restoration only when a validated local draft is newer than the server", () => {
  assert.equal(chooseLocalDraft(local, "2026-08-23T12:00:00.000Z"), "restore");
  assert.equal(chooseLocalDraft(local, "2026-08-23T12:01:00.000Z"), "server");
  assert.equal(chooseLocalDraft(null, "2026-08-23T12:00:00.000Z"), "server");
});

test("debounces edits, flushes on blur, and clears only when asked after a confirmed save", () => {
  const storage = memoryStorage();
  const timers = [];
  const persistence = createDraftPersistence(storage, {
    setTimeout(callback) { timers.push(callback); return timers.length - 1; },
    clearTimeout(id) { timers[id] = null; },
  });
  persistence.schedule(local);
  persistence.schedule({ ...local, updatedAt: "2026-08-23T12:02:00.000Z" });
  assert.equal(storage.values.size, 0);
  assert.equal(timers.filter(Boolean).length, 1);
  timers.find(Boolean)();
  assert.equal(loadLocalDraft(storage, userId, storyId)?.updatedAt, "2026-08-23T12:02:00.000Z");
  persistence.schedule(local);
  persistence.flush();
  assert.equal(loadLocalDraft(storage, userId, storyId)?.updatedAt, local.updatedAt);
  persistence.clear(userId, storyId);
  assert.equal(loadLocalDraft(storage, userId, storyId), null);
});

test("acknowledges only the exact saved edit generation and handles repeated successes", () => {
  const tracker = createDraftSaveTracker();
  tracker.edit();
  const first = tracker.beginSave();
  tracker.edit();
  assert.equal(tracker.acknowledge({ ...first, status: "success" }).clear, false);
  const second = tracker.beginSave();
  assert.equal(tracker.acknowledge({ ...second, status: "success" }).clear, true);
  const third = tracker.beginSave();
  assert.equal(tracker.acknowledge({ ...third, status: "success" }).clear, true);
  tracker.edit();
  assert.equal(tracker.isCurrentGeneration(third.generation), false);
});
