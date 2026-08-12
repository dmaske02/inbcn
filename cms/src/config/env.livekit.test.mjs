import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const moduleUrl = new URL("./env.ts", import.meta.url).href;

function loadEnvironment(overrides = {}) {
  const environment = { ...process.env, NODE_ENV: "test", ...overrides };
  delete environment.LIVEKIT_URL;
  delete environment.LIVEKIT_API_KEY;
  delete environment.LIVEKIT_API_SECRET;
  Object.assign(environment, overrides);

  return spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      "--input-type=module",
      "--eval",
      `const { env } = await import(${JSON.stringify(moduleUrl)}); process.stdout.write(JSON.stringify(env.server.liveKit));`,
    ],
    { encoding: "utf8", env: environment },
  );
}

test("LiveKit environment configuration may be absent until broadcasting is configured", () => {
  const result = loadEnvironment();

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {});
});

test("LiveKit environment configuration accepts a complete credential set", () => {
  const result = loadEnvironment({
    LIVEKIT_URL: "wss://inbcn.livekit.cloud",
    LIVEKIT_API_KEY: "api-key",
    LIVEKIT_API_SECRET: "api-secret",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    url: "wss://inbcn.livekit.cloud",
    apiKey: "api-key",
    apiSecret: "api-secret",
  });
});

test("LiveKit environment configuration rejects partial credentials", () => {
  const result = loadEnvironment({ LIVEKIT_URL: "https://inbcn.livekit.cloud" });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /LIVEKIT_API_KEY/u);
  assert.match(result.stderr, /LIVEKIT_API_SECRET/u);
});

test("LiveKit environment configuration rejects unsupported URL protocols", () => {
  const result = loadEnvironment({
    LIVEKIT_URL: "ftp://inbcn.example.com",
    LIVEKIT_API_KEY: "api-key",
    LIVEKIT_API_SECRET: "api-secret",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /LIVEKIT_URL/u);
});
