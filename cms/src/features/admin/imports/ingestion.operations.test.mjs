import assert from "node:assert/strict";
import test from "node:test";

import { runNewsDataImportOperation } from "./ingestion.operations.ts";

const source = {
  id: "source-1",
  name: "NewsData India",
  defaultLanguageId: "language-en",
  defaultLanguageCode: "en",
  defaultCategoryId: "category-national",
  defaultCategorySlug: "national",
  country: "in",
  isActive: true,
};

const article = {
  article_id: "article-1",
  title: "India launches digital programme",
  link: "https://example.com/digital-programme?utm_source=feed",
  description: "Programme summary",
  content: "Programme body",
  language: "english",
  category: ["technology"],
  source_name: "Example News",
};

function dependencies(overrides = {}) {
  const completed = [];
  const inserted = [];
  return {
    completed,
    inserted,
    value: {
      createRun: async () => ({ id: "run-1" }),
      completeRun: async (id, result) => completed.push({ id, result }),
      fetchPage: async () => ({
        totalResults: 1,
        articles: [article],
        nextPage: null,
        quota: {
          apiCreditsRemaining: 100,
          windowLimit: 60,
          windowRemaining: 59,
          windowResetAt: null,
        },
      }),
      getExistingIdentities: async () => [],
      slugExists: async () => false,
      insertDraft: async (draft) => {
        inserted.push(draft);
        return { status: "created", id: "story-1" };
      },
      now: () => "2026-08-02T12:00:00.000Z",
      ...overrides,
    },
  };
}

test("imports normalized NewsData articles strictly as private external drafts", async () => {
  const deps = dependencies();
  const result = await runNewsDataImportOperation(
    {
      actorId: "editor-1",
      source,
      categories: [
        { id: "category-national", slug: "national" },
        { id: "category-technology", slug: "technology" },
      ],
    },
    deps.value,
  );

  assert.deepEqual(result.counts, {
    fetched: 1,
    imported: 1,
    skipped: 0,
    duplicates: 0,
    failed: 0,
  });
  assert.equal(deps.inserted.length, 1);
  assert.equal(deps.inserted[0].story_type, "external_article");
  assert.equal(deps.inserted[0].status, "draft");
  assert.equal(deps.inserted[0].published_at, null);
  assert.equal(deps.inserted[0].approved_at, null);
  assert.equal(deps.inserted[0].category_id, "category-technology");
  assert.equal(deps.inserted[0].external_url, "https://example.com/digital-programme");
  assert.equal(deps.completed[0].result.status, "completed");
});

test("skips existing external ids, canonical URLs, and normalized title-source pairs", async () => {
  const deps = dependencies({
    fetchPage: async () => ({
      totalResults: 3,
      articles: [
        article,
        { ...article, article_id: "article-2", link: "https://example.com/existing-url", title: "Different title" },
        { ...article, article_id: "article-3", link: "https://example.com/new-url", title: "Existing Headline", source_name: "Example News" },
      ],
      nextPage: null,
      quota: { apiCreditsRemaining: null, windowLimit: null, windowRemaining: null, windowResetAt: null },
    }),
    getExistingIdentities: async () => [
      { externalId: "article-1", externalUrl: "https://example.com/one", title: "One" },
      { externalId: null, externalUrl: "https://example.com/existing-url", title: "Two" },
      { externalId: null, externalUrl: null, title: " existing headline " },
    ],
  });

  const result = await runNewsDataImportOperation(
    {
      actorId: "editor-1",
      source,
      categories: [{ id: "category-national", slug: "national" }],
    },
    deps.value,
  );

  assert.deepEqual(result.counts, {
    fetched: 3,
    imported: 0,
    skipped: 3,
    duplicates: 3,
    failed: 0,
  });
  assert.equal(deps.inserted.length, 0);
});

test("records malformed records as failures while completing successful items", async () => {
  const deps = dependencies({
    fetchPage: async () => ({
      totalResults: 2,
      articles: [article, { ...article, article_id: "broken", title: " " }],
      nextPage: null,
      quota: { apiCreditsRemaining: null, windowLimit: null, windowRemaining: null, windowResetAt: null },
    }),
  });

  const result = await runNewsDataImportOperation(
    {
      actorId: "editor-1",
      source,
      categories: [{ id: "category-national", slug: "national" }],
    },
    deps.value,
  );

  assert.equal(result.counts.imported, 1);
  assert.equal(result.counts.failed, 1);
  assert.equal(result.status, "partial");
  assert.equal(deps.completed[0].result.status, "partial");
  assert.match(result.details[1].reason, /invalid provider article/i);
});

test("uses title and source as the duplicate fallback when provider ids and URLs are absent", async () => {
  const deps = dependencies({
    fetchPage: async () => ({
      totalResults: 1,
      articles: [{ ...article, article_id: null, link: null }],
      nextPage: null,
      quota: { apiCreditsRemaining: null, windowLimit: null, windowRemaining: null, windowResetAt: null },
    }),
  });

  const result = await runNewsDataImportOperation(
    {
      actorId: "editor-1",
      source,
      categories: [{ id: "category-national", slug: "national" }],
    },
    deps.value,
  );

  assert.equal(result.counts.imported, 1);
  assert.equal(result.counts.failed, 0);
  assert.equal(deps.inserted[0].external_id, null);
  assert.equal(deps.inserted[0].external_url, null);
});

test("finalizes the ingest run as failed when the provider request fails", async () => {
  const deps = dependencies({
    fetchPage: async () => {
      throw new Error("provider unavailable");
    },
  });

  await assert.rejects(
    runNewsDataImportOperation(
      {
        actorId: "editor-1",
        source,
        categories: [{ id: "category-national", slug: "national" }],
      },
      deps.value,
    ),
    /import could not be completed/i,
  );
  assert.equal(deps.completed.length, 1);
  assert.equal(deps.completed[0].result.status, "failed");
  assert.equal(deps.completed[0].result.errorMessage, "NewsData import failed.");
});

test("finalizes the ingest run when duplicate lookup fails", async () => {
  const deps = dependencies({
    getExistingIdentities: async () => {
      throw new Error("database unavailable");
    },
  });

  await assert.rejects(
    runNewsDataImportOperation(
      {
        actorId: "editor-1",
        source,
        categories: [{ id: "category-national", slug: "national" }],
      },
      deps.value,
    ),
    /import could not be completed/i,
  );
  assert.equal(deps.completed.length, 1);
  assert.equal(deps.completed[0].result.status, "failed");
  assert.equal(deps.completed[0].result.errorMessage, "NewsData import failed.");
});

test("finalizes the ingest run when slug lookup fails", async () => {
  const deps = dependencies({
    slugExists: async () => {
      throw new Error("database unavailable");
    },
  });

  await assert.rejects(
    runNewsDataImportOperation(
      {
        actorId: "editor-1",
        source,
        categories: [{ id: "category-national", slug: "national" }],
      },
      deps.value,
    ),
    /import could not be completed/i,
  );
  assert.equal(deps.completed.length, 1);
  assert.equal(deps.completed[0].result.status, "failed");
  assert.equal(deps.completed[0].result.errorMessage, "NewsData import failed.");
});

test("refuses disabled or incomplete source configurations before creating a run", async () => {
  const deps = dependencies();
  await assert.rejects(
    runNewsDataImportOperation(
      {
        actorId: "editor-1",
        source: { ...source, isActive: false },
        categories: [{ id: "category-national", slug: "national" }],
      },
      deps.value,
    ),
    /active/i,
  );
  assert.equal(deps.completed.length, 0);
});
