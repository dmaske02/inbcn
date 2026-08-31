import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("reporter exposes required scripts and uses shared packages", async () => {
  const pkg = JSON.parse(
    await readFile(new URL("../../package.json", import.meta.url)),
  );

  assert.equal(pkg.name, "@inbcn/reporter");
  assert.deepEqual(Object.keys(pkg.scripts).sort(), [
    "build",
    "dev",
    "lint",
    "start",
    "test",
    "typecheck",
  ]);
  assert.equal(pkg.dependencies["@inbcn/database"], "*");
  assert.equal(pkg.dependencies["@inbcn/domain"], "*");
});

test("SMS cannot be enabled before a provider is configured", async () => {
  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        "--conditions=react-server",
        "--experimental-strip-types",
        "--input-type=module",
        "-e",
        'await import("./src/config/env.ts")',
      ],
      {
        cwd: new URL("../..", import.meta.url),
        env: { ...process.env, SMS_NOTIFICATIONS_ENABLED: "true" },
      },
    ),
    (error) => {
      assert.match(
        `${error.stdout ?? ""}${error.stderr ?? ""}`,
        /SMS_NOTIFICATIONS_ENABLED requires a configured SMS provider/,
      );
      return true;
    },
  );
});

test("runtime cron secrets reject weak configured values and accept 32 characters", async () => {
  const importEnvironment = (cronSecret) => execFileAsync(
    process.execPath,
    [
      "--conditions=react-server",
      "--experimental-strip-types",
      "--input-type=module",
      "-e",
      'await import("./src/config/env.ts")',
    ],
    {
      cwd: new URL("../..", import.meta.url),
      env: {
        ...process.env,
        CRON_SECRET: cronSecret,
        SMS_NOTIFICATIONS_ENABLED: "false",
      },
    },
  );

  await assert.rejects(
    importEnvironment("too-short"),
    (error) => {
      assert.match(
        `${error.stdout ?? ""}${error.stderr ?? ""}`,
        /CRON_SECRET/u,
      );
      return true;
    },
  );
  await importEnvironment("x".repeat(32));
});

test("temporary onboarding is disabled by default and accepted in preview", async () => {
  const importEnvironment = (temporaryOnboarding, expected) => execFileAsync(
    process.execPath,
    [
      "--conditions=react-server",
      "--experimental-strip-types",
      "--input-type=module",
      "-e",
      `const { env } = await import("./src/config/env.ts"); if (env.server.temporaryOnboarding !== ${expected}) process.exit(2)`,
    ],
    {
      cwd: new URL("../..", import.meta.url),
      env: {
        ...process.env,
        REPORTER_TEMPORARY_ONBOARDING: temporaryOnboarding,
        VERCEL_ENV: "preview",
      },
    },
  );

  await importEnvironment("false", false);
  await importEnvironment("true", true);
});

test("temporary onboarding cannot be enabled in Vercel production", async () => {
  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        "--conditions=react-server",
        "--experimental-strip-types",
        "--input-type=module",
        "-e",
        'await import("./src/config/env.ts")',
      ],
      {
        cwd: new URL("../..", import.meta.url),
        env: {
          ...process.env,
          REPORTER_TEMPORARY_ONBOARDING: "true",
          VERCEL_ENV: "production",
        },
      },
    ),
    (error) => {
      assert.match(
        `${error.stdout ?? ""}${error.stderr ?? ""}`,
        /REPORTER_TEMPORARY_ONBOARDING cannot be enabled in production/u,
      );
      return true;
    },
  );
});

test("demo authentication is disabled by default and explicitly enabled in production", async () => {
  const importEnvironment = (demoMode, expected) => execFileAsync(
    process.execPath,
    [
      "--conditions=react-server",
      "--experimental-strip-types",
      "--input-type=module",
      "-e",
      `const { env } = await import("./src/config/env.ts"); if (env.server.demoMode !== ${expected}) process.exit(2)`,
    ],
    {
      cwd: new URL("../..", import.meta.url),
      env: {
        ...process.env,
        REPORTER_DEMO_MODE: demoMode,
        REPORTER_TEMPORARY_ONBOARDING: "false",
        VERCEL_ENV: "production",
      },
    },
  );

  await importEnvironment("false", false);
  await importEnvironment("true", true);
});
