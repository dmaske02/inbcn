import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const featureUrl = new URL("../", import.meta.url);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    if (entry.isDirectory()) return sourceFiles(url);
    return /\.(?:ts|tsx)$/u.test(entry.name) && !/\.test\./u.test(entry.name) ? [url] : [];
  }));
  return files.flat();
}

async function usedLiveTvMessageKeys() {
  const keys = new Set();
  for (const url of await sourceFiles(featureUrl)) {
    const source = await readFile(url, "utf8");
    if (!/(?:getTranslations|useTranslations)\([\s\S]*?namespace:\s*["']liveTvPage["']/u.test(source)) continue;
    for (const match of source.matchAll(/\bt\(\s*["']([^"']+)["']/gu)) keys.add(match[1]);
  }
  return [...keys].sort();
}

function leafPaths(value, prefix = "") {
  if (!value || typeof value !== "object") return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    leafPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

test("all supported locales expose the same complete message shape", async () => {
  const messages = await Promise.all(["en", "hi", "mr"].map(async (locale) => JSON.parse(
    await readFile(new URL(`../../../../messages/${locale}.json`, import.meta.url), "utf8"),
  )));
  const expected = leafPaths(messages[0]).sort();
  for (const [index, message] of messages.entries()) {
    assert.deepEqual(leafPaths(message).sort(), expected, ["en", "hi", "mr"][index]);
  }
});

for (const locale of ["en", "hi", "mr"]) {
  test(`${locale} provides every message requested by the Live TV feature`, async () => {
    const messages = JSON.parse(
      await readFile(new URL(`../../../../messages/${locale}.json`, import.meta.url), "utf8"),
    );
    assert.ok(messages.liveTvPage);
    for (const key of await usedLiveTvMessageKeys()) {
      assert.equal(typeof messages.liveTvPage[key], "string", `liveTvPage.${key}`);
    }
  });
}
