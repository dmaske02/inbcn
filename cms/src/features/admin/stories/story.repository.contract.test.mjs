import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repository = await readFile(
  new URL("../../news/server/stories.repository.ts", import.meta.url),
  "utf8",
);

test("lifecycle transitions use the atomic transition_story RPC", () => {
  assert.match(repository, /export async function transitionCmsStory/u);
  assert.match(repository, /\.rpc\("transition_story"/u);
  assert.match(repository, /p_expected_updated_at/u);
});

test("ordinary story saves use optimistic concurrency", () => {
  const update = repository.match(
    /export async function updateCmsStoryIfCurrent[\s\S]*?\n\}/u,
  )?.[0] ?? "";
  assert.match(update, /\.eq\("id", id\)/u);
  assert.match(update, /\.eq\("updated_at", expectedUpdatedAt\)/u);
  assert.match(update, /\.maybeSingle\(\)/u);
});
