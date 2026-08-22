import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./story-editor.tsx", import.meta.url), "utf8");

test("mobile editor keeps local recovery and browser capture in one client island", () => {
  assert.match(source, /^"use client";/u);
  assert.match(source, /createDraftPersistence/u);
  assert.match(source, /captureCurrentLocation/u);
  assert.match(source, /Capture current location/u);
  assert.match(source, /name="latitude"/u);
  assert.match(source, /type="hidden"/u);
  assert.doesNotMatch(source, /type="number"[^>]*name="latitude"|name="latitude"[^>]*type="number"/u);
});

test("mobile editor filters categories and preserves ordered uploaded media invariants", () => {
  assert.match(source, /filter\(\(category\) => category\.languageId === fields\.languageId\)/u);
  assert.match(source, /<MediaUploader/u);
  assert.match(source, /isPersisted && editable/u);
  assert.match(source, /type === "image"/u);
  assert.match(source, /Move media up/u);
  assert.match(source, /Move media down/u);
  assert.match(source, /Remove media/u);
});

test("mobile editor preserves the server language value contract and renders ISO-Z event times for native inputs", () => {
  assert.match(source, /value=\{`\$\{language\.id\}:\$\{language\.code\}`\}/u);
  assert.match(source, /value\.endsWith\("Z"\)/u);
});

test("mobile editor requires captured private evidence for review or direct publication", () => {
  assert.match(source, /const canTransition = Boolean\(!dirty && location && isFreshCapture\(location\.capturedAt, new Date\(\)\) && locality\.trim\(\)\)/u);
  assert.match(source, /isFreshCapture\(location\.capturedAt, new Date\(\)\)/u);
  assert.match(source, /submitAction/u);
  assert.match(source, /directAction/u);
  assert.match(source, /canDirectPublish/u);
  assert.match(source, /disabled=\{!canTransition \|\| transitionPending\}/u);
});
