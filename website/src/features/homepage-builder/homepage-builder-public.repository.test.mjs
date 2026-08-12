import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public Homepage Builder repository is read-only and ordered", async () => {
  const source=await readFile("src/features/homepage-builder/homepage-builder.repository.ts","utf8");
  const boundary=source.slice(source.indexOf("export async function getPublicHomepageConfiguration"));
  assert.match(boundary,/createClient/u); assert.doesNotMatch(boundary,/createAdminClient/u); assert.match(boundary,/homepage_configurations/u); assert.match(boundary,/homepage_sections/u); assert.match(boundary,/\.order\("position", \{ ascending: true \}\)/u);
  assert.doesNotMatch(boundary,/\.insert\(|\.update\(|\.delete\(|\.rpc\(|feature flag|fallback|renderer/iu);
});
