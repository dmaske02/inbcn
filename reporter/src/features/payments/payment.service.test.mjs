import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";

import {
  PaymentServiceError,
  createPaymentService,
} from "./payment.service.ts";

const profileId = "11111111-1111-4111-8111-111111111111";
const applicationId = "22222222-2222-4222-8222-222222222222";
const internalPaymentId = "33333333-3333-4333-8333-333333333333";
const token = "44444444-4444-4444-8444-444444444444";
const orderId = "order_1234567890";
const providerPaymentId = "pay_1234567890";
const webhookSecret = "webhook-secret";
const checkoutSecret = "checkout-secret";

function dependencies(overrides = {}) {
  const calls = [];
  const repository = {
    reserveOrder: async (input) => {
      calls.push(["reserveOrder", input]);
      return { state: "claimed", paymentId: internalPaymentId, token };
    },
    completeOrder: async (input) => calls.push(["completeOrder", input]),
    failOrder: async (input) => calls.push(["failOrder", input]),
    getOwnedOrder: async (input) => {
      calls.push(["getOwnedOrder", input]);
      return {
        paymentId: internalPaymentId,
        orderId,
        amountPaise: 10_000,
        currency: "INR",
        paymentStatus: "order_created",
      };
    },
    applyCapturedPayment: async (input) => calls.push(["applyCapturedPayment", input]),
    claimWebhook: async (input) => {
      calls.push(["claimWebhook", input]);
      return { state: "claimed", token };
    },
    completePaymentWebhook: async (input) => calls.push(["completePaymentWebhook", input]),
    completeRefundWebhook: async (input) => calls.push(["completeRefundWebhook", input]),
    completeRefundFailureWebhook: async (input) => calls.push(["completeRefundFailureWebhook", input]),
    failWebhook: async (input) => calls.push(["failWebhook", input]),
  };
  const client = {
    findOrderByReceipt: async () => null,
    createOrder: async (paymentId) => ({
      id: orderId,
      amount: 10_000,
      currency: "INR",
      receipt: paymentId,
      status: "created",
      notes: { payment_id: paymentId },
    }),
    fetchPayment: async () => ({
      id: providerPaymentId,
      order_id: orderId,
      amount: 10_000,
      currency: "INR",
      status: "captured",
      captured: true,
    }),
    fetchOrder: async () => ({
      id: orderId,
      amount: 10_000,
      amount_paid: 10_000,
      currency: "INR",
      receipt: internalPaymentId,
      notes: { payment_id: internalPaymentId },
      status: "paid",
    }),
  };
  return {
    calls,
    service: createPaymentService({
      repository: { ...repository, ...overrides.repository },
      client: { ...client, ...overrides.client },
      checkoutSecret,
      webhookSecret,
      now: () => "2027-08-22T10:00:00.000Z",
    }),
  };
}

function signed(rawBody) {
  return createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
}

function capturedEvent(amount = 10_000) {
  return JSON.stringify({
    entity: "event",
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: providerPaymentId,
          entity: "payment",
          order_id: orderId,
          amount,
          currency: "INR",
          status: "captured",
          captured: true,
        },
      },
    },
    created_at: 1_787_382_000,
  });
}

function refundEvent(event = "refund.processed") {
  return JSON.stringify({
    entity: "event",
    event,
    payload: {
      refund: {
        entity: {
          id: "rfnd_1234567890",
          entity: "refund",
          payment_id: providerPaymentId,
          amount: 10_000,
          currency: "INR",
          status: event === "refund.processed" ? "processed" : "failed",
        },
      },
    },
    created_at: 1_787_382_000,
  });
}

function paidOrderEvent() {
  return JSON.stringify({
    entity: "event",
    event: "order.paid",
    payload: {
      payment: {
        entity: {
          id: providerPaymentId,
          entity: "payment",
          order_id: orderId,
          amount: 10_000,
          currency: "INR",
          status: "captured",
          captured: true,
        },
      },
      order: {
        entity: {
          id: orderId,
          entity: "order",
          amount: 10_000,
          amount_paid: 10_000,
          currency: "INR",
          status: "paid",
        },
      },
    },
    created_at: 1_787_382_000,
  });
}

