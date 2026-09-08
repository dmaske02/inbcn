import assert from 'node:assert/strict';
import test from 'node:test';

const autosaveModule = await import('./story-autosave.ts').catch(() => ({}));
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function setup(save = async () => ({ status: 'success', storyId: 'reserved-id' }), persisted = false) {
  assert.equal(typeof autosaveModule.createStoryAutosave, 'function', 'autosave coordinator must exist');
  const timers = new Map(); let next = 0;
  const calls = [];
  const editor = autosaveModule.createStoryAutosave({
    initial: { title: '', media: [] }, persisted,
    canSave: value => Boolean(value.title.trim()),
    save: async value => { calls.push(value); return save(value); },
    timer: { setTimeout(fn, ms) { assert.equal(ms, 750); timers.set(++next, fn); return next; }, clearTimeout(id) { timers.delete(id); } },
  });
  return { editor, calls, timers, async tick() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); await editor.flush(); } };
}

test('autosave waits for meaningful valid input and debounces rapid edits', async () => {
  const { editor, calls, timers, tick } = setup();
  editor.edit({ title: '', media: [] }); await tick(); assert.equal(calls.length, 0);
  for (const title of ['N', 'Ne', 'News']) editor.edit({ title, media: [] });
  assert.equal(calls.length, 0); assert.equal(timers.size, 1);
  await tick(); assert.deepEqual(calls.map(c => c.title), ['News']);
  assert.deepEqual(editor.getSnapshot(), { status: 'saved', dirty: false, persisted: true });
});

test('overlapping creation and saves preserve the latest generation with one writer', async () => {
  const gate = deferred(); let active = 0; let maximum = 0;
  const { editor, calls } = setup(async () => { maximum = Math.max(maximum, ++active); await gate.promise; active--; return { status: 'success' }; });
  editor.edit({ title: 'First', media: [] }); const first = editor.flush();
  await Promise.resolve(); assert.equal(editor.getSnapshot().status, 'saving');
  editor.edit({ title: 'Latest', media: [] }); const second = editor.flush(); const third = editor.flush();
  gate.resolve(); await Promise.all([first, second, third]);
  assert.deepEqual(calls.map(c => c.title), ['First', 'Latest']); assert.equal(maximum, 1);
  assert.equal(editor.getSnapshot().dirty, false);
});

test('save failure retains input and retry saves the same latest snapshot', async () => {
  let fail = true;
  const { editor, calls } = setup(async () => { if (fail) throw Error('offline'); return { status: 'success' }; });
  editor.edit({ title: 'Keep my story', media: [] }); await editor.flush();
  assert.deepEqual(editor.getSnapshot(), { status: 'error', dirty: true, persisted: false });
  fail = false; await editor.flush(); assert.equal(editor.getSnapshot().status, 'saved');
  assert.deepEqual(calls[0], calls[1]);
});

test('unsuccessful action responses never acknowledge a persisted draft', async () => {
  const { editor } = setup(async () => ({ status: 'error' }));
  editor.edit({ title: 'Story', media: [] }); await editor.flush();
  assert.equal(editor.getSnapshot().persisted, false); assert.equal(editor.getSnapshot().status, 'error');
});

test('media selected during creation waits for the draft and shares the save lock', async () => {
  const gate = deferred(); const events = [];
  const { editor, calls } = setup(async () => { events.push('saving'); await gate.promise; events.push('saved'); return { status: 'success' }; });
  editor.edit({ title: 'Story', media: [] }); const saving = editor.flush();
  const media = editor.withDraft(async () => { events.push('upload'); editor.edit({ title: 'Story', media: ['canonical-id'] }); });
  await Promise.resolve(); assert.deepEqual(events, ['saving']);
  gate.resolve(); await Promise.all([saving, media]); await editor.flush();
  assert.deepEqual(events.slice(0, 3), ['saving', 'saved', 'upload']);
  assert.deepEqual(calls.at(-1).media, ['canonical-id']);
});

test('media completion cannot be detached by an older in-flight autosave', async () => {
  const { editor, calls } = setup(undefined, true); const gate = deferred();
  const upload = editor.withDraft(async () => { await gate.promise; editor.edit({ title: 'New', media: ['id'] }); });
  editor.edit({ title: 'Old snapshot', media: [] }); const save = editor.flush();
  gate.resolve(); await Promise.all([upload, save]);
  assert.deepEqual(calls, [{ title: 'New', media: ['id'] }]);
});

test('failed media releases the lock so story edits can still save', async () => {
  const { editor } = setup(undefined, true);
  await assert.rejects(editor.withDraft(async () => { throw Error('upload failed'); }));
  editor.edit({ title: 'Still editable', media: [] }); await editor.flush();
  assert.equal(editor.getSnapshot().status, 'saved');
});

test('unpersisted media is refused and resumed drafts need no create save', async () => {
  const fresh = setup(); await assert.rejects(fresh.editor.withDraft(async () => {}));
  const resumed = setup(undefined, true); await resumed.editor.withDraft(async () => {});
  assert.equal(resumed.calls.length, 0); assert.equal(resumed.editor.getSnapshot().persisted, true);
});

test('autosave never submits and stop prevents queued writes after explicit submission', async () => {
  const { editor, calls } = setup(undefined, true);
  editor.stop(); editor.edit({ title: 'Too late', media: [] }); await editor.flush(); assert.equal(calls.length, 0);
});
