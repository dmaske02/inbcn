import assert from "node:assert/strict";
import test from "node:test";
import { createHomepagePickerRepository } from "./homepage-picker.repository.ts";

const STORY_COLUMNS = "id, language_id, title, published_at, external_image_url, external_image_width, external_image_height, featured_media:media!stories_featured_media_id_fkey(secure_url, alt_text, width, height), category:categories!stories_category_language_fkey(id, name)";
const CATEGORY_COLUMNS = "id, language_id, name, slug, stories:stories!stories_category_language_fkey(count)";

class FakeQuery {
  constructor(table, response, trace) {
    this.table = table;
    this.response = response;
    this.trace = trace;
  }

  record(method, args) {
    this.trace.push({ table: this.table, method, args });
    return this;
  }

  select(...args) { return this.record("select", args); }
  eq(...args) { return this.record("eq", args); }
  not(...args) { return this.record("not", args); }
  lte(...args) { return this.record("lte", args); }
  ilike(...args) { return this.record("ilike", args); }
  order(...args) { return this.record("order", args); }
  range(...args) { return this.record("range", args); }
  maybeSingle() {
    this.record("maybeSingle", []);
    return Promise.resolve(this.response);
  }
  then(resolve, reject) { return Promise.resolve(this.response).then(resolve, reject); }
}

function fakeDatabase(responses) {
  const trace = [];
  const queues = Object.fromEntries(
    Object.entries(responses).map(([table, values]) => [table, [...values]]),
  );
  const client = {
    from(table) {
      const response = queues[table]?.shift();
      assert.ok(response, `No fake response for ${table}`);
      return new FakeQuery(table, response, trace);
    },
  };
  return { trace, createClient: async () => client };
}

function calls(trace, table, method) {
  return trace.filter((entry) => entry.table === table && entry.method === method).map((entry) => entry.args);
}

test("story discovery is published, locale-scoped, searchable, deterministic, and paginated", async () => {
  const database = fakeDatabase({
    languages: [{ data: { id: "language-en" }, error: null }],
    stories: [{
      data: [{
        id: "story-1",
        language_id: "language-en",
        category_id: "category-1",
        title: "Monsoon response",
        published_at: "2026-08-11T08:00:00.000Z",
        external_image_url: "https://images.example/external.jpg",
        external_image_width: 1200,
        external_image_height: 675,
        featured_media: { secure_url: "https://media.example/featured.jpg", alt_text: "Flood response", width: 1600, height: 900 },
        category: { id: "category-1", name: "India" },
      }],
      count: 41,
      error: null,
    }],
  });
  const repository = createHomepagePickerRepository({
    createClient: database.createClient,
    now: () => "2026-08-11T10:00:00.000Z",
  });

  const result = await repository.searchStoryRecords({
    locale: "en",
    query: "monsoon",
    page: 3,
    pageSize: 20,
  });

  assert.equal(result.total, 41);
  assert.deepEqual(result.records, [{
    id: "story-1",
    languageId: "language-en",
    title: "Monsoon response",
    publishedAt: "2026-08-11T08:00:00.000Z",
    category: { id: "category-1", name: "India" },
    featuredMedia: { url: "https://media.example/featured.jpg", altText: "Flood response", width: 1600, height: 900 },
    externalImage: { url: "https://images.example/external.jpg", width: 1200, height: 675 },
  }]);
  assert.deepEqual(calls(database.trace, "languages", "eq"), [["code", "en"], ["is_active", true]]);
  assert.deepEqual(calls(database.trace, "stories", "select"), [[STORY_COLUMNS, { count: "exact" }]]);
  assert.deepEqual(calls(database.trace, "stories", "eq"), [["language_id", "language-en"], ["status", "published"]]);
  assert.deepEqual(calls(database.trace, "stories", "not"), [["published_at", "is", null]]);
  assert.deepEqual(calls(database.trace, "stories", "lte"), [["published_at", "2026-08-11T10:00:00.000Z"]]);
  assert.deepEqual(calls(database.trace, "stories", "ilike"), [["title", "%monsoon%"]]);
  assert.deepEqual(calls(database.trace, "stories", "order"), [
    ["published_at", { ascending: false }],
    ["id", { ascending: false }],
  ]);
  assert.deepEqual(calls(database.trace, "stories", "range"), [[40, 59]]);
});

