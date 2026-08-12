import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("editorial mutations invalidate the matching website cache event", async () => {
  const cases = [
    [new URL("./stories/story.actions.ts", import.meta.url), /revalidatePublicNews/u],
    [new URL("../alerts/breaking-alerts.actions.ts", import.meta.url), /revalidateWebsite\("alerts"\)/u],
    [new URL("./imports/ingestion.actions.ts", import.meta.url), /revalidatePublicNews/u],
  ];
  for (const [file, expected] of cases) {
    const source = await readFile(file, "utf8");
    assert.match(source, expected);
  }
});

test("shared revalidation helper is a server-only utility rather than a Server Action module", async () => {
  const source = await readFile(new URL("./public-revalidation.ts", import.meta.url), "utf8");
  assert.match(source, /import "server-only"/u);
  assert.match(source, /WEBSITE_REVALIDATION_SECRET/u);
  assert.match(source, /fetch\(new URL\("\/api\/revalidate", websiteUrl\)/u);
  assert.doesNotMatch(source, /^"use server"/u);
});
