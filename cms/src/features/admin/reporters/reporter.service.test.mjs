import assert from "node:assert/strict";
import test from "node:test";

import {
  ReporterManagementError,
  createReporterService,
  signedReporterMetadata,
} from "./reporter.service.ts";

const applicationId = "11111111-1111-4111-8111-111111111111";
const profileId = "22222222-2222-4222-8222-222222222222";
const paymentId = "33333333-3333-4333-8333-333333333333";
const claimToken = "55555555-5555-4555-8555-555555555555";
const admin = {
  id: "44444444-4444-4444-8444-444444444444",
  role: "admin",
};
const editor = { ...admin, role: "editor" };

function fixture(overrides = {}) {
  const calls = [];
  const repository = {
    list: async () => [],
    get: async () => null,
    approve: async () => {
      calls.push(["approve"]);
      return { profileId };
    },
    reject: async (_applicationId, reason) => {
      calls.push(["reject", reason]);
      return { profileId, paymentId };
    },
    suspend: async (_profileId, reason) => {
      calls.push(["suspend", reason]);
      return { profileId };
    },
    reinstate: async () => {
      calls.push(["reinstate"]);
      return { profileId };
    },
    claimAccessSync: async (id) => {
      calls.push(["claim", id]);
      return {
        state: "claimed",
        profileId,
        operation: "approval",
        desiredRole: "reporter",
        generation: 1,
        claimToken,
      };
    },
    completeAccessSync: async (input) => {
      calls.push(["complete", input]);
      return { state: input.succeeded ? "succeeded" : "failed", generation: input.generation };
    },
    ...overrides.repository,
  };
  const service = createReporterService({
    repository,
    setSignedRole: overrides.setSignedRole ?? (async (id, role, generation) => {
      calls.push(["role", id, role, generation]);
    }),
    requestFullRefund: overrides.requestFullRefund ?? (async (id) => {
      calls.push(["refund", id]);
      return { status: "refund_pending" };
    }),
  });
  return { calls, service };
}

test("every reporter administration operation rejects editors before I/O", async () => {
  const { calls, service } = fixture();
  for (const operation of [
    () => service.list(editor),
    () => service.get(editor, applicationId),
    () => service.approve(editor, applicationId, true),
    () => service.reject(editor, applicationId, "Not a match"),
    () => service.suspend(editor, profileId, "Policy breach"),
    () => service.reinstate(editor, profileId),
    () => service.retryAccessSync(editor, profileId),
  ]) {
    await assert.rejects(operation, (error) =>
      error instanceof ReporterManagementError && error.code === "FORBIDDEN");
  }
  assert.deepEqual(calls, []);
});

test("approval commits the database decision before granting the signed reporter role", async () => {
  const { calls, service } = fixture();

  await service.approve(admin, applicationId, true);

  assert.deepEqual(calls, [
    ["approve"],
    ["claim", profileId],
    ["role", profileId, "reporter", 1],
    ["complete", {
      profileId,
      generation: 1,
      claimToken,
      operation: "approval",
      desiredRole: "reporter",
      succeeded: true,
      failureDetail: null,
    }],
  ]);
});

test("claim-update failure is recorded and leaves the database gate failed closed", async () => {
  const { calls, service } = fixture({
    setSignedRole: async () => {
      calls.push(["role-failed"]);
      throw new Error("sensitive provider detail");
    },
  });

  await assert.rejects(
    service.approve(admin, applicationId, true),
    (error) => error instanceof ReporterManagementError
      && error.code === "ACCESS_SYNC_FAILED"
      && !error.message.includes("sensitive"),
  );
  assert.deepEqual(calls, [
    ["approve"],
    ["claim", profileId],
    ["role-failed"],
    ["complete", {
      profileId,
      generation: 1,
      claimToken,
      operation: "approval",
      desiredRole: "reporter",
      succeeded: false,
      failureDetail: "auth-claim-update-failed",
    }],
  ]);
});

test("rejection requires a reason and starts the idempotent full refund after the decision", async () => {
  const { calls, service } = fixture();
  await assert.rejects(
    service.reject(admin, applicationId, "  "),
    (error) => error instanceof ReporterManagementError && error.code === "VALIDATION",
  );
  assert.deepEqual(calls, []);

  await service.reject(admin, applicationId, "  Identity could not be matched.  ");
  assert.deepEqual(calls, [
    ["reject", "Identity could not be matched."],
    ["refund", paymentId],
  ]);
});

