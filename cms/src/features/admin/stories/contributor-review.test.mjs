import assert from "node:assert/strict";
import test from "node:test";
import { reporterStoryReviewSchema, getAllowedStoryCommands } from "./story.model.ts";

test("accepts contributor review without inventing reporter verification", () => {
  assert.equal(reporterStoryReviewSchema.shape.reporter.safeParse(null).success, true);
  assert.equal(reporterStoryReviewSchema.shape.reporter.safeParse({}).success, false);
  assert.ok(getAllowedStoryCommands("editor", "pending_review", false, false, true).includes("approve"));
  assert.deepEqual(getAllowedStoryCommands("writer", "pending_review", false, false, true), []);
});
