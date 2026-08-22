import assert from "node:assert/strict";
import test from "node:test";

const batchModule = await import("./story-bulk.service.ts").catch(() => ({}));

async function runBatch(ids, stories, mutations) {
  assert.equal(
    typeof batchModule.runPreauthorizedStoryBatch,
    "function",
    "runPreauthorizedStoryBatch must exist",
  );
  await batchModule.runPreauthorizedStoryBatch(
    ids,
    async (id) => stories.get(id) ?? null,
    (story) => !story.isReporterStory,
    async (id) => { mutations.push(id); },
  );
  return mutations;
}

const ordinary = { id: "ordinary", isReporterStory: false };
const reporter = { id: "reporter", isReporterStory: true };

test("preauthorization rejects a reporter before mutating an ordinary story that follows", async () => {
  const stories = new Map([[ordinary.id, ordinary], [reporter.id, reporter]]);
  const mutations = [];
  await assert.rejects(
    runBatch([reporter.id, ordinary.id], stories, mutations),
    (error) => error?.code === "BULK_STORY_UNAUTHORIZED",
  );
  assert.deepEqual(mutations, []);
});

test("preauthorization rejects a reporter after an ordinary story without first mutating it", async () => {
  const stories = new Map([[ordinary.id, ordinary], [reporter.id, reporter]]);
  const mutations = [];
  assert.equal(typeof batchModule.runPreauthorizedStoryBatch, "function");
  await assert.rejects(
    batchModule.runPreauthorizedStoryBatch(
      [ordinary.id, reporter.id],
      async (id) => stories.get(id) ?? null,
      (story) => !story.isReporterStory,
      async (id) => { mutations.push(id); },
    ),
    (error) => error?.code === "BULK_STORY_UNAUTHORIZED",
  );
  assert.deepEqual(mutations, []);
});

test("an authorized batch loads and mutates each unique story once", async () => {
  const second = { id: "second", isReporterStory: false };
  const stories = new Map([[ordinary.id, ordinary], [second.id, second]]);
  const loaded = [];
  const mutated = [];
  assert.equal(typeof batchModule.runPreauthorizedStoryBatch, "function");
  await batchModule.runPreauthorizedStoryBatch(
    [ordinary.id, ordinary.id, second.id],
    async (id) => { loaded.push(id); return stories.get(id) ?? null; },
    (story) => !story.isReporterStory,
    async (id) => { mutated.push(id); },
  );
  assert.deepEqual(loaded, [ordinary.id, second.id]);
  assert.deepEqual(mutated, [ordinary.id, second.id]);
});