test("targeted story lookup applies the same publication and locale rules without a discovery limit", async () => {
  const database = fakeDatabase({
    languages: [{ data: { id: "language-hi" }, error: null }],
    stories: [{
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        language_id: "language-hi",
        category_id: null,
        title: "Targeted story",
        published_at: "2026-08-11T07:00:00.000Z",
        external_image_url: null,
        external_image_width: null,
        external_image_height: null,
        featured_media: null,
        category: null,
      },
      error: null,
    }],
  });
  const repository = createHomepagePickerRepository({
    createClient: database.createClient,
    now: () => "2026-08-11T10:00:00.000Z",
  });

  const result = await repository.findPublishedStoryRecord(
    "11111111-1111-4111-8111-111111111111",
    "hi",
  );

  assert.equal(result?.id, "11111111-1111-4111-8111-111111111111");
  assert.deepEqual(calls(database.trace, "stories", "eq"), [
    ["id", "11111111-1111-4111-8111-111111111111"],
    ["language_id", "language-hi"],
    ["status", "published"],
  ]);
  assert.deepEqual(calls(database.trace, "stories", "maybeSingle"), [[]]);
  assert.deepEqual(calls(database.trace, "stories", "range"), []);
});

test("category discovery is active, locale-scoped, counted, deterministic, and paginated", async () => {
  const database = fakeDatabase({
    languages: [{ data: { id: "language-mr" }, error: null }],
    categories: [{
      data: [{
        id: "category-1",
        language_id: "language-mr",
        name: "महाराष्ट्र",
        slug: "maharashtra",
        sort_order: 4,
        stories: [{ count: 27 }],
      }],
      count: 22,
      error: null,
    }],
  });
  const repository = createHomepagePickerRepository({
    createClient: database.createClient,
    now: () => "2026-08-11T10:00:00.000Z",
  });

  const result = await repository.searchCategoryRecords({
    locale: "mr",
    query: "महा",
    page: 2,
    pageSize: 20,
  });

  assert.deepEqual(result, {
    records: [{ id: "category-1", languageId: "language-mr", name: "महाराष्ट्र", slug: "maharashtra", publishedStoryCount: 27 }],
    total: 22,
  });
  assert.deepEqual(calls(database.trace, "categories", "select"), [[CATEGORY_COLUMNS, { count: "exact" }]]);
  assert.deepEqual(calls(database.trace, "categories", "eq"), [
    ["language_id", "language-mr"],
    ["is_active", true],
    ["stories.status", "published"],
    ["stories.language_id", "language-mr"],
  ]);
  assert.deepEqual(calls(database.trace, "categories", "not"), [["stories.published_at", "is", null]]);
  assert.deepEqual(calls(database.trace, "categories", "lte"), [["stories.published_at", "2026-08-11T10:00:00.000Z"]]);
  assert.deepEqual(calls(database.trace, "categories", "ilike"), [["name", "%महा%"]]);
  assert.deepEqual(calls(database.trace, "categories", "order"), [
    ["sort_order", { ascending: true }],
    ["name", { ascending: true }],
    ["id", { ascending: true }],
  ]);
  assert.deepEqual(calls(database.trace, "categories", "range"), [[20, 39]]);
});

test("targeted category lookup requires an active category in the resolved locale", async () => {
  const database = fakeDatabase({
    languages: [{ data: { id: "language-en" }, error: null }],
    categories: [{
      data: { id: "category-1", language_id: "language-en", name: "India", slug: "india", sort_order: 1, stories: [{ count: 12 }] },
      error: null,
    }],
  });
  const repository = createHomepagePickerRepository({
    createClient: database.createClient,
    now: () => "2026-08-11T10:00:00.000Z",
  });

  const result = await repository.findActiveCategoryRecord("category-1", "en");

  assert.equal(result?.publishedStoryCount, 12);
  assert.deepEqual(calls(database.trace, "categories", "select"), [[CATEGORY_COLUMNS]]);
  assert.deepEqual(calls(database.trace, "categories", "eq").slice(0, 3), [
    ["id", "category-1"],
    ["language_id", "language-en"],
    ["is_active", true],
  ]);
  assert.deepEqual(calls(database.trace, "categories", "maybeSingle"), [[]]);
});

test("missing or failed language resolution fails closed before content lookup", async () => {
  const missing = fakeDatabase({ languages: [{ data: null, error: null }] });
  const missingRepository = createHomepagePickerRepository({
    createClient: missing.createClient,
    now: () => "2026-08-11T10:00:00.000Z",
  });
  await assert.rejects(
    () => missingRepository.searchStoryRecords({ locale: "en", query: "", page: 1, pageSize: 20 }),
    /language is unavailable/u,
  );
  assert.equal(missing.trace.some((entry) => entry.table === "stories"), false);

  const failed = fakeDatabase({ languages: [{ data: null, error: { message: "database unavailable" } }] });
  const failedRepository = createHomepagePickerRepository({
    createClient: failed.createClient,
    now: () => "2026-08-11T10:00:00.000Z",
  });
  await assert.rejects(
    () => failedRepository.searchCategoryRecords({ locale: "en", query: "", page: 1, pageSize: 20 }),
    /Unable to resolve/u,
  );
});
