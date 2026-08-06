import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("all editorial mutation actions invalidate the public locale layout", async () => {
  const files = [
    new URL("./stories/story.actions.ts", import.meta.url),
    new URL("../alerts/breaking-alerts.actions.ts", import.meta.url),
    new URL("./imports/ingestion.actions.ts", import.meta.url),
  ];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.match(source, /revalidatePublicNews/u);
  }
});

test("shared revalidation helper is a server-only utility rather than a Server Action module", async () => {
  const source = await readFile(new URL("./public-revalidation.ts", import.meta.url), "utf8");
  assert.match(source, /import "server-only"/u);
  assert.doesNotMatch(source, /^"use server"/u);
});
