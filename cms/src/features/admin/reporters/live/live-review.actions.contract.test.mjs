import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("live review decisions stay behind the admin-only server action", async () => {
  const actions = await readFile(new URL("./live-review.actions.ts", import.meta.url), "utf8");
  assert.match(actions, /^"use server"/u);
  assert.match(actions, /requireAdminUser/u);
  assert.match(actions, /approveLiveRequest/u);
  assert.match(actions, /rejectLiveRequest/u);
  assert.match(actions, /terminateLiveRequest/u);
  assert.doesNotMatch(actions, /maximumMinutes/u);
});
