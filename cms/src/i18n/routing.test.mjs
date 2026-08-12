import assert from "node:assert/strict";
import test from "node:test";

import * as routingModule from "./routing.ts";

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
