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

test("an incomplete selected upload blocks review submission until canonical completion", () => {
  assert.match(uploader, /onPendingChange/u);
  assert.match(uploader, /onPendingChange\?\.\(selectedFile !== null\)/u);
  assert.match(uploader, /onUploaded\?\.\([\s\S]*onPendingChange\?\.\(false\)/u);
  const failedUpload = uploader.slice(uploader.indexOf("} catch (error)"), uploader.indexOf("return ("));
  assert.doesNotMatch(failedUpload, /onPendingChange\?\.\(false\)/u);
  assert.match(source, /mediaUploadPending/u);
  assert.match(source, /onPendingChange=\{setMediaUploadPending\}/u);
  assert.match(source, /canTransitionReporterStory/u);
});

test("an incomplete selected upload blocks draft saving until completion or removal", () => {
  assert.match(source, /canSaveReporterDraft/u);
  assert.match(source, /event\.preventDefault\(\)/u);
  assert.match(source, /disabled=\{!canSaveDraft\}/u);
  assert.match(source, /Upload or remove the selected file before saving\./u);
  assert.match(uploader, /Remove selected file/u);
  assert.match(uploader, /onPendingChange\?\.\(false\)/u);
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

test("mobile editor preserves the server language value contract without displaying an event-time field", () => {
  assert.match(source, /value=\{`\$\{language\.id\}:\$\{language\.code\}`\}/u);
  assert.doesNotMatch(source, /Event time \(India time\)/u);
  assert.doesNotMatch(source, /type="datetime-local"/u);
  assert.match(source, /name="eventOccurredAt"[^>]*type="hidden"|type="hidden"[^>]*name="eventOccurredAt"/u);
});

test("mobile editor requires captured private evidence for review or direct publication", () => {
  assert.match(source, /const canTransition = canTransitionReporterStory\(\{ dirty, mediaUploadPending, location, locality, now: new Date\(\) \}\)/u);
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
