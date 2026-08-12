import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createHomepagePickerService } from "./homepage-picker.service.ts";

const storyRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  languageId: "language-en",
  title: "Monsoon response",
  publishedAt: "2026-08-11T08:00:00.000Z",
  category: { id: "category-1", name: "India" },
  featuredMedia: { url: "https://media.example/featured.jpg", altText: "Flood response", width: 1600, height: 900 },
  externalImage: { url: "https://images.example/external.jpg", width: 1200, height: 675 },
};
const categoryRecord = {
  id: "22222222-2222-4222-8222-222222222222",
  languageId: "language-en",
  name: "India",
  slug: "india",
  publishedStoryCount: 27,
};

function serviceFixture(overrides = {}) {
  const calls = [];
  let authentications = 0;
  const repository = {
    async searchStoryRecords(query) {
      calls.push(["searchStoryRecords", query]);
      return { records: [storyRecord], total: 41 };
    },
    async searchCategoryRecords(query) {
      calls.push(["searchCategoryRecords", query]);
      return { records: [categoryRecord], total: 21 };
    },
    async findPublishedStoryRecord(id, locale) {
      calls.push(["findPublishedStoryRecord", id, locale]);
      return id === storyRecord.id ? storyRecord : null;
    },
    async findActiveCategoryRecord(id, locale) {
      calls.push(["findActiveCategoryRecord", id, locale]);
      return id === categoryRecord.id ? categoryRecord : null;
    },
    ...overrides.repository,
  };
  const service = createHomepagePickerService({
    authenticate: overrides.authenticate ?? (async () => {
      authentications += 1;
      return { id: "editor-1", role: "editor" };
    }),
    repository,
  });
  return { service, calls, authentications: () => authentications };
}

test("story search authenticates, validates locale, normalizes query, and composes a picker page", async () => {
  const fixture = serviceFixture();

  const result = await fixture.service.searchStories({
    locale: " EN ",
    query: "  monsoon   response  ",
    page: 2,
  });

  assert.equal(fixture.authentications(), 1);
  assert.deepEqual(fixture.calls, [["searchStoryRecords", {
    locale: "en",
    query: "monsoon response",
    page: 2,
    pageSize: 20,
  }]]);
  assert.deepEqual(result, {
    items: [{
      id: storyRecord.id,
      title: "Monsoon response",
      publishedAt: "2026-08-11T08:00:00.000Z",
      category: { id: "category-1", name: "India" },
      thumbnail: { url: "https://media.example/featured.jpg", altText: "Flood response", width: 1600, height: 900 },
    }],
    total: 41,
    page: 2,
    pageSize: 20,
    totalPages: 3,
  });
});

test("story options use the existing external image when featured media is unavailable", async () => {
  const fixture = serviceFixture({
    repository: {
      async searchStoryRecords() {
        return { records: [{ ...storyRecord, featuredMedia: null }], total: 1 };
      },
    },
  });

  const result = await fixture.service.searchStories({ locale: "en", query: "", page: 1 });

  assert.deepEqual(result.items[0].thumbnail, {
    url: "https://images.example/external.jpg",
    altText: "Monsoon response",
    width: 1200,
    height: 675,
  });
});

test("category search authenticates and composes published story counts", async () => {
  const fixture = serviceFixture();

  const result = await fixture.service.searchCategories({ locale: "mr", query: "  महा  ", page: 1 });

  assert.equal(fixture.authentications(), 1);
  assert.deepEqual(fixture.calls, [["searchCategoryRecords", {
    locale: "mr",
    query: "महा",
    page: 1,
    pageSize: 20,
  }]]);
  assert.deepEqual(result, {
    items: [{ id: categoryRecord.id, name: "India", slug: "india", publishedStoryCount: 27 }],
    total: 21,
    page: 1,
    pageSize: 20,
    totalPages: 2,
  });
});

test("invalid locales, queries, and page bounds fail before repository access", async () => {
  for (const input of [
    { locale: "fr", query: "", page: 1 },
    { locale: "en", query: "", page: 0 },
    { locale: "en", query: "", page: 10_001 },
    { locale: "en", query: "", page: 1.5 },
    { locale: "en", query: "x".repeat(121), page: 1 },
  ]) {
    const fixture = serviceFixture();
    await assert.rejects(() => fixture.service.searchStories(input), /locale|page|120/u);
    assert.equal(fixture.authentications(), 1);
    assert.deepEqual(fixture.calls, []);
  }
});

test("authentication failure prevents all picker repository access", async () => {
  const fixture = serviceFixture({
    authenticate: async () => { throw new Error("Unauthenticated"); },
  });

  await assert.rejects(
    () => fixture.service.searchCategories({ locale: "en", query: "", page: 1 }),
    /Unauthenticated/u,
  );
  assert.deepEqual(fixture.calls, []);
});

test("targeted story validation succeeds independently of discovery pagination", async () => {
  const fixture = serviceFixture({
    repository: {
      async searchStoryRecords() {
        throw new Error("Discovery must not run during targeted validation");
      },
    },
  });

  const result = await fixture.service.findPublishedStoryForLocale(storyRecord.id, "en");

  assert.equal(result?.id, storyRecord.id);
  assert.deepEqual(fixture.calls, [["findPublishedStoryRecord", storyRecord.id, "en"]]);
  assert.equal(fixture.authentications(), 1);
});

test("targeted story and category validation reject malformed ids and return null for missing records", async () => {
  const fixture = serviceFixture();

  await assert.rejects(
    () => fixture.service.findPublishedStoryForLocale("not-a-uuid", "en"),
    /valid story/u,
  );
  await assert.rejects(
    () => fixture.service.findActiveCategoryForLocale("not-a-uuid", "en"),
    /valid category/u,
  );
  assert.equal(
    await fixture.service.findPublishedStoryForLocale("33333333-3333-4333-8333-333333333333", "en"),
    null,
  );
  assert.equal(
    await fixture.service.findActiveCategoryForLocale("44444444-4444-4444-8444-444444444444", "en"),
    null,
  );
});

test("targeted category validation authenticates, validates locale, and returns a minimal option", async () => {
  const fixture = serviceFixture();

  const result = await fixture.service.findActiveCategoryForLocale(categoryRecord.id, "HI");

  assert.deepEqual(result, { id: categoryRecord.id, name: "India", slug: "india", publishedStoryCount: 27 });
  assert.deepEqual(fixture.calls, [["findActiveCategoryRecord", categoryRecord.id, "hi"]]);
});

test("Homepage Builder mutations use targeted picker validation instead of the capped discovery collection", () => {
  const source = readFileSync(
    new URL("../homepage-builder.service.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /findPublishedStoryForLocale/u);
  assert.match(source, /findActiveCategoryForLocale/u);
  assert.doesNotMatch(
    source,
    /validateHomepageReferences\(parsed,\s*await references\(/u,
  );
});
