import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const chromePath = new URL("./prototype-chrome.tsx", import.meta.url);
const layoutPath = new URL("../../../app/[locale]/layout.tsx", import.meta.url);

test("public chrome consumes the cached homepage snapshot for breaking and pinned content", async () => {
  const [chrome, layout] = await Promise.all([
    readFile(chromePath, "utf8"),
    readFile(layoutPath, "utf8"),
  ]);
  assert.doesNotMatch(chrome, /Election Commission publishes|Monsoon watch active|Demo update/u);
  assert.match(chrome, /breaking\.length > 0/u);
  assert.match(chrome, /tickerItems\.map/u);
  assert.match(chrome, /pinnedAlert && pinnedOpen/u);
  assert.match(layout, /getHomepageData\(locale\)/u);
  assert.match(layout, /homepageData=/u);
  assert.ok(chrome.includes('action={`/${locale}/search`}'));
});