test("suspension removes signed access after the atomic DB lock and never refunds", async () => {
  const { calls, service } = fixture({
    repository: {
      claimAccessSync: async (id) => {
        calls.push(["claim", id]);
        return {
          state: "claimed",
          profileId,
          operation: "suspension",
          desiredRole: "none",
          generation: 2,
          claimToken,
        };
      },
    },
  });

  await service.suspend(admin, profileId, "  Editorial policy breach. ");

  assert.deepEqual(calls, [
    ["suspend", "Editorial policy breach."],
    ["claim", profileId],
    ["role", profileId, null, 2],
    ["complete", {
      profileId,
      generation: 2,
      claimToken,
      operation: "suspension",
      desiredRole: "none",
      succeeded: true,
      failureDetail: null,
    }],
  ]);
});

test("stale approve and suspend writes reconcile through the newest reinstate generation", async () => {
  const claims = [
    {
      state: "claimed",
      profileId,
      operation: "approval",
      desiredRole: "reporter",
      generation: 1,
      claimToken: "55555555-5555-4555-8555-555555555551",
    },
    {
      state: "claimed",
      profileId,
      operation: "suspension",
      desiredRole: "none",
      generation: 2,
      claimToken: "55555555-5555-4555-8555-555555555552",
    },
    {
      state: "claimed",
      profileId,
      operation: "reinstatement",
      desiredRole: "reporter",
      generation: 3,
      claimToken: "55555555-5555-4555-8555-555555555553",
    },
  ];
  const writes = [];
  const completions = [];
  const { service } = fixture({
    repository: {
      claimAccessSync: async () => claims.shift(),
      completeAccessSync: async (input) => {
        completions.push(input);
        return input.generation < 3
          ? { state: "stale", generation: 3 }
          : { state: "succeeded", generation: 3 };
      },
    },
    setSignedRole: async (_id, role) => writes.push(role),
  });

  await service.approve(admin, applicationId, true);

  assert.deepEqual(writes, ["reporter", null, "reporter"]);
  assert.deepEqual(completions.map(({ generation }) => generation), [1, 2, 3]);
});

test("retry repairs a newer desired generation after an external write then completion crash", async () => {
  const writes = [];
  let completionCrashed = false;
  const first = fixture({
    repository: {
      claimAccessSync: async () => ({
        state: "claimed",
        profileId,
        operation: "approval",
        desiredRole: "reporter",
        generation: 7,
        claimToken,
      }),
      completeAccessSync: async () => {
        completionCrashed = true;
        throw new Error("database unavailable after external write");
      },
    },
    setSignedRole: async (_id, role) => writes.push(role),
  });

  await assert.rejects(first.service.retryAccessSync(admin, profileId));
  assert.equal(completionCrashed, true);
  assert.deepEqual(writes, ["reporter"]);

  const recovery = fixture({
    repository: {
      claimAccessSync: async () => ({
        state: "claimed",
        profileId,
        operation: "suspension",
        desiredRole: "none",
        generation: 8,
        claimToken: "55555555-5555-4555-8555-555555555558",
      }),
      completeAccessSync: async () => ({ state: "succeeded", generation: 8 }),
    },
    setSignedRole: async (_id, role) => writes.push(role),
  });

  await recovery.service.retryAccessSync(admin, profileId);
  assert.deepEqual(writes, ["reporter", null]);
});

test("a late expired-holder write reconciles the repair generation after newer success", async () => {
  const claims = [
    {
      state: "claimed",
      profileId,
      operation: "approval",
      desiredRole: "reporter",
      generation: 4,
      claimToken: "55555555-5555-4555-8555-555555555554",
    },
    {
      state: "claimed",
      profileId,
      operation: "suspension",
      desiredRole: "none",
      generation: 6,
      claimToken: "55555555-5555-4555-8555-555555555556",
    },
  ];
  const writes = [];
  const { service } = fixture({
    repository: {
      claimAccessSync: async () => claims.shift(),
      completeAccessSync: async (input) => input.generation === 4
        ? { state: "stale", generation: 6 }
        : { state: "succeeded", generation: 6 },
    },
    setSignedRole: async (_id, role) => writes.push(role),
  });

  await service.retryAccessSync(admin, profileId);

  assert.deepEqual(writes, ["reporter", null]);
});

