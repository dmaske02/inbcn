import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("CMS revalidation client sends only allowlisted signed events", async () => {
  const source = await readFile(new URL("./public-revalidation.ts", import.meta.url), "utf8");

  assert.match(source, /import "server-only"/u);
  assert.match(source, /WebsiteRevalidationEvent/u);
  assert.match(source, /WEBSITE_URL/u);
  assert.match(source, /WEBSITE_REVALIDATION_SECRET/u);
  assert.match(source, /authorization/u);
  assert.doesNotMatch(source, /revalidatePath\("\/\[locale\]"/u);
});
