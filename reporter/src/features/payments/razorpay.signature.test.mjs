import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { verifyHmac } from "./razorpay.signature.ts";

test("verifies a deterministic Razorpay SHA-256 HMAC", () => {
  const message = "order_1|pay_1";
  const expected = createHmac("sha256", "secret").update(message).digest("hex");

  assert.equal(verifyHmac(message, "secret", expected), true);
});

test("rejects malformed and mismatched signatures without throwing", () => {
  assert.equal(verifyHmac("order_1|pay_1", "secret", "not-hex"), false);
  assert.equal(verifyHmac("order_1|pay_1", "secret", "0".repeat(64)), false);
});