test("creates one fixed-price application order from an atomic reservation", async () => {
  const { service, calls } = dependencies();

  const result = await service.createReporterOrder({
    actor: { userId: profileId, state: "applicant" },
    applicationId,
    purpose: "application",
  });

  assert.deepEqual(result, { orderId, amount: 10_000, currency: "INR" });
  assert.equal(calls[0][0], "reserveOrder");
  assert.deepEqual(calls.at(-1), ["completeOrder", {
    paymentId: internalPaymentId,
    token,
    orderId,
  }]);
});

test("returns an existing active order without creating a duplicate", async () => {
  let providerCalls = 0;
  const { service } = dependencies({
    repository: {
      reserveOrder: async () => ({ state: "existing", orderId }),
    },
    client: {
      findOrderByReceipt: async () => { providerCalls += 1; },
      createOrder: async () => { providerCalls += 1; },
    },
  });

  assert.deepEqual(
    await service.createReporterOrder({
      actor: { userId: profileId, state: "applicant" },
      applicationId,
      purpose: "application",
    }),
    { orderId, amount: 10_000, currency: "INR" },
  );
  assert.equal(providerCalls, 0);
});

test("enforces applicant/application and reporter/renewal purpose ownership", async () => {
  const { service } = dependencies();

  await assert.rejects(
    service.createReporterOrder({
      actor: { userId: profileId, state: "reporter" },
      applicationId,
      purpose: "application",
    }),
    (error) => error instanceof PaymentServiceError && error.code === "forbidden",
  );
  await assert.rejects(
    service.createReporterOrder({
      actor: { userId: profileId, state: "applicant" },
      applicationId: null,
      purpose: "renewal",
    }),
    (error) => error instanceof PaymentServiceError && error.code === "forbidden",
  );
});

test("uses Checkout HMAC only as a gate, then reconciles exact captured payment and paid order", async () => {
  const { service, calls } = dependencies();
  const signature = createHmac("sha256", checkoutSecret)
    .update(`${orderId}|${providerPaymentId}`)
    .digest("hex");

  assert.deepEqual(
    await service.verifyCheckoutPayment({
      profileId,
      orderId,
      paymentId: providerPaymentId,
      signature,
    }),
    { signatureValid: true, status: "captured" },
  );
  assert.deepEqual(calls.at(-1), ["applyCapturedPayment", {
    orderId,
    paymentId: providerPaymentId,
    amountPaise: 10_000,
    currency: "INR",
    capturedAt: "2027-08-22T10:00:00.000Z",
  }]);
});

test("an invalid Checkout signature never fetches or advances payment state", async () => {
  let fetched = false;
  const { service, calls } = dependencies({
    client: { fetchPayment: async () => { fetched = true; } },
  });

  await assert.rejects(
    service.verifyCheckoutPayment({
      profileId,
      orderId,
      paymentId: providerPaymentId,
      signature: "0".repeat(64),
    }),
    (error) => error instanceof PaymentServiceError && error.code === "invalid-payment-signature",
  );
  assert.equal(fetched, false);
  assert.equal(calls.some(([name]) => name === "applyCapturedPayment"), false);
});

test("a verified fetch with the wrong amount is rejected without state change", async () => {
  const signature = createHmac("sha256", checkoutSecret)
    .update(`${orderId}|${providerPaymentId}`)
    .digest("hex");
  const { service, calls } = dependencies({
    client: { fetchPayment: async () => ({
      id: providerPaymentId,
      order_id: orderId,
      amount: 9_999,
      currency: "INR",
      status: "captured",
      captured: true,
    }) },
  });

  await assert.rejects(
    service.verifyCheckoutPayment({ profileId, orderId, paymentId: providerPaymentId, signature }),
    (error) => error instanceof PaymentServiceError && error.code === "payment-mismatch",
  );
  assert.equal(calls.some(([name]) => name === "applyCapturedPayment"), false);
});

test("a paid API order must still match the opaque internal receipt", async () => {
  const signature = createHmac("sha256", checkoutSecret)
    .update(`${orderId}|${providerPaymentId}`)
    .digest("hex");
  const { service, calls } = dependencies({
    client: { fetchOrder: async () => ({
      id: orderId,
      amount: 10_000,
      amount_paid: 10_000,
      currency: "INR",
      receipt: applicationId,
      notes: { payment_id: applicationId },
      status: "paid",
    }) },
  });

  await assert.rejects(
    service.verifyCheckoutPayment({ profileId, orderId, paymentId: providerPaymentId, signature }),
    (error) => error instanceof PaymentServiceError && error.code === "payment-mismatch",
  );
  assert.equal(calls.some(([name]) => name === "applyCapturedPayment"), false);
});

