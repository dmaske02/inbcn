import assert from "node:assert/strict";
import test from "node:test";

import {
  ReporterSubmissionError,
  createReporterSubmissionService,
} from "./submission.service.ts";

const actorId = "11111111-1111-4111-8111-111111111111";
const storyId = "22222222-2222-4222-8222-222222222222";
const input = {
  title: "Water main repaired",
  summary: "Supply has resumed.",
  body: "Crews completed repairs before noon.",
  languageCode: "en",
  languageId: "33333333-3333-4333-8333-333333333333",
  categoryId: "44444444-4444-4444-8444-444444444444",
  eventOccurredAt: "2026-08-23T11:00:00.000Z",
  mediaIds: [],
  featuredMediaId: null,
};
const evidence = {
  locality: "Dadar West",
  location: {
    latitude: 19.0213,
    longitude: 72.8424,
    accuracy: 18,
    capturedAt: "2026-08-23T11:55:00.000Z",
  },
};

function fixture(access = { status: "active", canPublishDirectly: false }, repositoryOverrides = {}) {
  const calls = [];
  const repository = {
    getAccess: async (profileId) => {
      calls.push(["access", profileId]);
      return access;
    },
    saveDraft: async (profileId, draftId, values) => {
      calls.push(["save", profileId, draftId, values]);
      return { id: draftId ?? storyId, status: "draft", updatedAt: "2026-08-23T12:00:00.000Z" };
    },
    submit: async (profileId, id, submissionEvidence) => {
      calls.push(["submit", profileId, id, submissionEvidence]);
      return { id, status: "pending_review", revisionOutcome: "pending_review" };
    },
    directPublish: async (profileId, id, submissionEvidence) => {
      calls.push(["direct", profileId, id, submissionEvidence]);
      return { id, status: "published", revisionOutcome: "direct_published" };
    },
    withdraw: async (profileId, id) => {
      calls.push(["withdraw", profileId, id]);
      return { id, status: "rejected", revisionOutcome: "withdrawn" };
    },
    getEditor: async () => null,
    listStories: async () => [],
    ...repositoryOverrides,
  };
  return { calls, service: createReporterSubmissionService({ repository }) };
}

test("saves through the atomic repository boundary without accepting a client owner", async () => {
  const { calls, service } = fixture();
  assert.deepEqual(await service.saveDraft(actorId, null, input), {
    id: storyId,
    status: "draft",
    updatedAt: "2026-08-23T12:00:00.000Z",
  });
  assert.deepEqual(calls.map(([name]) => name), ["access", "save"]);
  assert.equal(calls[1][1], actorId);
  assert.equal("ownerId" in calls[1][3], false);
});

test("allows ordinary reviewed submission during grace but denies direct publication", async () => {
  const { calls, service } = fixture({ status: "grace_period", canPublishDirectly: true });
  assert.equal((await service.submit(actorId, storyId, evidence)).status, "pending_review");
  await assert.rejects(
    service.directPublish(actorId, storyId, evidence),
    (error) => error instanceof ReporterSubmissionError && error.code === "direct-publish-forbidden",
  );
  assert.equal(calls.some(([name]) => name === "direct"), false);
});

test("requires active membership and the effective direct-publish grant", async () => {
  for (const access of [
    { status: "active", canPublishDirectly: false },
    { status: "expired", canPublishDirectly: true },
    { status: "suspended", canPublishDirectly: true },
  ]) {
    const { service } = fixture(access);
    await assert.rejects(
      service.directPublish(actorId, storyId, evidence),
      (error) => error instanceof ReporterSubmissionError && error.code === "direct-publish-forbidden",
    );
  }
  const { calls, service } = fixture({ status: "active", canPublishDirectly: true });
  assert.equal((await service.directPublish(actorId, storyId, evidence)).status, "published");
  assert.equal(calls.some(([name]) => name === "direct"), true);
});

test("denies every mutation after membership expiry or suspension", async () => {
  for (const status of ["expired", "suspended"]) {
    const { service } = fixture({ status, canPublishDirectly: false });
    for (const operation of [
      () => service.saveDraft(actorId, storyId, input),
      () => service.submit(actorId, storyId, evidence),
      () => service.withdraw(actorId, storyId),
    ]) {
      await assert.rejects(operation, (error) => error instanceof ReporterSubmissionError && error.code === "membership-inactive");
    }
  }
});

test("preserves database ownership, classification, and immutable-state failures as safe codes", async () => {
  for (const [repositoryCode, expected] of [
    ["REPORTER_STORY_FORBIDDEN", "forbidden"],
    ["REPORTER_STORY_CLASSIFICATION_INVALID", "classification-invalid"],
    ["REPORTER_STORY_MEDIA_INVALID", "media-invalid"],
    ["REPORTER_STORY_INVALID_STATE", "story-not-editable"],
    ["REPORTER_STORY_EDITORIAL_CONTROL", "story-not-editable"],
  ]) {
    const { service } = fixture(undefined, {
      saveDraft: async () => { throw new Error(repositoryCode); },
    });
    await assert.rejects(
      service.saveDraft(actorId, storyId, input),
      (error) => error instanceof ReporterSubmissionError
        && error.code === expected
        && !error.message.includes(repositoryCode),
    );
  }
});

test("withdrawal is delegated atomically and keeps exact withdrawn semantics", async () => {
  const { calls, service } = fixture();
  assert.deepEqual(await service.withdraw(actorId, storyId), {
    id: storyId,
    status: "rejected",
    revisionOutcome: "withdrawn",
  });
  assert.deepEqual(calls.map(([name]) => name), ["access", "withdraw"]);
});
