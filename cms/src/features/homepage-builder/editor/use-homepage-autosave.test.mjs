import assert from "node:assert/strict";
import test from "node:test";
import { createHomepageAutosaveScheduler } from "./use-homepage-autosave.ts";

function fakeClock() {
  let nextId = 1;
  const timers = new Map();
  return {
    setTimer(callback, delay) {
      const id = nextId++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimer(id) { timers.delete(id); },
    pending() { return [...timers.values()].map((timer) => timer.delay); },
    async runAll() {
      const active = [...timers.entries()];
      timers.clear();
      for (const [, timer] of active) timer.callback();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

function task(sectionId, revision, calls, result = { ok: true, data: `${sectionId}:${revision}` }) {
  return {
    sectionId,
    revision,
    onStart: (sequence) => calls.push(["start", sectionId, revision, sequence]),
    run: async (sequence) => (calls.push(["run", sectionId, revision, sequence]), result),
    onResult: (value, sequence) => calls.push(["result", sectionId, revision, sequence, value]),
    onError: (_error, sequence) => calls.push(["error", sectionId, revision, sequence]),
  };
}

test("debounce resets for a newer edit without creating duplicate Strict Mode saves", async () => {
  const clock = fakeClock();
  const calls = [];
  const scheduler = createHomepageAutosaveScheduler({ delay: 1000, setTimer: clock.setTimer, clearTimer: clock.clearTimer });

  scheduler.schedule(task("section-a", 1, calls));
  scheduler.schedule(task("section-a", 2, calls));
  scheduler.schedule(task("section-a", 2, calls));

  assert.deepEqual(clock.pending(), [1000]);
  await clock.runAll();
  assert.deepEqual(calls.filter(([type]) => type === "run"), [["run", "section-a", 2, 2]]);
});

test("independent sections retain independent debounce queues", async () => {
  const clock = fakeClock();
  const calls = [];
  const scheduler = createHomepageAutosaveScheduler({ delay: 1000, setTimer: clock.setTimer, clearTimer: clock.clearTimer });

  scheduler.schedule(task("section-a", 1, calls));
  scheduler.schedule(task("section-b", 1, calls));
  assert.deepEqual(clock.pending(), [1000, 1000]);
  await clock.runAll();
  assert.deepEqual(calls.filter(([type]) => type === "run").map((call) => call[1]), ["section-a", "section-b"]);
});

test("a failed revision does not loop and retries only explicitly or after another edit", async () => {
  const clock = fakeClock();
  const calls = [];
  const scheduler = createHomepageAutosaveScheduler({ delay: 1000, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  const failed = task("section-a", 1, calls, { ok: false, code: "PERSISTENCE", message: "Failed" });

  scheduler.schedule(failed);
  await clock.runAll();
  scheduler.schedule(failed);
  assert.deepEqual(clock.pending(), []);
  scheduler.retry(failed);
  assert.deepEqual(clock.pending(), [1000]);
  await clock.runAll();
  scheduler.schedule(task("section-a", 2, calls));
  assert.deepEqual(clock.pending(), [1000]);
});

test("cleanup cancels pending work and permits one Strict Mode remount schedule", async () => {
  const clock = fakeClock();
  const calls = [];
  const scheduler = createHomepageAutosaveScheduler({ delay: 1000, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  const pending = task("section-a", 1, calls);

  scheduler.schedule(pending);
  scheduler.cancelAll();
  assert.deepEqual(clock.pending(), []);
  scheduler.schedule(pending);
  await clock.runAll();
  assert.equal(calls.filter(([type]) => type === "run").length, 1);
});

test("a stale response cannot publish after its section is invalidated", async () => {
  const clock = fakeClock();
  const results = [];
  let resolveFirst;
  let resolveSecond;
  const scheduler = createHomepageAutosaveScheduler({ delay: 1000, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  const deferred = (sectionId, revision, assign) => ({
    sectionId,
    revision,
    onStart() {},
    run: () => new Promise((resolve) => assign(resolve)),
    onResult: (value) => results.push(value),
    onError() {},
  });

  scheduler.schedule(deferred("section-a", 1, (resolve) => { resolveFirst = resolve; }));
  await clock.runAll();
  scheduler.cancel("section-a");
  resolveFirst("stale");
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  scheduler.schedule(deferred("section-a", 2, (resolve) => { resolveSecond = resolve; }));
  await clock.runAll();
  resolveSecond("newest");
  await Promise.resolve();
  assert.deepEqual(results, ["newest"]);
});

test("invalidated sections cancel their pending save", async () => {
  const clock = fakeClock();
  const calls = [];
  const scheduler = createHomepageAutosaveScheduler({ delay: 1000, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  scheduler.schedule(task("section-a", 1, calls));
  scheduler.cancel("section-a");
  await clock.runAll();
  assert.deepEqual(calls, []);
});

test("invalid newer input cancels only pending work and still confirms an active server DTO", async () => {
  const clock = fakeClock();
  const results = [];
  let resolveActive;
  const scheduler = createHomepageAutosaveScheduler({ delay: 1000, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  scheduler.schedule({
    sectionId: "section-a",
    revision: 1,
    onStart() {},
    run: () => new Promise((resolve) => { resolveActive = resolve; }),
    onResult: (value) => results.push(value),
    onError() {},
  });
  await clock.runAll();
  scheduler.cancelPending("section-a");
  resolveActive("confirmed-base");
  await Promise.resolve();
  assert.deepEqual(results, ["confirmed-base"]);
});
