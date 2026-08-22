import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalReporterStoryState,
  isFreshCapture,
  parseCapturedLocation,
  validateReporterStoryInput,
  validateSubmissionEvidence,
} from "./submission.model.ts";
import * as submissionModel from "./submission.model.ts";

const now = "2026-08-23T12:00:00.000Z";
const story = {
  title: "  Water main repaired  ",
  summary: "  Supply has resumed.  ",
  body: "  Crews completed repairs before noon.  ",
  languageCode: "en",
  languageId: "11111111-1111-4111-8111-111111111111",
  categoryId: "22222222-2222-4222-8222-222222222222",
  eventOccurredAt: "2026-08-23T11:00:00.000Z",
  mediaIds: ["33333333-3333-4333-8333-333333333333"],
  featuredMediaId: "33333333-3333-4333-8333-333333333333",
};

test("accepts bounded coordinates and a capture no more than thirty minutes old", () => {
  assert.equal(parseCapturedLocation({
    latitude: 19.076,
    longitude: 72.8777,
    accuracy: 15,
    capturedAt: now,
  }, now).ok, true);
  assert.equal(parseCapturedLocation({
    latitude: 95,
    longitude: 72,
    accuracy: 10,
    capturedAt: now,
  }, now).ok, false);
  assert.equal(isFreshCapture(new Date(now).getTime() - 4 * 60_000, now), true);
  assert.equal(isFreshCapture(new Date(now).getTime() - 31 * 60_000, now), false);
  assert.equal(isFreshCapture(new Date(now).getTime() + 1, now), false);
});

test("normalizes only supported reporter story fields", () => {
  const result = validateReporterStoryInput({ ...story, ignoredUrl: "https://untrusted.example/file" }, now);
  assert.deepEqual(result, {
    ok: true,
    data: {
      title: "Water main repaired",
      summary: "Supply has resumed.",
      body: "Crews completed repairs before noon.",
      languageCode: "en",
      languageId: story.languageId,
      categoryId: story.categoryId,
      eventOccurredAt: "2026-08-23T11:00:00.000Z",
      mediaIds: story.mediaIds,
      featuredMediaId: story.featuredMediaId,
    },
  });
  assert.equal("ignoredUrl" in result.data, false);
});

test("rejects unsupported language, malformed media IDs, and featured media outside the ordered set", () => {
  for (const input of [
    { ...story, languageCode: "bn" },
    { ...story, mediaIds: ["not-a-uuid"] },
    { ...story, featuredMediaId: "44444444-4444-4444-8444-444444444444" },
    { ...story, mediaIds: [...story.mediaIds, ...story.mediaIds] },
  ]) {
    const result = validateReporterStoryInput(input, now);
    assert.equal(result.ok, false);
    assert.ok(result.fieldErrors);
  }
});

test("rejects an invalid or implausibly future event time using server time", () => {
  assert.equal(validateReporterStoryInput({ ...story, eventOccurredAt: "not-a-date" }, now).ok, false);
  assert.equal(validateReporterStoryInput({ ...story, eventOccurredAt: "2026-02-30T11:00:00.000Z" }, now).ok, false);
  assert.equal(validateReporterStoryInput({ ...story, eventOccurredAt: "2026-08-23T12:05:00.001Z" }, now).ok, false);
  assert.equal(validateReporterStoryInput({ ...story, eventOccurredAt: "2026-08-23T12:05:00.000Z" }, now).ok, true);
});

test("rejects an impossible calendar date for captured evidence", () => {
  const result = parseCapturedLocation({
    latitude: 19.076,
    longitude: 72.8777,
    accuracy: 15,
    capturedAt: "2026-02-30T12:00:00.000Z",
  }, "2026-03-02T12:00:00.000Z");

  assert.equal(result.ok, false);
  assert.deepEqual(result.fieldErrors, { capturedAt: ["Capture location again before submitting."] });
});

test("creates one validated story identity that every new-draft retry reuses", () => {
  assert.equal(typeof submissionModel.createNewReporterDraftTarget, "function");
  const target = submissionModel.createNewReporterDraftTarget(
    () => "55555555-5555-4555-8555-555555555555",
  );

  assert.deepEqual(target, {
    storyId: "55555555-5555-4555-8555-555555555555",
    redirectToEditor: true,
  });
  assert.equal(target.storyId, target.storyId);
});

test("returns field-safe evidence errors for locality, accuracy, and stale capture", () => {
  const result = validateSubmissionEvidence({
    locality: " ",
    location: {
      latitude: 19.076,
      longitude: 72.8777,
      accuracy: 0,
      capturedAt: "2026-08-23T11:29:59.999Z",
    },
  }, now);
  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result.fieldErrors).sort(), ["accuracy", "capturedAt", "locality"]);
  assert.doesNotMatch(JSON.stringify(result), /19\.076|72\.8777/u);
});

test("derives exact changes-requested and withdrawn semantics from the latest revision", () => {
  assert.equal(canonicalReporterStoryState("draft", null), "draft");
  assert.equal(canonicalReporterStoryState("draft", "changes_requested"), "changes_requested");
  assert.equal(canonicalReporterStoryState("rejected", "withdrawn"), "withdrawn");
  assert.equal(canonicalReporterStoryState("rejected", "rejected"), "rejected");
  assert.equal(canonicalReporterStoryState("published", "direct_published"), "published");
});
