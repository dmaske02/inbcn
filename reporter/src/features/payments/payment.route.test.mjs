import assert from "node:assert/strict";
import test from "node:test";

import { createOrderHandler } from "../../app/api/payments/order/route.ts";
import { createVerifyHandler } from "../../app/api/payments/verify/route.ts";
import {
  MAX_RAZORPAY_WEBHOOK_SIZE,
  createRazorpayWebhookHandler,
} from "../../app/api/webhooks/razorpay/route.ts";

const applicationId = "22222222-2222-4222-8222-222222222222";

test("order route authenticates and validates the actor-specific purpose", async () => {
  let created = 0;
  const unauthorized = createOrderHandler({
    authorize: async () => ({ ok: false, reason: "unauthenticated" }),
    createOrder: async () => { created += 1; },
  });
  const reporterApplication = createOrderHandler({
    authorize: async () => ({ ok: true, state: "reporter", userId: "u1" }),
    createOrder: async () => { created += 1; },
  });

  assert.equal((await unauthorized(new Request("https://example.test/api/payments/order", {
    method: "POST",
    body: JSON.stringify({ applicationId, purpose: "application" }),
  }))).status, 401);
  assert.equal((await reporterApplication(new Request("https://example.test/api/payments/order", {
    method: "POST",
    body: JSON.stringify({ applicationId, purpose: "application" }),
  }))).status, 403);
  assert.equal(created, 0);
});

test("order route rejects malformed UUID and purpose before the service", async () => {
  let created = false;
  const handler = createOrderHandler({
    authorize: async () => ({ ok: true, state: "applicant", userId: "u1" }),
    createOrder: async () => { created = true; },
  });
  const response = await handler(new Request("https://example.test/api/payments/order", {
    method: "POST",
    body: JSON.stringify({ applicationId: "not-a-uuid", purpose: "subscription" }),
  }));

  assert.equal(response.status, 400);
  assert.equal(created, false);
});

test("verify route authenticates independently before payment work", async () => {
  let verified = false;
  const handler = createVerifyHandler({
    authorize: async () => ({ ok: false, reason: "unauthenticated" }),
    verify: async () => { verified = true; },
  });
  const response = await handler(new Request("https://example.test/api/payments/verify", {
    method: "POST",
    body: JSON.stringify({
      orderId: "order_1234567890",
      paymentId: "pay_1234567890",
      signature: "a".repeat(64),
    }),
  }));

  assert.equal(response.status, 401);
  assert.equal(verified, false);
});

test("webhook rejects declared oversized bodies before reading the stream", async () => {
  let bodyAccesses = 0;
  let processed = false;
  const handler = createRazorpayWebhookHandler({
    process: async () => { processed = true; },
  });
  const response = await handler({
    headers: new Headers({
      "content-length": String(MAX_RAZORPAY_WEBHOOK_SIZE + 1),
      "x-razorpay-event-id": "evt_1",
      "x-razorpay-signature": "a".repeat(64),
    }),
    get body() {
      bodyAccesses += 1;
      throw new Error("body must not be accessed");
    },
  });

  assert.equal(response.status, 413);
  assert.equal(bodyAccesses, 0);
  assert.equal(processed, false);
});

test("webhook maps a fresh processing lease to a retryable response", async () => {
  const handler = createRazorpayWebhookHandler({
    process: async () => ({ duplicate: true, status: "processing" }),
  });
  const response = await handler(new Request("https://example.test/api/webhooks/razorpay", {
    method: "POST",
    headers: {
      "x-razorpay-event-id": "evt_1",
      "x-razorpay-signature": "a".repeat(64),
    },
    body: "{}",
  }));

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.deepEqual(await response.json(), { code: "razorpay-webhook-busy" });
});
