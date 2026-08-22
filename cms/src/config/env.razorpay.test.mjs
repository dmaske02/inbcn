import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const moduleUrl = new URL("./env.ts", import.meta.url).href;

function loadEnvironment(overrides = {}) {
  const environment = { ...process.env, NODE_ENV: "test" };
  delete environment.RAZORPAY_KEY_ID;
  delete environment.RAZORPAY_KEY_SECRET;
  Object.assign(environment, overrides);

  return spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      "--input-type=module",
      "--eval",
      `const { env } = await import(${JSON.stringify(moduleUrl)}); process.stdout.write(JSON.stringify(env.server.razorpay));`,
    ],
    { encoding: "utf8", env: environment },
  );
}

test("Razorpay credentials may be absent until refunds are configured", () => {
  const result = loadEnvironment();

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {});
});

test("Razorpay credentials are server-only and accepted as a complete pair", () => {
  const result = loadEnvironment({
    RAZORPAY_KEY_ID: "rzp_test_key",
    RAZORPAY_KEY_SECRET: "provider-secret",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    keyId: "rzp_test_key",
    keySecret: "provider-secret",
  });
});

test("partial Razorpay credentials are rejected", () => {
  const result = loadEnvironment({ RAZORPAY_KEY_ID: "rzp_test_key" });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /RAZORPAY_KEY_SECRET/u);
});