test("a trigger-rejected stale generation reconciles the current desired generation", async () => {
  const claims = [
    {
      state: "claimed",
      profileId,
      operation: "approval",
      desiredRole: "reporter",
      generation: 4,
      claimToken: "55555555-5555-4555-8555-555555555554",
    },
    {
      state: "claimed",
      profileId,
      operation: "suspension",
      desiredRole: "none",
      generation: 5,
      claimToken: "55555555-5555-4555-8555-555555555555",
    },
  ];
  const calls = [];
  const { service } = fixture({
    repository: {
      claimAccessSync: async () => claims.shift(),
      completeAccessSync: async (input) => {
        calls.push(["complete", input.generation, input.succeeded]);
        return input.generation === 4
          ? { state: "stale", generation: 5 }
          : { state: "succeeded", generation: 5 };
      },
    },
    setSignedRole: async (_id, role, generation) => {
      calls.push(["role", role, generation]);
      if (generation === 4) throw new Error("REPORTER_ACCESS_GENERATION_STALE");
    },
  });

  await service.retryAccessSync(admin, profileId);

  assert.deepEqual(calls, [
    ["role", "reporter", 4],
    ["complete", 4, false],
    ["role", null, 5],
    ["complete", 5, true],
  ]);
});

test("an expired holder cannot overwrite a newer success and retry observes verified current state", async () => {
  let releaseExpiredWrite;
  const expiredWriteMayFinish = new Promise((resolve) => {
    releaseExpiredWrite = resolve;
  });
  const claims = [
    {
      state: "claimed",
      profileId,
      operation: "approval",
      desiredRole: "reporter",
      generation: 4,
      claimToken: "55555555-5555-4555-8555-555555555554",
    },
    {
      state: "claimed",
      profileId,
      operation: "suspension",
      desiredRole: "none",
      generation: 5,
      claimToken: "55555555-5555-4555-8555-555555555555",
    },
    { state: "succeeded", generation: 5 },
  ];
  const calls = [];
  const { service } = fixture({
    repository: {
      claimAccessSync: async () => claims.shift(),
      completeAccessSync: async (input) => {
        calls.push(["complete", input.generation, input.succeeded]);
        if (input.generation === 4) {
          throw new Error("expired process died before recording completion");
        }
        return { state: "succeeded", generation: input.generation };
      },
    },
    setSignedRole: async (_id, role, generation) => {
      calls.push(["role-start", role, generation]);
      if (generation === 4) {
        await expiredWriteMayFinish;
        calls.push(["role-rejected-stale", role, generation]);
        throw new Error("REPORTER_ACCESS_GENERATION_STALE");
      }
      calls.push(["role-succeeded", role, generation]);
    },
  });

  const expiredHolder = service.retryAccessSync(admin, profileId);
  await new Promise((resolve) => setImmediate(resolve));
  await service.retryAccessSync(admin, profileId);
  releaseExpiredWrite();
  await assert.rejects(expiredHolder, /expired process died/u);
  await service.retryAccessSync(admin, profileId);

  assert.deepEqual(calls, [
    ["role-start", "reporter", 4],
    ["role-start", null, 5],
    ["role-succeeded", null, 5],
    ["complete", 5, true],
    ["role-rejected-stale", "reporter", 4],
    ["complete", 4, false],
  ]);
});

test("an active synchronization lease is not bypassed by a competing retry", async () => {
  let wrote = false;
  const { service } = fixture({
    repository: {
      claimAccessSync: async () => ({ state: "busy", generation: 4 }),
    },
    setSignedRole: async () => { wrote = true; },
  });

  await assert.rejects(
    service.retryAccessSync(admin, profileId),
    (error) => error instanceof ReporterManagementError
      && error.code === "ACCESS_SYNC_FAILED",
  );
  assert.equal(wrote, false);
});

test("signed role updates preserve unrelated app_metadata and never use user_metadata", () => {
  const existing = { provider: "phone", providers: ["phone"], tenant: "newsroom" };
  assert.deepEqual(signedReporterMetadata(existing, "reporter", 7), {
    provider: "phone",
    providers: ["phone"],
    tenant: "newsroom",
    role: "reporter",
    reporter_access_generation: 7,
  });
  assert.deepEqual(
    signedReporterMetadata(
      { ...existing, role: "reporter", reporter_access_generation: 6 },
      null,
      7,
    ),
    { ...existing, reporter_access_generation: 7 },
  );
});
