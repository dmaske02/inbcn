import assert from "node:assert/strict";
import test from "node:test";

import { createLiveTvOperations } from "./live-tv.operations.ts";

const editor = { id: "editor-id", role: "editor" };
const admin = { id: "admin-id", role: "admin" };
const input = {
  languageId: "11111111-1111-4111-8111-111111111111",
  streamTitle: "INBCN English Live",
  shortDescription: "Live newsroom coverage.",
  provider: "youtube",
  providerUrl: "https://youtu.be/dQw4w9WgXcQ",
  status: "scheduled",
  posterUrl: "https://res.cloudinary.com/demo/image/upload/poster.jpg",
  posterAltText: "INBCN newsroom",
  autoplay: false,
  muted: true,
  currentProgramme: "Evening Bulletin",
  programmeDescription: "The day's most important stories.",
  scheduleStart: "2099-08-07T12:00:00.000Z",
  scheduleEnd: "2099-08-07T13:00:00.000Z",
  relatedStoryId: null,
  relatedCategoryId: null,
  seoTitle: "INBCN Live",
  seoDescription: "Watch INBCN live.",
  openGraphImageUrl: null,
  canonicalUrl: null,
};

function fixture() {
  const calls = [];
  const repository = {
    create: async (value) => { calls.push(["create", value]); return { id: "stream-id", ...value }; },
    update: async (id, value) => { calls.push(["update", id, value]); return { id, ...value }; },
    remove: async (id) => { calls.push(["remove", id]); },
  };
  return { calls, operations: createLiveTvOperations(repository, { allowedHlsHosts: [] }) };
}

test("an editor creates a localized stream and persists its schedule and audit identity", async () => {
  const { calls, operations } = fixture();
  await operations.create(editor, input);
  assert.equal(calls[0][0], "create");
  assert.equal(calls[0][1].language_id, input.languageId);
  assert.equal(calls[0][1].internal_name, input.streamTitle);
  assert.equal(calls[0][1].starts_at, input.scheduleStart);
  assert.equal(calls[0][1].created_by, editor.id);
  assert.equal(calls[0][1].updated_by, editor.id);
});

test("an editor updates and publishes through the repository write boundary", async () => {
  const { calls, operations } = fixture();
  await operations.update(editor, "stream-id", { ...input, status: "live", scheduleStart: "" });
  assert.equal(calls[0][0], "update");
  assert.equal(calls[0][1], "stream-id");
  assert.equal(calls[0][2].status, "live");
  assert.equal(calls[0][2].updated_by, editor.id);
});

test("writers cannot mutate Live TV settings", async () => {
  const { operations } = fixture();
  await assert.rejects(() => operations.create({ id: "writer-id", role: "writer" }, input), /permission/u);
});

test("only administrators can delete a Live TV configuration", async () => {
  const { calls, operations } = fixture();
  await assert.rejects(() => operations.remove(editor, "stream-id"), /administrator/u);
  await operations.remove(admin, "stream-id");
  assert.deepEqual(calls, [["remove", "stream-id"]]);
});
