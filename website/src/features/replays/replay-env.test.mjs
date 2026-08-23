import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const moduleUrl = new URL("../../config/env.ts", import.meta.url).href;
const names = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "LIVEKIT_S3_ACCESS_KEY",
  "LIVEKIT_S3_SECRET",
  "LIVEKIT_S3_BUCKET",
  "LIVEKIT_S3_ENDPOINT",
  "LIVEKIT_S3_REGION",
  "LIVEKIT_S3_FORCE_PATH_STYLE",
];

function loadEnvironment(overrides = {}) {
  const environment = { ...process.env, NODE_ENV: "test" };
  for (const name of names) delete environment[name];
  Object.assign(environment, overrides);
  return spawnSync(process.execPath, [
    "--conditions=react-server",
    "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
    "--input-type=module",
    "--eval",
    `const { env } = await import(${JSON.stringify(moduleUrl)}); process.stdout.write(JSON.stringify(env.server.replayStorage));`,
  ], { encoding: "utf8", env: environment });
}

test("private replay delivery configuration is optional but all-or-none", () => {
  assert.equal(loadEnvironment().status, 0);

  const partial = loadEnvironment({ LIVEKIT_S3_ACCESS_KEY: "access" });
  assert.notEqual(partial.status, 0);
  for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "LIVEKIT_S3_SECRET", "LIVEKIT_S3_BUCKET", "LIVEKIT_S3_REGION"]) {
    assert.match(partial.stderr, new RegExp(name, "u"));
  }
});

test("complete replay credentials remain server-only", async () => {
  const complete = loadEnvironment({
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    LIVEKIT_S3_ACCESS_KEY: "access",
    LIVEKIT_S3_SECRET: "secret",
    LIVEKIT_S3_BUCKET: "private-recordings",
    LIVEKIT_S3_ENDPOINT: "https://objects.example.test",
    LIVEKIT_S3_REGION: "ap-south-1",
    LIVEKIT_S3_FORCE_PATH_STYLE: "true",
  });
  assert.equal(complete.status, 0, complete.stderr);
  assert.deepEqual(JSON.parse(complete.stdout), {
    supabaseServiceRoleKey: "service-role",
    accessKey: "access",
    secret: "secret",
    bucket: "private-recordings",
    endpoint: "https://objects.example.test",
    region: "ap-south-1",
    forcePathStyle: true,
  });

  const envSource = await readFile(new URL("../../config/env.ts", import.meta.url), "utf8");
  assert.doesNotMatch(envSource, /NEXT_PUBLIC_(?:LIVEKIT_S3|SUPABASE_SERVICE_ROLE)/u);
});
