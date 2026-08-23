import assert from "node:assert/strict";
import test from "node:test";

import {
  RazorpayClientError,
  createRazorpayClient,
} from "./razorpay.client.ts";

const paymentId = "11111111-1111-4111-8111-111111111111";
const providerPaymentId = "pay_1234567890";
const refundReceipt = `${paymentId}:4`;
const refund = {
  id: "rfnd_1234567890",
  entity: "refund",
  payment_id: providerPaymentId,
  amount: 10_000,
  currency: "INR",
  receipt: refundReceipt,
  status: "pending",
};
const order = {
  id: "order_1234567890",
  entity: "order",
  amount: 10_000,
  amount_paid: 0,
  amount_due: 10_000,
  currency: "INR",
  receipt: paymentId,
  status: "created",
  notes: { payment_id: paymentId },
  created_at: 1_787_382_000,
};

test("creates the fixed-price INR order using server Basic Auth and opaque notes", async () => {
  let request;
  const client = createRazorpayClient({
    keyId: "rzp_test_key",
    keySecret: "server-secret",
    fetchImpl: async (url, init) => {
      request = { url: String(url), init };
      return Response.json(order);
    },
  });

  assert.deepEqual(await client.createOrder(paymentId), order);
  assert.equal(request.url, "https://api.razorpay.com/v1/orders");
  assert.equal(
    request.init.headers.authorization,
    `Basic ${Buffer.from("rzp_test_key:server-secret").toString("base64")}`,
  );
  assert.deepEqual(JSON.parse(request.init.body), {
    amount: 10_000,
    currency: "INR",
    receipt: paymentId,
    partial_payment: false,
    notes: { payment_id: paymentId },
  });
});

test("recovers an order by its idempotent internal receipt", async () => {
  let requestedUrl;
  const client = createRazorpayClient({
    keyId: "key",
    keySecret: "secret",
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return Response.json({ entity: "collection", count: 1, items: [order] });
    },
  });

  assert.deepEqual(await client.findOrderByReceipt(paymentId), order);
  assert.equal(
    requestedUrl,
    `https://api.razorpay.com/v1/orders?receipt=${paymentId}&count=2`,
  );
});

test("rejects a provider order that changes the fixed money fields", async () => {
  const client = createRazorpayClient({
    keyId: "key",
    keySecret: "secret",
    fetchImpl: async () => Response.json({ ...order, amount: 9_999 }),
  });

  await assert.rejects(
    client.createOrder(paymentId),
    (error) => error instanceof RazorpayClientError
      && error.code === "provider-response-invalid"
      && error.definite === false,
  );
});

test("provider HTTP failures are generic and always ambiguous", async () => {
  for (const status of [400, 408, 409, 429]) {
    const client = createRazorpayClient({
      keyId: "key",
      keySecret: "secret",
      fetchImpl: async () => Response.json(
        { error: { description: "secret provider detail" } },
        { status },
      ),
    });

    await assert.rejects(
      client.createOrder(paymentId),
      (error) => error instanceof RazorpayClientError
        && error.definite === false
        && !error.message.includes("secret provider detail"),
    );
  }
});

test("order response loss remains ambiguous so the receipt can be reconciled", async () => {
  const client = createRazorpayClient({
    keyId: "key",
    keySecret: "secret",
    fetchImpl: async () => { throw new TypeError("response lost"); },
  });

  await assert.rejects(
    client.createOrder(paymentId),
    (error) => error instanceof RazorpayClientError
      && error.definite === false,
  );
});

test("invalid internal order identity fails definitely before provider I/O", async () => {
  let fetched = false;
  const client = createRazorpayClient({
    keyId: "key",
    keySecret: "secret",
    fetchImpl: async () => { fetched = true; return Response.json(order); },
  });

  await assert.rejects(
    client.createOrder("not-a-payment-uuid"),
    (error) => error instanceof RazorpayClientError
      && error.definite === true,
  );
  assert.equal(fetched, false);
});

test("finds the one exact refund by the existing attempt receipt", async () => {
  let requestedUrl;
  const client = createRazorpayClient({
    keyId: "key",
    keySecret: "secret",
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return Response.json({ entity: "collection", count: 1, items: [refund] });
    },
  });

  assert.deepEqual(
    await client.findRefundByReceipt(providerPaymentId, refundReceipt),
    refund,
  );
  assert.equal(
    requestedUrl,
    `https://api.razorpay.com/v1/payments/${providerPaymentId}/refunds?count=100`,
  );
});

test("fetches only the exact stored refund id for stale reconciliation", async () => {
  let requestedUrl;
  const client = createRazorpayClient({
    keyId: "key",
    keySecret: "secret",
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return Response.json({ ...refund, status: "processed" });
    },
  });

  assert.deepEqual(
    await client.fetchRefund(providerPaymentId, refund.id),
    { ...refund, status: "processed" },
  );
  assert.equal(
    requestedUrl,
    `https://api.razorpay.com/v1/payments/${providerPaymentId}/refunds/${refund.id}`,
  );
});

test("rejects a fetched refund whose id differs from the stored id", async () => {
  const client = createRazorpayClient({
    keyId: "key",
    keySecret: "secret",
    fetchImpl: async () => Response.json({ ...refund, id: "rfnd_different_1" }),
  });

  await assert.rejects(
    client.fetchRefund(providerPaymentId, refund.id),
    (error) => error instanceof RazorpayClientError
      && error.code === "provider-response-invalid",
  );
});

test("creates only the fixed full refund with the exact receipt and idempotency key", async () => {
  let request;
  const client = createRazorpayClient({
    keyId: "key",
    keySecret: "secret",
    fetchImpl: async (url, init) => {
      request = { url: String(url), init };
      return Response.json(refund);
    },
  });

  assert.deepEqual(await client.createFullRefund({
    paymentId: providerPaymentId,
    receipt: refundReceipt,
    idempotencyKey: `${paymentId}_4`,
    internalPaymentId: paymentId,
  }), refund);
  assert.equal(request.init.method, "POST");
  assert.ok(request.init.signal instanceof AbortSignal);
  assert.equal(request.init.headers["X-Refund-Idempotency"], `${paymentId}_4`);
  assert.deepEqual(JSON.parse(request.init.body), {
    amount: 10_000,
    receipt: refundReceipt,
    notes: { payment_id: paymentId },
  });
});

test("rejects a refund key that is not the exact receipt attempt before provider I/O", async () => {
  let fetched = false;
  const client = createRazorpayClient({
    keyId: "key",
    keySecret: "secret",
    fetchImpl: async () => { fetched = true; return Response.json(refund); },
  });

  await assert.rejects(
    client.createFullRefund({
      paymentId: providerPaymentId,
      receipt: refundReceipt,
      idempotencyKey: `${paymentId}_different_4`,
      internalPaymentId: paymentId,
    }),
    (error) => error instanceof RazorpayClientError
      && error.definite === true,
  );
  assert.equal(fetched, false);
});
