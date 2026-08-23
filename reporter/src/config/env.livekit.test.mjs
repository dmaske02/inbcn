import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const moduleUrl = new URL("./env.ts", import.meta.url).href;
const liveKitNames = [
  "LIVEKIT_URL",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
  "LIVEKIT_S3_ACCESS_KEY",
  "LIVEKIT_S3_SECRET",
  "LIVEKIT_S3_BUCKET",
  "LIVEKIT_S3_ENDPOINT",
  "LIVEKIT_S3_REGION",
  "LIVEKIT_S3_FORCE_PATH_STYLE",
];

function loadEnvironment(overrides = {}) {
  const environment = { ...process.env };
  for (const name of liveKitNames) delete environment[name];
  Object.assign(environment, overrides);
  return spawnSync(process.execPath, [
    "--conditions=react-server",
    "--experimental-strip-types",
    "--input-type=module",
    "--eval",
    `const { env } = await import(${JSON.stringify(moduleUrl)}); process.stdout.write(JSON.stringify(env.server.liveKit.storage));`,
  ], { encoding: "utf8", env: environment });
}

test("literal false alone is inert while true activates private storage validation", () => {
  const inert = loadEnvironment({ LIVEKIT_S3_FORCE_PATH_STYLE: "false" });
  assert.equal(inert.status, 0, inert.stderr);
  assert.equal(JSON.parse(inert.stdout).forcePathStyle, false);

  const active = loadEnvironment({ LIVEKIT_S3_FORCE_PATH_STYLE: "true" });
  assert.notEqual(active.status, 0);
  assert.match(active.stderr, /LIVEKIT_S3_ACCESS_KEY/u);
});

test("endpoint, region, or an actual storage field activates all-or-none validation", () => {
  for (const override of [
    { LIVEKIT_S3_ENDPOINT: "https://storage.example.test" },
    { LIVEKIT_S3_REGION: "eu-west-1" },
    { LIVEKIT_S3_BUCKET: "partial" },
  ]) {
    const result = loadEnvironment(override);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /LIVEKIT_S3_(?:ACCESS_KEY|SECRET|BUCKET)/u);
  }
});

test("a complete storage configuration remains accepted", () => {
  const result = loadEnvironment({
    LIVEKIT_S3_ACCESS_KEY: "access",
    LIVEKIT_S3_SECRET: "secret",
    LIVEKIT_S3_BUCKET: "private-recordings",
    LIVEKIT_S3_ENDPOINT: "https://storage.example.test",
    LIVEKIT_S3_REGION: "eu-west-1",
    LIVEKIT_S3_FORCE_PATH_STYLE: "true",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).forcePathStyle, true);
});
