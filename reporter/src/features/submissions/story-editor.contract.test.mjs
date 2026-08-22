import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./story-editor.tsx", import.meta.url), "utf8");
const uploader = await readFile(new URL("./media-uploader.tsx", import.meta.url), "utf8");
const actions = await readFile(new URL("./submission.actions.ts", import.meta.url), "utf8");
const newPage = await readFile(new URL("../../app/(protected)/stories/new/page.tsx", import.meta.url), "utf8");

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

test("editor owns attached-media hidden inputs after an uploader callback", () => {
  assert.match(uploader, /completedId && !onUploaded/u);
  assert.match(source, /fields\.media\.map\(\(item\) => <input[^>]+name="mediaIds"/u);
});

test("editor tracks save attempts against edit generations and uses the new-draft recovery alias", () => {
  assert.match(source, /createDraftSaveTracker/u);
  assert.match(source, /storageStoryId/u);
  assert.match(source, /onSubmit=\{prepareSave\}/u);
});

test("new-story save migrates a stale local snapshot, clears its alias, and always routes to the returned editor", () => {
  assert.match(source, /migrateLocalDraft/u);
  assert.match(source, /acknowledgement\.stale/u);
  assert.match(source, /if \(!migrated\)/u);
  assert.match(source, /reportStorageFailure/u);
  assert.match(source, /if \(!acknowledgement\.clear && !acknowledgement\.stale\) return;/u);
  assert.match(source, /router\.replace\(`\/stories\/\$\{saveState\.storyId\}`\)/u);
  assert.match(newPage, /resolveNewReporterDraftTarget\(\(await searchParams\)\.draft, randomUUID\)/u);
  assert.match(newPage, /createNewReporterDraftTarget\(\(\) => resolved\.storyId\)/u);
  assert.match(newPage, /resolved\.needsCanonicalRedirect/u);
  assert.match(newPage, /resolveNewReporterDraftTarget/u);
  assert.match(newPage, /redirect\(`\/stories\/new\?draft=\$\{draftTarget\.storyId\}`\)/u);
  assert.match(newPage, /searchParams: Promise/u);
  assert.match(newPage, /storageStoryId="new"/u);
  assert.match(actions, /revalidateStories\(target\.storyId\)/u);
  assert.match(actions, /revalidatePath\("\/stories\/new"\)/u);
  assert.match(actions, /revalidatePath\(`\/stories\/\$\{id\}`\)/u);
  assert.match(actions, /updatedAt: saved\.updatedAt/u);
  assert.match(actions, /saved\.id !== target\.storyId/u);
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
