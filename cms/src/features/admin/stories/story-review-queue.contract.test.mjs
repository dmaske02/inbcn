import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [route, loading, error, queue, service, repository] = await Promise.all([
  readFile(new URL("../../../app/admin/(protected)/stories/review/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../../app/admin/(protected)/stories/review/loading.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../../app/admin/(protected)/stories/review/error.tsx", import.meta.url), "utf8"),
  readFile(new URL("./story-review-queue.tsx", import.meta.url), "utf8"),
  readFile(new URL("./story.service.ts", import.meta.url), "utf8"),
  readFile(new URL("../../news/server/stories.repository.ts", import.meta.url), "utf8"),
]);

test("review route authenticates and loads the dedicated queue", () => {
  assert.match(route, /requireAdminUser/u);
  assert.match(route, /getStoryReviewQueueView/u);
  assert.match(route, /StoryReviewQueue/u);
});

test("review queue is SQL-filtered, paginated, and oldest-submitted first", () => {
  const reviewView = service.match(/export async function getStoryReviewQueueView[\s\S]*?\n\}/u)?.[0] ?? "";
  assert.match(reviewView, /status:\s*"pending_review"/u);
  assert.match(reviewView, /sort:\s*"submitted_asc"/u);
  assert.match(reviewView, /pageSize:\s*PAGE_SIZE/u);
  assert.match(repository, /sort === "submitted_asc"[\s\S]*?order\("submitted_at", \{ ascending: true[\s\S]*?order\("id", \{ ascending: true/u);
});

test("review queue exposes server-backed search, locale, category, and pagination", () => {
  assert.match(queue, /name="search"/u);
  assert.match(queue, /name="language"/u);
  assert.match(queue, /name="category"/u);
  assert.match(queue, /<Pagination/u);
});

test("review queue has required editorial fields and an actionable empty state", () => {
  for (const label of ["Headline", "Category", "Locale", "Author", "Submitted", "Status"]) {
    assert.match(queue, new RegExp(label, "u"));
  }
  assert.match(queue, /No Stories are waiting for review\./u);
  assert.match(queue, /featuredMedia/u);
});

test("review queue defines loading and recoverable error states", () => {
  assert.match(loading, /aria-busy/u);
  assert.match(error, /use client/u);
  assert.match(error, /reset/u);
  assert.match(error, /Try again/u);
});
