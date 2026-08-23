import assert from "node:assert/strict";
import test from "node:test";

import { createAwsS3Presigner } from "@inbcn/domain/server/aws-s3-presigner";

import {
  createLifecycleService,
  createRecordingObjectStore,
} from "./lifecycle.service.ts";

const paymentId = "11111111-1111-4111-8111-111111111111";
const recordingId = "22222222-2222-4222-8222-222222222222";
const refundToken = "33333333-3333-4333-8333-333333333333";
const recordingToken = "44444444-4444-4444-8444-444444444444";
const objectKey = `reporter-live/${paymentId}/${recordingId}.mp4`;
const now = new Date("2026-08-23T02:15:00.000Z");

function refundWork(token = refundToken) {
  return {
    kind: "refund",
    id: paymentId,
    leaseToken: token,
    attempt: 4,
    providerPaymentId: "pay_exact_1",
    amountPaise: 10_000,
    currency: "INR",
  };
}

function recordingWork(token = recordingToken) {
  return {
    kind: "recording_delete",
    id: recordingId,
    leaseToken: token,
    attempt: 2,
    objectKey,
  };
}

function repository(pages) {
  const calls = {
    completeRefund: [],
    failRefund: [],
    completeRecording: [],
    failRecording: [],
    limits: [],
  };
  return {
    calls,
    api: {
      async claimPage(limit) {
        calls.limits.push(limit);
        return pages.shift() ?? [];
      },
      async completeRefund(input) {
        calls.completeRefund.push(input);
        return true;
      },
      async failRefund(input) {
        calls.failRefund.push(input);
        return true;
      },
      async completeRecordingDeletion(input) {
        calls.completeRecording.push(input);
        return true;
      },
      async failRecordingDeletion(input) {
        calls.failRecording.push(input);
        return true;
      },
    },
  };
}

const exactRefund = {
  id: "rfnd_exact_1",
  payment_id: "pay_exact_1",
  amount: 10_000,
  currency: "INR",
  receipt: `${paymentId}:4`,
  status: "pending",
};

test("one bounded run completes database work, an exact refund, and object-not-found deletion once", async () => {
  const db = repository([[
    { kind: "application_reminder" },
    { kind: "membership_grace" },
    { kind: "coordinate_delete" },
    refundWork(),
    recordingWork(),
  ], []]);
  const providerCalls = [];
  const service = createLifecycleService({
    repository: db.api,
    refundProvider: {
      async findRefundByReceipt(payment, receipt) {
        providerCalls.push(["find", payment, receipt]);
        return exactRefund;
      },
      async createFullRefund() {
        assert.fail("an exact existing receipt must be reused");
      },
    },
    objectStore: {
      async deleteObject(...args) {
        assert.equal(args.length, 1, "each delete must sign at call time");
        const [key] = args;
        providerCalls.push(["delete", key]);
        return "not_found";
      },
    },
  });

  const first = await service.run(now);
  const second = await service.run(now);

  assert.deepEqual(first, {
    ok: true,
    processed: 5,
    failed: 0,
    capped: false,
    counts: {
      application_reminder: 1,
      coordinate_delete: 1,
      membership_grace: 1,
      recording_delete: 1,
      refund: 1,
    },
  });
  assert.deepEqual(second, {
    ok: true,
    processed: 0,
    failed: 0,
    capped: false,
    counts: {},
  });
  assert.deepEqual(providerCalls, [
    ["find", "pay_exact_1", `${paymentId}:4`],
    ["delete", objectKey],
  ]);
  assert.equal(db.calls.completeRefund.length, 1);
  assert.deepEqual(db.calls.completeRecording[0], {
    recordingId,
    leaseToken: recordingToken,
    objectKey,
    result: "not_found",
  });
  assert.doesNotMatch(JSON.stringify(first), /pay_exact|rfnd_exact|reporter-live|11111111/u);
});

test("an ambiguous refund retry keeps the same receipt and idempotency key", async () => {
  const secondToken = "55555555-5555-4555-8555-555555555555";
  const db = repository([[refundWork()], [], [refundWork(secondToken)], []]);
  const requests = [];
  const service = createLifecycleService({
    repository: db.api,
    refundProvider: {
      async findRefundByReceipt(_payment, receipt) {
        requests.push(["find", receipt]);
        return null;
      },
      async createFullRefund(input) {
        requests.push(["create", input.receipt, input.idempotencyKey]);
        throw new Error("ambiguous network failure with private provider detail");
      },
    },
    objectStore: null,
  });

  const first = await service.run(now);
  const second = await service.run(now);

  assert.equal(first.ok, false);
  assert.equal(second.ok, false);
  assert.deepEqual(requests, [
    ["find", `${paymentId}:4`],
    ["create", `${paymentId}:4`, `${paymentId}_4`],
    ["find", `${paymentId}:4`],
    ["create", `${paymentId}:4`, `${paymentId}_4`],
  ]);
  assert.deepEqual(db.calls.failRefund.map((call) => call.failureCode), [
    "provider-request-failed",
    "provider-request-failed",
  ]);
  assert.equal(db.calls.completeRefund.length, 0);
});

test("an exact failed refund is bound for the signed webhook to finalize", async () => {
  const db = repository([[refundWork()], []]);
  const service = createLifecycleService({
    repository: db.api,
    refundProvider: {
      async findRefundByReceipt() {
        return { ...exactRefund, status: "failed" };
      },
      async createFullRefund() {
        assert.fail("failed receipt already exists");
      },
    },
    objectStore: null,
  });

  assert.equal((await service.run(now)).ok, true);
  assert.deepEqual(db.calls.completeRefund, [{
    paymentId,
    leaseToken: refundToken,
    refundId: exactRefund.id,
    providerPaymentId: exactRefund.payment_id,
    amountPaise: exactRefund.amount,
    currency: exactRefund.currency,
  }]);
  assert.equal(db.calls.failRefund.length, 0);
});