test("verifies a raw webhook before its durable claim and captured transition", async () => {
  const rawBody = capturedEvent();
  const { service, calls } = dependencies();

  assert.deepEqual(
    await service.processRazorpayEvent(rawBody, signed(rawBody), "evt_capture_1"),
    { duplicate: false, status: "captured" },
  );
  assert.equal(calls[0][0], "claimWebhook");
  assert.equal(calls[0][1].eventType, "payment.captured");
  assert.equal(
    calls[0][1].eventId,
    createHash("sha256").update(rawBody).digest("hex"),
  );
  assert.deepEqual(calls[1], ["completePaymentWebhook", {
    eventId: calls[0][1].eventId,
    processingToken: token,
    orderId,
    paymentId: providerPaymentId,
    amountPaise: 10_000,
    currency: "INR",
  }]);
});

test("accepts an exact signed paid-order webhook as captured payment evidence", async () => {
  const rawBody = paidOrderEvent();
  const { service, calls } = dependencies();

  assert.deepEqual(
    await service.processRazorpayEvent(rawBody, signed(rawBody), "evt_paid_1"),
    { duplicate: false, status: "captured" },
  );
  assert.equal(calls[1][0], "completePaymentWebhook");
});

test("an invalid webhook signature is rejected before parsing or persistence", async () => {
  const { service, calls } = dependencies();

  await assert.rejects(
    service.processRazorpayEvent("not-json", "0".repeat(64), "evt_invalid"),
    (error) => error instanceof PaymentServiceError && error.code === "invalid-webhook-signature",
  );
  assert.deepEqual(calls, []);
});

test("processed and active webhook claims are duplicate-safe", async () => {
  const rawBody = capturedEvent();
  const processed = dependencies({ repository: { claimWebhook: async () => ({ state: "processed" }) } });
  const busy = dependencies({ repository: { claimWebhook: async () => ({ state: "busy" }) } });

  assert.deepEqual(
    await processed.service.processRazorpayEvent(rawBody, signed(rawBody), "evt_duplicate"),
    { duplicate: true, status: "processed" },
  );
  assert.deepEqual(
    await busy.service.processRazorpayEvent(rawBody, signed(rawBody), "evt_busy"),
    { duplicate: true, status: "processing" },
  );
});

test("wrong webhook money fields fail the claimed receipt without capture", async () => {
  const rawBody = capturedEvent(9_999);
  const { service, calls } = dependencies();

  await assert.rejects(
    service.processRazorpayEvent(rawBody, signed(rawBody), "evt_wrong_amount"),
    (error) => error instanceof PaymentServiceError && error.code === "payment-mismatch",
  );
  assert.equal(calls.some(([name]) => name === "completePaymentWebhook"), false);
  assert.equal(calls.some(([name]) => name === "failWebhook"), true);
});

test("signed refund confirmation verifies identifiers and exact amount before completion", async () => {
  const rawBody = refundEvent();
  const { service, calls } = dependencies();

  assert.deepEqual(
    await service.processRazorpayEvent(rawBody, signed(rawBody), "evt_refund_1"),
    { duplicate: false, status: "refunded" },
  );
  assert.deepEqual(calls[1], ["completeRefundWebhook", {
    eventId: calls[0][1].eventId,
    processingToken: token,
    refundId: "rfnd_1234567890",
    paymentId: providerPaymentId,
    amountPaise: 10_000,
    currency: "INR",
  }]);
});

test("refund confirmation with a wrong amount is rejected after claim", async () => {
  const rawBody = refundEvent().replace('"amount":10000', '"amount":9999');
  const { service, calls } = dependencies();

  await assert.rejects(
    service.processRazorpayEvent(rawBody, signed(rawBody), "evt_refund_wrong_amount"),
    (error) => error instanceof PaymentServiceError && error.code === "payment-mismatch",
  );
  assert.equal(calls.some(([name]) => name === "completeRefundWebhook"), false);
  assert.equal(calls.some(([name]) => name === "failWebhook"), true);
});

test("a signed asynchronous refund failure becomes retryable", async () => {
  const rawBody = refundEvent("refund.failed");
  const { service, calls } = dependencies();

  assert.deepEqual(
    await service.processRazorpayEvent(rawBody, signed(rawBody), "evt_refund_failed"),
    { duplicate: false, status: "refund_failed" },
  );
  assert.equal(calls[1][0], "completeRefundFailureWebhook");
});
