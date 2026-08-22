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
      return { profileId, operation: "approval" };
    },
    reject: async (_applicationId, reason) => {
      calls.push(["reject", reason]);
      return { profileId, paymentId };
    },
    suspend: async (_profileId, reason) => {
      calls.push(["suspend", reason]);
      return { profileId, operation: "suspension" };
    },
    reinstate: async () => {
      calls.push(["reinstate"]);
      return { profileId, operation: "reinstatement" };
    },
    retryTarget: async () => ({ profileId, operation: "approval" }),
    finishAccessSync: async (input) => {
      calls.push(["finish", input]);
    },
    ...overrides.repository,
  };
  const service = createReporterService({
    repository,
    setSignedRole: overrides.setSignedRole ?? (async (id, role) => {
      calls.push(["role", id, role]);
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
    ["role", profileId, "reporter"],
    ["finish", {
      profileId,
      operation: "approval",
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
    ["role-failed"],
    ["finish", {
      profileId,
      operation: "approval",
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
  const { calls, service } = fixture();

  await service.suspend(admin, profileId, "  Editorial policy breach. ");

  assert.deepEqual(calls, [
    ["suspend", "Editorial policy breach."],
    ["role", profileId, null],
    ["finish", {
      profileId,
      operation: "suspension",
      succeeded: true,
      failureDetail: null,
    }],
  ]);
});

test("signed role updates preserve unrelated app_metadata and never use user_metadata", () => {
  const existing = { provider: "phone", providers: ["phone"], tenant: "newsroom" };
  assert.deepEqual(signedReporterMetadata(existing, "reporter"), {
    provider: "phone",
    providers: ["phone"],
    tenant: "newsroom",
    role: "reporter",
  });
  assert.deepEqual(signedReporterMetadata({ ...existing, role: "reporter" }, null), existing);
});
