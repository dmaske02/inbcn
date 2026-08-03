import assert from "node:assert/strict";
import test from "node:test";

const source = {
  id: "rss-source-1",
  name: "Example RSS",
  feedUrl: "https://feeds.example.com/news.xml",
  defaultLanguageId: "language-en",
  defaultLanguageCode: "en",
  defaultCategoryId: "category-national",
  defaultCategorySlug: "national",
  country: "in",
  isActive: true,
};

const entry = {
  id: "rss-story-1",
  title: "India launches RSS programme",
  link: "https://example.com/rss-programme?utm_source=feed",
  summary: "<p>Programme summary.</p>",
  content: "<p>Programme body.</p>",
  publishedAt: "2026-08-02T12:00:00Z",
  author: "Example Desk",
  categories: ["Technology"],
  imageUrl: "https://cdn.example.com/rss-programme.jpg",
  language: "en",
};

function dependencies(overrides = {}) {
  const completed = [];
  const inserted = [];
  return {
    completed,
    inserted,
    value: {
      createRun: async () => ({ id: "run-rss-1" }),
      completeRun: async (id, result) => completed.push({ id, result }),
      fetchFeed: async () => ({
        format: "rss",
        title: "Example RSS",
        language: "en",
        entries: [entry],
      }),
      getExistingIdentities: async () => [],
      slugExists: async () => false,
      insertDraft: async (draft) => {
        inserted.push(draft);
        return { status: "created", id: "story-1" };
      },
      now: () => "2026-08-02T13:00:00.000Z",
      ...overrides,
    },
  };
}

async function loadOperations() {
  const operations = await import("./rss.operations.ts").catch(() => null);
  assert.ok(operations, "RSS import operation should exist");
  return operations;
}

test("imports RSS entries through the shared private-draft workflow", async () => {
  const { runRssImportOperation } = await loadOperations();
  const deps = dependencies();

  const result = await runRssImportOperation(
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
  assert.equal(deps.inserted[0].story_type, "external_article");
  assert.equal(deps.inserted[0].status, "draft");
  assert.equal(deps.inserted[0].published_at, null);
  assert.equal(deps.inserted[0].category_id, "category-technology");
  assert.equal(deps.inserted[0].external_url, "https://example.com/rss-programme");
  assert.equal(
    deps.inserted[0].external_image_url,
    "https://cdn.example.com/rss-programme.jpg",
  );
  assert.equal(deps.completed[0].result.status, "completed");
});

test("reuses provider id, canonical URL, and title-source duplicate checks", async () => {
  const { runRssImportOperation } = await loadOperations();
  const deps = dependencies({
    fetchFeed: async () => ({
      format: "rss",
      title: "Example RSS",
      language: "en",
      entries: [
        entry,
        { ...entry, id: "rss-story-2", link: "https://example.com/existing", title: "Other" },
        { ...entry, id: "rss-story-3", link: "https://example.com/new", title: "Existing title" },
      ],
    }),
    getExistingIdentities: async () => [
      { externalId: "rss-story-1", externalUrl: null, title: "First" },
      { externalId: null, externalUrl: "https://example.com/existing", title: "Second" },
      { externalId: null, externalUrl: null, title: "Existing title" },
    ],
  });

  const result = await runRssImportOperation(
    {
      actorId: "editor-1",
      source,
      categories: [{ id: "category-national", slug: "national" }],
    },
    deps.value,
  );

  assert.equal(result.counts.duplicates, 3);
  assert.equal(result.counts.imported, 0);
  assert.equal(deps.inserted.length, 0);
});

test("finalizes RSS run history when feed retrieval fails", async () => {
  const { runRssImportOperation } = await loadOperations();
  const deps = dependencies({
    fetchFeed: async () => {
      throw new Error("feed unavailable");
    },
  });

  await assert.rejects(
    runRssImportOperation(
      {
        actorId: "editor-1",
        source,
        categories: [{ id: "category-national", slug: "national" }],
      },
      deps.value,
    ),
    /RSS import could not be completed/i,
  );
  assert.equal(deps.completed.length, 1);
  assert.equal(deps.completed[0].result.status, "failed");
  assert.equal(deps.completed[0].result.errorMessage, "RSS import failed.");
});
