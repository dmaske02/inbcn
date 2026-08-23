import assert from "node:assert/strict";
import test from "node:test";

import { createLiveReviewService, LiveReviewError } from "./live-review.service.ts";

const id = "11111111-1111-4111-8111-111111111111";
const admin = { id, email: null, displayName: "Admin", role: "admin", preferredLanguage: null };
const editor = { ...admin, role: "editor" };

function repository() {
  const calls = [];
  return {
    calls,
    list: async () => [], get: async () => null,
    approve: async (...args) => { calls.push(["approve", ...args]); },
    reject: async (...args) => { calls.push(["reject", ...args]); },
    terminate: async (...args) => { calls.push(["terminate", ...args]); },
  };
}

test("editors can read but cannot approve live requests", async () => {
  const repo = repository();
  const service = createLiveReviewService(repo);
  assert.deepEqual(await service.list(editor), []);
  await assert.rejects(
    () => service.approve(editor, id, "2026-08-22T10:00:00Z", "2026-08-22T10:30:00Z", 30),
    (error) => error instanceof LiveReviewError && error.code === "FORBIDDEN",
  );
});

test("admin approval accepts the exact window and safe duplicate RPC success", async () => {
  const repo = repository();
  const service = createLiveReviewService(repo);
  await service.approve(admin, id, "2026-08-22T10:00:00Z", "2026-08-22T10:30:00Z", 30);
  await service.approve(admin, id, "2026-08-22T10:00:00Z", "2026-08-22T10:30:00Z", 30);
  assert.equal(repo.calls.filter(([operation]) => operation === "approve").length, 2);
  await assert.rejects(
    () => service.approve(admin, id, "2026-08-22T10:00:00Z", "2026-08-22T10:31:00Z", 30),
    (error) => error instanceof LiveReviewError && error.code === "INVALID",
  );
});

test("admin termination requires a bounded trimmed reason", async () => {
  const repo = repository();
  const service = createLiveReviewService(repo);
  await service.terminate(admin, id, "  Safety concern  ");
  assert.deepEqual(repo.calls, [["terminate", id, "Safety concern"]]);
  await assert.rejects(() => service.terminate(admin, id, " "), LiveReviewError);
});
