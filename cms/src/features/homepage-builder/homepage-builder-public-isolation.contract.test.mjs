import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Phase 1 news data and legacy presentation remain isolated from Homepage Builder persistence", async () => {
  const files = ["src/features/news/components/homepage.tsx", "src/features/news/components/homepage-sections.tsx", "src/features/news/server/services/homepage.service.ts", "src/features/news/server/services/homepage.model.ts"];
  for (const file of files) assert.doesNotMatch(await readFile(file, "utf8"), /homepage-builder/u, file);
});
