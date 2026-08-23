import assert from "node:assert/strict";
import test from "node:test";

import { createLiveReviewService, LiveReviewError } from "./live-review.service.ts";

const id = "11111111-1111-4111-8111-111111111111";
const admin = { id, email: null, displayName: "Admin", role: "admin", preferredLanguage: null };
const editor = { ...admin, role: "editor" };

function repository() {
  const calls = [];
  const request = {
    id, profileId: id, title: "Flood update", purpose: "Road closures", intendedLocality: "Dadar",
    expectedStartsAt: "2026-08-22T10:00:00.000Z", expectedDurationMinutes: 30, supportingNotes: null,
    status: "pending", decisionReason: null, approvedStartsAt: null, approvedEndsAt: null, terminationReason: null,
    createdAt: "2026-08-22T09:00:00.000Z",
  };
  return {
    calls,
    list: async () => [], get: async () => request,
    approve: async (...args) => { calls.push(["approve", ...args]); },
    reject: async (...args) => { calls.push(["reject", ...args]); },
  };
}

test("editors can read but cannot approve live requests", async () => {
  const repo = repository();
  const service = createLiveReviewService(repo);
  assert.deepEqual(await service.list(editor), []);
  await assert.rejects(
    () => service.approve(editor, id, { startsAt: "2026-08-22T10:00:00Z", endsAt: "2026-08-22T10:30:00Z" }),
    (error) => error instanceof LiveReviewError && error.code === "FORBIDDEN",
  );
});

test("admin approval derives the maximum window from the authoritative request", async () => {
  const repo = repository();
  const service = createLiveReviewService(repo);
  await service.approve(admin, id, { startsAt: "2026-08-22T10:00:00Z", endsAt: "2026-08-22T10:30:00Z" });
  assert.deepEqual(repo.calls, [["approve", id, "2026-08-22T10:00:00.000Z", "2026-08-22T10:30:00.000Z"]]);
  await assert.rejects(
    () => service.approve(admin, id, { startsAt: "2026-08-22T10:00:00Z", endsAt: "2026-08-22T10:31:00Z" }),
    (error) => error instanceof LiveReviewError && error.code === "INVALID",
  );
});

test("malformed read IDs fail closed as missing rows", async () => {
  const service = createLiveReviewService(repository());
  assert.equal(await service.get(admin, "not-a-uuid"), null);
});

test("malformed mutation IDs remain safe validation errors", async () => {
  const service = createLiveReviewService(repository());
  await assert.rejects(
    () => service.reject(admin, "not-a-uuid", "No safety plan"),
    (error) => error instanceof LiveReviewError && error.code === "INVALID" && error.message === "The live request is invalid.",
  );
});
