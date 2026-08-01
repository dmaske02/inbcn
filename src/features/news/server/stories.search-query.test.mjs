import assert from "node:assert/strict";
import test from "node:test";

import { createClient } from "@supabase/supabase-js";

import { buildPublishedStorySearchRequest } from "./stories.search-query.mjs";

test("builds the published locale-aware full-text search request", async () => {
  let capturedUrl = null;
  let capturedHeaders = null;
  const supabase = createClient("https://example.supabase.co", "public-test-key", {
    auth: { persistSession: false },
    global: {
      fetch: async (input, init) => {
        capturedUrl = new URL(input instanceof Request ? input.url : String(input));
        capturedHeaders = new Headers(init?.headers);
        return new Response("[]", {
          status: 200,
          headers: {
            "content-type": "application/json",
            "content-range": "*/0",
          },
        });
      },
    },
  });

  await buildPublishedStorySearchRequest(supabase, "id, title", {
    languageId: "language-id",
    query: "general election",
    categoryId: "category-id",
    publishedAfter: "2026-07-26T12:00:00.000Z",
    page: 2,
    pageSize: 12,
  });

  assert.ok(capturedUrl);
  assert.equal(capturedUrl.pathname, "/rest/v1/stories");
  assert.equal(capturedUrl.searchParams.get("language_id"), "eq.language-id");
  assert.equal(capturedUrl.searchParams.get("status"), "eq.published");
  assert.deepEqual(capturedUrl.searchParams.getAll("published_at"), [
    "not.is.null",
    "gte.2026-07-26T12:00:00.000Z",
  ]);
  assert.equal(capturedUrl.searchParams.get("category_id"), "eq.category-id");
  assert.equal(
    capturedUrl.searchParams.get("search_document"),
    "wfts(simple).general election",
  );
  assert.equal(capturedUrl.searchParams.get("order"), "published_at.desc");
  assert.equal(capturedUrl.searchParams.get("offset"), "12");
  assert.equal(capturedUrl.searchParams.get("limit"), "12");
  assert.match(capturedHeaders.get("prefer") ?? "", /count=exact/u);
});
