import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public localized stream lookup explicitly excludes private lifecycle states", async () => {
  const source = await readFile(new URL("./live-tv.repository.ts", import.meta.url), "utf8");
  assert.match(source, /getPublicLiveChannelsByLanguage/u);
  assert.match(source, /\.in\("status", \["live", "scheduled", "offline"\]\)/u);
  assert.match(source, /language\.code/u);
});
