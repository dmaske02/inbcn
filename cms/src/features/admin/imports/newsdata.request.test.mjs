import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNewsDataRequestUrl,
  parseNewsDataResponse,
  sanitizeNewsDataError,
} from "./newsdata.request.ts";

test("builds the official latest endpoint with supported source filters", () => {
  const url = buildNewsDataRequestUrl("development-key", {
    country: "in",
    language: "hi",
    page: "next-page-token",
    size: 10,
  });

  assert.equal(`${url.origin}${url.pathname}`, "https://newsdata.io/api/1/latest");
  assert.equal(url.searchParams.get("apikey"), "development-key");
  assert.equal(url.searchParams.get("country"), "in");
  assert.equal(url.searchParams.get("language"), "hi");
  assert.equal(url.searchParams.get("page"), "next-page-token");
  assert.equal(url.searchParams.get("size"), "10");
  assert.equal(url.searchParams.get("removeduplicate"), "1");
});

test("omits empty optional filters and caps request size", () => {
  const url = buildNewsDataRequestUrl("development-key", {
    country: null,
    language: null,
    page: null,
    size: 500,
  });

  assert.equal(url.searchParams.has("country"), false);
  assert.equal(url.searchParams.has("language"), false);
  assert.equal(url.searchParams.has("page"), false);
  assert.equal(url.searchParams.get("size"), "10");
});

test("parses a successful provider response without exposing transport details", () => {
  assert.deepEqual(
    parseNewsDataResponse({
      status: "success",
      totalResults: 1,
      results: [{ article_id: "abc" }],
      nextPage: "token",
    }),
    {
      totalResults: 1,
      articles: [{ article_id: "abc" }],
      nextPage: "token",
    },
  );
});

test("rejects malformed provider responses", () => {
  assert.throws(() => parseNewsDataResponse({ status: "success", results: null }), /response/i);
});

test("sanitizes provider failures and never includes an API key", () => {
  const error = sanitizeNewsDataError(
    "Invalid apikey pub_example-secret-value supplied",
  );
  assert.equal(error.includes("pub_example-secret-value"), false);
  assert.match(error, /\[redacted\]/u);
});
