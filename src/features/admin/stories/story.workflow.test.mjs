import assert from "node:assert/strict";
import test from "node:test";

import { buildTransitionPatch, normalizeScheduledAt, parseTags } from "./story.workflow.ts";

test("parses and deduplicates comma-separated tags", () => {
  assert.deepEqual(parseTags(" India, technology, india,  "), ["india", "technology"]);
});

test("builds database-safe review and publication transitions", () => {
  const now = "2026-08-01T10:00:00.000Z";
  assert.deepEqual(buildTransitionPatch("submit", "draft", "user-1", now), {
    status: "pending_review",
    submitted_at: now,
    updated_at: now,
  });
  assert.deepEqual(buildTransitionPatch("approve", "pending_review", "editor-1", now), {
    status: "approved",
    approved_by: "editor-1",
    approved_at: now,
    updated_at: now,
  });
  assert.deepEqual(buildTransitionPatch("publish", "approved", "editor-1", now), {
    status: "published",
    published_at: now,
    scheduled_at: null,
    updated_at: now,
  });
});

test("admin direct publish supplies required approval timestamps", () => {
  const now = "2026-08-01T10:00:00.000Z";
  assert.deepEqual(buildTransitionPatch("publish", "draft", "admin-1", now), {
    status: "published",
    submitted_at: now,
    approved_by: "admin-1",
    approved_at: now,
    published_at: now,
    scheduled_at: null,
    updated_at: now,
  });
});

test("rejects a story with a durable editorial reason", () => {
  const now = "2026-08-01T10:00:00.000Z";
  assert.deepEqual(
    buildTransitionPatch("reject", "draft", "editor-1", now, undefined, "Needs source verification."),
    {
      status: "rejected",
      rejected_at: now,
      rejection_reason: "Needs source verification.",
      updated_at: now,
    },
  );
  assert.throws(
    () => buildTransitionPatch("reject", "draft", "editor-1", now, undefined, " "),
    /rejection reason/i,
  );
});

test("schedule requires a future date", () => {
  assert.throws(
    () => buildTransitionPatch("schedule", "approved", "editor-1", "2026-08-01T10:00:00.000Z"),
    /publish date/i,
  );
  assert.equal(
    buildTransitionPatch("schedule", "approved", "editor-1", "2026-08-01T10:00:00.000Z", "2026-08-02T10:00:00.000Z").status,
    "scheduled",
  );
});

test("normalizes valid schedule values and rejects malformed dates", () => {
  assert.equal(normalizeScheduledAt("2026-08-02T10:30"), "2026-08-02T10:30:00.000Z");
  assert.equal(normalizeScheduledAt("not-a-date"), null);
  assert.equal(normalizeScheduledAt(""), undefined);
});
