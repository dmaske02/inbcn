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
