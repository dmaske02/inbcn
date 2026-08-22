import assert from "node:assert/strict";
import test from "node:test";

import { KycServiceError } from "./application.service.ts";
import { createKycCallbackHandler } from "../../app/api/kyc/callback/route.ts";
import { createKycStartHandler } from "../../app/api/kyc/start/route.ts";

const MAX_BODY_SIZE = 1024 * 1024;

test("the authenticated KYC start route returns the disabled 503 gate", async () => {
  const handler = createKycStartHandler({
    authorize: async () => ({ ok: true, state: "applicant", userId: "22222222-2222-4222-8222-222222222222" }),
    start: async () => { throw new KycServiceError("kyc-not-configured", 503, "Hosted identity verification is not configured."); },
  });
  const response = await handler(new Request("https://reporter.inbcn.com/api/kyc/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ applicationId: "11111111-1111-4111-8111-111111111111" }),
  }));

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: "kyc-not-configured" });
});

test("the KYC start route denies unauthenticated callers before starting", async () => {
  let started = false;
  const handler = createKycStartHandler({
    authorize: async () => ({ ok: false, reason: "unauthenticated" }),
    start: async () => { started = true; return { url: "https://should-not-run.example" }; },
  });
  const response = await handler(new Request("https://reporter.inbcn.com/api/kyc/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ applicationId: "11111111-1111-4111-8111-111111111111" }),
  }));

  assert.equal(response.status, 401);
  assert.equal(started, false);
});

test("the signed callback route maps invalid signatures to 401", async () => {
  const handler = createKycCallbackHandler({
    process: async () => { throw new KycServiceError("invalid-kyc-signature", 401, "The webhook signature is invalid."); },
  });
  const response = await handler(new Request("https://reporter.inbcn.com/api/kyc/callback", {
    method: "POST",
    headers: { "x-kyc-signature": "bad" },
    body: "opaque-body",
  }));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { code: "invalid-kyc-signature" });
});

test("the callback returns retryable 503 for a fresh active processing lease", async () => {
  const handler = createKycCallbackHandler({
    process: async () => ({ duplicate: true, status: "processing" }),
  });
  const response = await handler(new Request("https://reporter.inbcn.com/api/kyc/callback", {
    method: "POST",
    headers: { "x-kyc-signature": "valid" },
    body: "opaque-body",
  }));

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: "kyc-webhook-busy" });
  const retryAfter = Number(response.headers.get("retry-after"));
  assert.equal(Number.isInteger(retryAfter), true);
  assert.equal(retryAfter > 0 && retryAfter <= 5 * 60, true);
});

test("the callback idempotently acknowledges an already processed event", async () => {
  const handler = createKycCallbackHandler({
    process: async () => ({ duplicate: true, status: "processed" }),
  });
  const response = await handler(new Request("https://reporter.inbcn.com/api/kyc/callback", {
    method: "POST",
    headers: { "x-kyc-signature": "valid" },
    body: "opaque-body",
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { duplicate: true, status: "processed" });
  assert.equal(response.headers.has("retry-after"), false);
});

test("the callback rejects an oversized declared body before reading its stream", async () => {
  let bodyAccesses = 0;
  const handler = createKycCallbackHandler({
    process: async () => { throw new Error("must not process"); },
  });
  const response = await handler({
    headers: new Headers({
      "content-length": String(MAX_BODY_SIZE + 1),
      "x-kyc-signature": "valid",
    }),
    get body() {
      bodyAccesses += 1;
      throw new Error("body must not be accessed");
    },
  });

  assert.equal(response.status, 413);
  assert.equal(bodyAccesses, 0);
});

test("the callback accepts exactly one MiB and rejects a chunked body one byte larger", async () => {
  let processedBytes = 0;
  const handler = createKycCallbackHandler({
    process: async ({ rawBody }) => {
      processedBytes = new TextEncoder().encode(rawBody).byteLength;
      return { status: "processed" };
    },
  });
  const boundary = await handler(new Request("https://reporter.inbcn.com/api/kyc/callback", {
    method: "POST",
    headers: { "x-kyc-signature": "valid" },
    body: "a".repeat(MAX_BODY_SIZE),
  }));
  assert.equal(boundary.status, 200);
  assert.equal(processedBytes, MAX_BODY_SIZE);

  let cancelled = false;
  const oversized = await handler(new Request("https://reporter.inbcn.com/api/kyc/callback", {
    method: "POST",
    headers: { "x-kyc-signature": "valid" },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_BODY_SIZE));
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() {
        cancelled = true;
      },
    }),
    duplex: "half",
  }));
  assert.equal(oversized.status, 413);
  assert.equal(cancelled, true);
});
