import assert from "node:assert/strict";
import test from "node:test";

import * as routingModule from "./routing.ts";

test("uses Hindi for unprefixed routes while keeping every explicit locale available", () => {
  assert.equal(routingModule.routing.defaultLocale, "hi");
  assert.equal(routingModule.routing.localePrefix, "always");
  assert.deepEqual(routingModule.routing.locales, ["en", "hi", "mr"]);
});

test("switches the locale prefix while preserving the public route and query", () => {
  assert.equal(typeof routingModule.localizePublicPath, "function");
  assert.equal(
    routingModule.localizePublicPath("/en/category/world", "hi"),
    "/hi/category/world",
  );
  assert.equal(
    routingModule.localizePublicPath("/en/story/example", "mr"),
    "/mr/story/example",
  );
  assert.equal(
    routingModule.localizePublicPath("/hi/search", "en", "q=budget&page=2"),
    "/en/search?q=budget&page=2",
  );
  assert.equal(routingModule.localizePublicPath("/mr", "en"), "/en");
});
