import assert from "node:assert/strict";
import test from "node:test";

import {
  ReporterRefundError,
  ReporterRefundProviderError,
  createRazorpayRefundProvider,
  createReporterRefundService,
} from "./reporter-refund.service.ts";

const actor = { id: "11111111-1111-4111-8111-111111111111", role: "admin" };
const paymentId = "22222222-2222-4222-8222-222222222222";
const providerPaymentId = "pay_1234567890";
const refundId = "rfnd_1234567890";
const token = "33333333-3333-4333-8333-333333333333";

function dependencies(overrides = {}) {
  const calls = [];
  const repository = {
    reserveRefund: async (input) => {
      calls.push(["reserveRefund", input]);
      return {
        state: "claimed",
        token,
        attempt: 1,
        providerPaymentId,
        amountPaise: 10_000,
        currency: "INR",
      };
    },
    recordRefundRequest: async (input) => calls.push(["recordRefundRequest", input]),
    failRefundRequest: async (input) => calls.push(["failRefundRequest", input]),
  };
  const provider = {
    findRefundByReceipt: async () => null,
    createFullRefund: async (input) => {
      calls.push(["createFullRefund", input]);
      return {
        id: refundId,
        payment_id: providerPaymentId,
        amount: 10_000,
        currency: "INR",
        receipt: `${paymentId}:1`,
        status: "processed",
      };
    },
  };
  return {
    calls,
    service: createReporterRefundService({
      repository: { ...repository, ...overrides.repository },
      provider: { ...provider, ...overrides.provider },
    }),
  };
}

test("only a CMS admin can request a full refund", async () => {
  let reserved = false;
  const { service } = dependencies({
    repository: { reserveRefund: async () => { reserved = true; } },
  });

  await assert.rejects(
    service.requestFullRefund({ ...actor, role: "editor" }, paymentId),
    (error) => error instanceof ReporterRefundError && error.code === "forbidden",
  );
  assert.equal(reserved, false);
});

test("requests exactly the full INR payment and remains pending after a synchronous processed response", async () => {
  const { service, calls } = dependencies();

  assert.deepEqual(await service.requestFullRefund(actor, paymentId), {
    status: "refund_pending",
  });
  assert.deepEqual(calls[1], ["createFullRefund", {
    paymentId: providerPaymentId,
    amountPaise: 10_000,
    currency: "INR",
    receipt: `${paymentId}:1`,
    notes: { payment_id: paymentId },
  }]);
  assert.deepEqual(calls[2], ["recordRefundRequest", {
    paymentId,
    processingToken: token,
    refundId,
    providerPaymentId,
    amountPaise: 10_000,
    currency: "INR",
  }]);
});

test("does not issue a second refund while an accepted request awaits webhook confirmation", async () => {
  let providerCalled = false;
  const { service } = dependencies({
    repository: { reserveRefund: async () => ({ state: "pending" }) },
    provider: { createFullRefund: async () => { providerCalled = true; } },
  });

  assert.deepEqual(await service.requestFullRefund(actor, paymentId), {
    status: "refund_pending",
  });
  assert.equal(providerCalled, false);
});

test("retry recovers a previously accepted refund by idempotent receipt", async () => {
  let created = false;
  const recovered = {
    id: refundId,
    payment_id: providerPaymentId,
    amount: 10_000,
    currency: "INR",
    receipt: `${paymentId}:2`,
    status: "pending",
  };
  const { service, calls } = dependencies({
    repository: { reserveRefund: async () => ({
      state: "claimed",
      token,
      attempt: 2,
      providerPaymentId,
      amountPaise: 10_000,
      currency: "INR",
    }) },
    provider: {
      findRefundByReceipt: async () => recovered,
      createFullRefund: async () => { created = true; },
    },
  });

  assert.deepEqual(await service.requestFullRefund(actor, paymentId), {
    status: "refund_pending",
  });
  assert.equal(created, false);
  assert.equal(calls.at(-1)[0], "recordRefundRequest");
});

test("only a definite provider rejection marks the request retryable", async () => {
  const definite = dependencies({
    provider: { createFullRefund: async () => {
      throw new ReporterRefundProviderError(true);
    } },
  });
  const ambiguous = dependencies({
    provider: { createFullRefund: async () => {
      throw new ReporterRefundProviderError(false);
    } },
  });

  await assert.rejects(definite.service.requestFullRefund(actor, paymentId));
  assert.equal(definite.calls.some(([name]) => name === "failRefundRequest"), true);
  await assert.rejects(ambiguous.service.requestFullRefund(actor, paymentId));
  assert.equal(ambiguous.calls.some(([name]) => name === "failRefundRequest"), false);
});

test("Razorpay refund client keeps Basic Auth server-side and sends only exact full-refund fields", async () => {
  let request;
  const provider = createRazorpayRefundProvider({
    keyId: "rzp_test_key",
    keySecret: "provider-secret",
    fetchImpl: async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify({
        id: refundId,
        entity: "refund",
        payment_id: providerPaymentId,
        amount: 10_000,
        currency: "INR",
        receipt: `${paymentId}:1`,
        status: "pending",
      }));
    },
  });

  await provider.createFullRefund({
    paymentId: providerPaymentId,
    amountPaise: 10_000,
    currency: "INR",
    receipt: `${paymentId}:1`,
    notes: { payment_id: paymentId },
  });

  assert.equal(request.url, `https://api.razorpay.com/v1/payments/${providerPaymentId}/refund`);
  assert.equal(request.init.headers.authorization,
    `Basic ${Buffer.from("rzp_test_key:provider-secret").toString("base64")}`);
  assert.deepEqual(JSON.parse(request.init.body), {
    amount: 10_000,
    receipt: `${paymentId}:1`,
    notes: { payment_id: paymentId },
  });
});

test("Razorpay refund client does not expose provider response bodies in errors", async () => {
  const provider = createRazorpayRefundProvider({
    keyId: "rzp_test_key",
    keySecret: "provider-secret",
    fetchImpl: async () => new Response("sensitive-provider-detail", { status: 400 }),
  });

  await assert.rejects(
    provider.createFullRefund({
      paymentId: providerPaymentId,
      amountPaise: 10_000,
      currency: "INR",
      receipt: `${paymentId}:1`,
      notes: { payment_id: paymentId },
    }),
    (error) => error instanceof ReporterRefundProviderError
      && error.definite === true
      && !error.message.includes("sensitive-provider-detail"),
  );
});
