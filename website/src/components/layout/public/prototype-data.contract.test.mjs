import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const chromePath = new URL("./editorial-shell.tsx", import.meta.url);
const searchPath = new URL("./search-dialog.tsx", import.meta.url);
const layoutPath = new URL("../../../app/[locale]/layout.tsx", import.meta.url);

test("public chrome consumes the cached homepage snapshot for breaking and pinned content", async () => {
  const [chrome, layout, search] = await Promise.all([
    readFile(chromePath, "utf8"),
    readFile(layoutPath, "utf8"),
    readFile(searchPath, "utf8"),
  ]);
  assert.doesNotMatch(chrome, /Election Commission publishes|Monsoon watch active|Demo update/u);
  assert.match(chrome, /breaking\.length > 0/u);
  assert.match(chrome, /tickerItems\.map/u);
  assert.match(chrome, /pinnedAlert && pinnedOpen/u);
  assert.match(layout, /getHomepageData\(locale\)/u);
  assert.match(layout, /homepageData=/u);
  assert.ok(search.includes('action={`/${locale}/search`}'));
});
