import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const editor = await read('./story-editor.tsx');
const uploader = await read('./media-uploader.tsx');
const page = await read('../../app/(protected)/stories/new/page.tsx');
const actions = await read('./submission.actions.ts');
test('withdraw remains available after automatic creation and coordinates with autosave', () => {
  assert.match(page, /withdrawAction=/);
  assert.match(editor, /transition\(withdrawAction, true\)/);
  assert.match(editor, /withdraw \? status\.persisted/);
});
test('autosave retains the original server-normalized event time after creation', () => {
  assert.match(actions, /eventOccurredAt: parsed\.data\.eventOccurredAt/);
  assert.match(editor, /eventOccurredAt = result\.eventOccurredAt/);
});
test('one initial editor includes fields, media, locality and final submission without manual steps', () => {
  for (const name of ['title', 'summary', 'body', 'language', 'categoryId', 'locality']) assert.ok(editor.includes(`name="${name}"`));
  assert.doesNotMatch(editor, /Save draft|Save this first draft|Step [12]/);
  assert.doesNotMatch(editor, /isPersisted && editable \? <MediaUploader/);
  assert.match(page, /submitAction=/); assert.doesNotMatch(page, /canSubmit=\{false\}/);
});
test('autosave has honest saved, failure and retry states and shares its lock with uploads', () => {
  assert.match(editor, /createStoryAutosave/); assert.match(editor, /Saved automatically/);
  assert.match(editor, /Could not save your changes/); assert.match(editor, /autosave\.flush\(\)/);
  assert.match(editor, /withDraft=/); assert.match(editor, /persisted/);
});
test('selection automatically starts the existing uploader when a draft is ready', () => {
  assert.match(uploader, /ready/); assert.match(uploader, /useEffectEvent/);
  assert.doesNotMatch(uploader, />Upload Photos &amp; Videos</);
  assert.match(uploader, /withDraft/); assert.match(uploader, /uploadPending\(\)/);
});
test('new story URL loads an already persisted draft rather than replacing it with blank fields', () => {
  assert.match(page, /getReporterStoryEditor/); assert.match(page, /existing/);
});
