import assert from "node:assert/strict";
import test from "node:test";

import * as routingModule from "./routing.ts";

test("uses Hindi for unprefixed routes while keeping every explicit locale available", () => {
  assert.equal(routingModule.routing.defaultLocale, "hi");
  assert.equal(routingModule.routing.localePrefix, "always");
  assert.deepEqual(routingModule.routing.locales, ["hi", "en", "mr"]);
});

test("removes browser language from locale routing while preserving saved locale cookies", () => {
  assert.equal(typeof routingModule.localeRoutingHeaders, "function");

  for (const acceptLanguage of [
    "en-US,en;q=0.9",
    "hi-IN,hi;q=0.9,en;q=0.8",
    "mr-IN,mr;q=0.9,en;q=0.8",
  ]) {
    const headers = routingModule.localeRoutingHeaders(
      new Headers({ "accept-language": acceptLanguage }),
    );
    assert.equal(headers.get("accept-language"), null);
  }

  for (const locale of ["en", "hi", "mr"]) {
    const headers = routingModule.localeRoutingHeaders(
      new Headers({
        "accept-language": "en-US,en;q=0.9",
        cookie: `NEXT_LOCALE=${locale}`,
      }),
    );
    assert.equal(headers.get("cookie"), `NEXT_LOCALE=${locale}`);
  }
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