test("persistence failure after a provider success is not rewritten as a provider failure", async () => {
  const db = repository([[refundWork()]]);
  db.api.completeRefund = async () => {
    throw new Error("database completion unavailable");
  };
  const service = createLifecycleService({
    repository: db.api,
    refundProvider: {
      async findRefundByReceipt() {
        return exactRefund;
      },
      async createFullRefund() {
        assert.fail("existing exact refund must be reused");
      },
    },
    objectStore: null,
  });

  await assert.rejects(service.run(now), /database completion unavailable/u);
  assert.equal(db.calls.failRefund.length, 0);
});

test("object failure retains the exact leased key for retry", async () => {
  const db = repository([[recordingWork()], []]);
  const service = createLifecycleService({
    repository: db.api,
    refundProvider: null,
    objectStore: {
      async deleteObject() {
        throw new Error("private endpoint detail");
      },
    },
  });

  const result = await service.run(now);
  assert.equal(result.ok, false);
  assert.deepEqual(db.calls.failRecording, [{
    recordingId,
    leaseToken: recordingToken,
    objectKey,
    failureCode: "provider-request-failed",
  }]);
  assert.equal(db.calls.completeRecording.length, 0);
});

test("persistence failure after object deletion is not rewritten as object failure", async () => {
  const db = repository([[recordingWork()]]);
  db.api.completeRecordingDeletion = async () => {
    throw new Error("database completion unavailable");
  };
  const service = createLifecycleService({
    repository: db.api,
    refundProvider: null,
    objectStore: { async deleteObject() { return "deleted"; } },
  });

  await assert.rejects(service.run(now), /database completion unavailable/u);
  assert.equal(db.calls.failRecording.length, 0);
});

test("unconfigured providers fail leased work retryably instead of reporting success", async () => {
  const db = repository([[refundWork(), recordingWork()], []]);
  const service = createLifecycleService({
    repository: db.api,
    refundProvider: null,
    objectStore: null,
  });

  const result = await service.run(now);
  assert.deepEqual({ ok: result.ok, processed: result.processed, failed: result.failed }, {
    ok: false,
    processed: 0,
    failed: 2,
  });
  assert.equal(db.calls.failRefund[0].failureCode, "provider-not-configured");
  assert.equal(db.calls.failRecording[0].failureCode, "provider-not-configured");
});

test("provider jobs start before an earlier call finishes so page leases stay fresh", async () => {
  const db = repository([[refundWork(), recordingWork()], []]);
  let releaseRefund;
  const refundGate = new Promise((resolve) => { releaseRefund = resolve; });
  let markObjectStarted;
  const objectStarted = new Promise((resolve) => { markObjectStarted = resolve; });
  const service = createLifecycleService({
    repository: db.api,
    refundProvider: {
      async findRefundByReceipt() {
        await refundGate;
        return exactRefund;
      },
      async createFullRefund() {
        assert.fail("existing exact refund must be reused");
      },
    },
    objectStore: {
      async deleteObject() {
        markObjectStarted();
        return "deleted";
      },
    },
  });

  const run = service.run(now);
  const startedWhileRefundBlocked = await Promise.race([
    objectStarted.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 25)),
  ]);
  releaseRefund();
  await run;

  assert.equal(startedWhileRefundBlocked, true);
});

test("the runner uses fixed pages and stops at its finite page ceiling", async () => {
  const pages = Array.from({ length: 10 }, () =>
    Array.from({ length: 25 }, () => ({ kind: "membership_reminder" })));
  const db = repository(pages);
  const result = await createLifecycleService({
    repository: db.api,
    refundProvider: null,
    objectStore: null,
  }).run(now);

  assert.equal(result.processed, 250);
  assert.equal(result.capped, true);
  assert.deepEqual(db.calls.limits, Array(10).fill(25));
});

test("SigV4 signs DELETE distinctly from GET using the fixed AWS vector", () => {
  const url = createAwsS3Presigner({
    accessKey: "AKIAIOSFODNN7EXAMPLE",
    secret: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    bucket: "examplebucket",
    region: "us-east-1",
    forcePathStyle: false,
  }).signDelete("test.txt", 86400, new Date("2013-05-24T00:00:00.000Z"));
  assert.equal(
    new URL(url).searchParams.get("X-Amz-Signature"),
    "fb580faa6736a3af12ad5f9c3f1eea783af940a06f6a3de9dadb5679ca25cbfe",
  );
});

test("recording object deletion uses one signed DELETE, no redirects, and treats 404 as success", async () => {
  const calls = [];
  const store = createRecordingObjectStore({
    accessKey: "access",
    secret: "secret",
    bucket: "private-recordings",
    region: "ap-south-1",
    endpoint: "https://objects.example.test",
    forcePathStyle: true,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(null, { status: 404 });
    },
  });

  assert.equal(await store.deleteObject(objectKey, now), "not_found");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, "DELETE");
  assert.equal(calls[0].init.redirect, "manual");
  assert.equal(calls[0].init.cache, "no-store");
  assert.equal(new URL(calls[0].url).origin, "https://objects.example.test");
  assert.equal(new URL(calls[0].url).pathname, `/private-recordings/${objectKey}`);
});
