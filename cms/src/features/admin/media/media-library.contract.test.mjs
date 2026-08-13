import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const library = await readFile(new URL("./media-library.tsx", import.meta.url), "utf8");
const service = await readFile(new URL("./media.service.ts", import.meta.url), "utf8");
const upload = await readFile(new URL("./media-upload-form.tsx", import.meta.url), "utf8");
const actions = await readFile(new URL("./media.actions.ts", import.meta.url), "utf8");

test("library exposes server-backed search, type, date, and pagination controls", () => {
  assert.match(library, /name="search"/u);
  assert.match(library, /name="type"/u);
  assert.match(library, /name="date"/u);
  assert.match(library, /<Pagination/u);
  assert.match(service, /mediaType/u);
  assert.match(service, /createdAfter/u);
});

test("grid uses optimized thumbnails and an accessible preview dialog", () => {
  assert.match(library, /thumbnailUrl/u);
  assert.match(library, /MediaPreviewDialog/u);
  assert.match(library, /sm:grid-cols-2/u);
  assert.match(library, /xl:grid-cols-3/u);
});

test("upload form announces selection, progress, success, and errors", () => {
  assert.match(upload, /selectedFileName/u);
  assert.match(upload, /aria-live="polite"/u);
  assert.match(upload, /role=\{state\.status === "error" \? "alert" : "status"\}/u);
});

test("upload form lets the function action provide POST FormData semantics", () => {
  assert.match(upload, /<form action=\{formAction\}/u);
  assert.doesNotMatch(upload, /\b(?:encType|method)=/u);
  assert.match(upload, /name="file"/u);
  assert.match(upload, /type="file"/u);
  assert.match(actions, /uploadMediaAction\([\s\S]*formData: FormData/u);
  assert.match(actions, /const file = formData\.get\("file"\)/u);
  assert.match(actions, /file instanceof File/u);
});

test("empty messaging distinguishes library, search, filter, and out-of-range states", () => {
  assert.match(library, /Your media library is empty/u);
  assert.match(library, /No media matches your search/u);
  assert.match(library, /No media matches these filters/u);
  assert.match(library, /This page has no media/u);
});
