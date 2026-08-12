import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Homepage Builder feature flag is validated, server-only, and disabled by default", async () => {
  const source = await readFile("src/config/env.ts", "utf8");
  assert.match(source, /HOMEPAGE_BUILDER_ENABLED:\s*z\.enum\(\["true", "false"\]\)\.default\("false"\)/u);
  assert.match(source, /HOMEPAGE_BUILDER_ENABLED:\s*process\.env\.HOMEPAGE_BUILDER_ENABLED/u);
  assert.match(source, /homepageBuilder:\s*Object\.freeze\(\{\s*enabled:\s*values\.HOMEPAGE_BUILDER_ENABLED === "true"/u);
  const publicBlock = source.slice(source.indexOf("public: Object.freeze"), source.indexOf("server: Object.freeze"));
  assert.doesNotMatch(publicBlock, /homepageBuilder|HOMEPAGE_BUILDER/u);
});
