import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const localeFiles = ["en", "hi", "mr"];
const requiredHomepagePaths = [
  ["actions", "allStories"],
  ["sources", "title"],
  ["sources", "description"],
];

for (const locale of localeFiles) {
  test(`${locale} includes every homepage message used by the homepage`, async () => {
    const messages = JSON.parse(
      await readFile(new URL(`../../../../messages/${locale}.json`, import.meta.url), "utf8"),
    );

    for (const path of requiredHomepagePaths) {
      const value = path.reduce((current, key) => current?.[key], messages.homepage);
      assert.equal(typeof value, "string", `missing homepage.${path.join(".")} in ${locale}.json`);
      assert.ok(value.trim().length > 0, `empty homepage.${path.join(".")} in ${locale}.json`);
    }
  });
}
