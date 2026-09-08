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
  assert.match(source, /shouldRequestAutomaticLocation/u);
  assert.match(source, /name="latitude"/u);
  assert.match(source, /type="hidden"/u);
  assert.doesNotMatch(source, /type="number"[^>]*name="latitude"|name="latitude"[^>]*type="number"/u);
});

test("mobile editor filters categories and preserves ordered uploaded media invariants", () => {
  assert.match(source, /filter\(\(category\) => category\.languageId === fields\.languageId\)/u);
  assert.match(source, /<MediaUploader/u);
  assert.match(source, /ready=\{saveStatus\.persisted\}/u);
  assert.match(source, /type === "image"/u);
  assert.match(source, /Move media up/u);
  assert.match(source, /Move media down/u);
  assert.match(source, /Remove media/u);
});

test("editor owns attached-media hidden inputs after an uploader callback", () => {
  assert.match(uploader, /completedId && !onUploaded/u);
  assert.match(source, /fields\.media\.map\(\(item\) => <input[^>]+name="mediaIds"/u);
});

test("multiple completed uploader callbacks append distinct canonical media to the same story", () => {
  assert.match(source, /onUploaded=\{\(item\) => updateFields/u);
  assert.match(source, /current\.media\.some\(\(mediaItem\) => mediaItem\.id === item\.id\)/u);
  assert.match(source, /media: \[\.\.\.current\.media, item\]/u);
  assert.match(source, /fields\.media\.map\(\(item\) => <input key=\{item\.id\} name="mediaIds"/u);
});

test("an incomplete selected upload blocks review submission until canonical completion", () => {
  assert.match(uploader, /onPendingChange/u);
  assert.match(uploader, /const hasIncompleteUploads = uploads\.some\(\(upload\) => upload\.phase !== "complete"\)/u);
  assert.match(uploader, /onPendingChange\?\.\(hasIncompleteUploads\)/u);
  assert.match(source, /mediaUploadPending/u);
  assert.match(source, /onPendingChange=\{setUploadPending\}/u);
  assert.match(source, /canTransitionReporterStory/u);
});

test("draft autosave and uploads share a lock while incomplete media blocks submission", () => {
  assert.match(source, /withDraft=\{autosave\.withDraft\}/u);
  assert.match(source, /autosave\.getSnapshot\(\)/u);
  assert.match(source, /mediaPendingRef\.current/u);
  assert.match(uploader, /Remove file/u);
  assert.match(uploader, /current\.filter\(\(upload\) => upload\.id !== uploadId\)/u);
});

test("editor tracks generations and scopes recovery to its stable story ID", () => {
  assert.match(source, /createDraftSaveTracker/u);
  assert.match(source, /storageStoryId/u);
  assert.match(source, /autosave\.edit\(next\)/u);
});

test("new-story autosave retains its mounted editor and reloads the same canonical draft", () => {
  assert.match(source, /window\.history\.replaceState/u);
  assert.doesNotMatch(source, /router\.replace/u);
  assert.match(newPage, /resolveNewReporterDraftTarget/u);
  assert.match(newPage, /resolved\.needsCanonicalRedirect/u);
  assert.match(newPage, /getReporterStoryEditor\(actor\.userId, draftTarget\.storyId\)/u);
  assert.match(newPage, /story=\{existing\?\.story/u);
  assert.match(actions, /revalidateStories\(target\.storyId\)/u);
  assert.match(actions, /saved\.id !== target\.storyId/u);
});

test("mobile editor preserves the server language value contract without displaying an event-time field", () => {
  assert.match(source, /value=\{`\$\{language\.id\}:\$\{language\.code\}`\}/u);
  assert.doesNotMatch(source, /Event time \(India time\)/u);
  assert.doesNotMatch(source, /type="datetime-local"/u);
  assert.match(source, /name="eventOccurredAt"[^>]*type="hidden"|type="hidden"[^>]*name="eventOccurredAt"/u);
});

test("mobile editor requires captured private evidence for review or direct publication", () => {
  assert.match(source, /canTransitionReporterStory\(\{ dirty, mediaUploadPending, location, locality, now: new Date\(\) \}\)/u);
  assert.match(source, /submitAction/u);
  assert.match(source, /directAction/u);
  assert.match(source, /canDirectPublish/u);
  assert.match(source, /disabled=\{!canTransition \|\| transitionPending\}/u);
});

test("story submission automatically requests private location once and exposes retry only after failure", () => {
  assert.match(source, /shouldRequestAutomaticLocation/u);
  assert.match(source, /locationAttemptStarted\.current = true/u);
  assert.match(source, /useEffect\(\(\) => \{[\s\S]*captureLocation\(\)/u);
  assert.doesNotMatch(source, />Capture current location</u);
  assert.match(source, />Retry location</u);
  assert.match(source, /locationStatus === "error"/u);
});

test("successful private location capture is silent in the Reporter interface", () => {
  assert.doesNotMatch(source, /✓ Current location captured|Current location captured|Private capture:/u);
  assert.doesNotMatch(source, /location\.latitude\.toFixed|location\.longitude\.toFixed/u);
  assert.doesNotMatch(source, /Math\.round\(location\.accuracy\)|new Date\(location\.capturedAt\)\.toLocaleString/u);
  assert.match(source, /locationStatus === "error" \? <[\s\S]*\{locationMessage\}[\s\S]*Retry location/u);
});

test("existing private location evidence is reused without exposing coordinates as public story fields", () => {
  assert.match(source, /initialLocation/u);
  assert.match(source, /name="latitude"[^>]*type="hidden"|type="hidden"[^>]*name="latitude"/u);
  assert.match(source, /name="longitude"[^>]*type="hidden"|type="hidden"[^>]*name="longitude"/u);
  assert.doesNotMatch(source, /name="title"[^>]*location|name="summary"[^>]*location|name="body"[^>]*location/u);
});

test("submission transitions freeze mutable controls and clear only their exact recovery snapshot", () => {
  assert.match(source, /const transitionLocked = transitionPending \|\| transitionState\?\.status === "success"/u);
  assert.match(source, /<fieldset[^>]+disabled=\{transitionLocked\}/u);
  assert.match(source, /const transitionGeneration = saveTracker\.current\.snapshot\(\)/u);
  assert.match(source, /isCurrentGeneration\(transitionGeneration\)/u);
  assert.match(source, /transitionInFlight\.current/u);
  assert.match(source, /transitionSucceeded\.current/u);
  assert.match(source, /clearRecoveryBeforeRefresh\(clearRecovery, \(\) => router\.refresh\(\)\)/u);
  assert.match(source, /cleanupRequired/u);
  assert.match(source, /retryTransitionCleanup/u);
  assert.match(source, /Retry cleanup and refresh/u);
  assert.match(source, /<\/fieldset>[\s\S]*cleanupRequired/u);
  assert.match(source, /role="status"/u);
  assert.match(source, /finally \{ transitionInFlight\.current = false; \}/u);
  assert.doesNotMatch(source, /transitionState\?\.status === "success"\) clearRecovery\(\)/u);
});
