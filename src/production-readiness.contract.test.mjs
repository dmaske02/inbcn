import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

async function productionSources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) return productionSources(url);
    if (!/\.(?:ts|tsx)$/u.test(entry.name) || /(?:test|type-test)\./u.test(entry.name)) return [];
    return [[url, await readFile(url, "utf8")]];
  }));
  return files.flat();
}

test("production sources contain no temporary diagnostics", async () => {
  const sources = await productionSources(new URL("./", import.meta.url));
  const violations = sources.flatMap(([url, source]) =>
    /console\.(?:log|debug|info|time|timeEnd)\s*\(|import-diagnostics/u.test(source)
      ? [url.pathname]
      : [],
  );

  assert.deepEqual(violations, []);
});

test("environment configuration contains only implemented integrations", async () => {
  const [environment, example] = await Promise.all([
    readFile(new URL("./config/env.ts", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);
  const unused = [
    "CLOUDINARY_API_ENVIRONMENT",
    "SENTRY_AUTH_TOKEN",
    "NEXT_PUBLIC_SENTRY_DSN",
    "NEXT_PUBLIC_GA_MEASUREMENT_ID",
    "NEXT_PUBLIC_VERCEL_ANALYTICS_ID",
    "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
  ];

  for (const name of unused) {
    assert.doesNotMatch(environment, new RegExp(name, "u"));
    assert.doesNotMatch(example, new RegExp(name, "u"));
  }
});
