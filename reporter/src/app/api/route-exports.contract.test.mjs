import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routes = [
  "kyc/callback/route.ts",
  "kyc/start/route.ts",
  "live/[requestId]/session/route.ts",
  "payments/order/route.ts",
  "payments/verify/route.ts",
  "webhooks/livekit/route.ts",
  "webhooks/razorpay/route.ts",
];

test("App Router route modules export only supported route fields", async () => {
  for (const route of routes) {
    const source = await readFile(new URL(route, import.meta.url), "utf8");
    const exports = [...source.matchAll(/^export (?:const|function|class) (\w+)/gmu)]
      .map((match) => match[1]);
    assert.deepEqual(exports.filter((name) => !["POST", "dynamic"].includes(name)), [], route);
  }
});
