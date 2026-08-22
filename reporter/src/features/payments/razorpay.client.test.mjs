import assert from "node:assert/strict";
import test from "node:test";

import {
  RazorpayClientError,
  createRazorpayClient,
} from "./razorpay.client.ts";

const paymentId = "11111111-1111-4111-8111-111111111111";
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
    (error) => error instanceof RazorpayClientError && error.code === "provider-response-invalid",
  );
});

test("provider errors are generic and distinguish only definite rejections", async () => {
  const client = createRazorpayClient({
    keyId: "key",
    keySecret: "secret",
    fetchImpl: async () => Response.json(
      { error: { description: "secret provider detail" } },
      { status: 400 },
    ),
  });

  await assert.rejects(
    client.createOrder(paymentId),
    (error) => error instanceof RazorpayClientError
      && error.definite === true
      && !error.message.includes("secret provider detail"),
  );
});
