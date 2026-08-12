import assert from "node:assert/strict";
import test from "node:test";
import { HOMEPAGE_BLOCK_REGISTRY, getHomepageBlockDefinition } from "./homepage-builder.registry.ts";

test("registry exposes every approved extensible block contract", () => {
  assert.deepEqual(HOMEPAGE_BLOCK_REGISTRY.map((item) => item.id), ["hero-story", "hero-sidebar", "breaking-news", "live-tv", "latest-news", "category-section", "trending", "opinion", "advertisement-placeholder", "custom-html-placeholder", "future-placeholder"]);
  for (const item of HOMEPAGE_BLOCK_REGISTRY) {
    assert.equal(typeof item.renderer, "string");
    assert.equal(typeof item.validate, "function");
    assert.ok(item.schema);
    assert.ok(item.defaults);
  }
  assert.equal(getHomepageBlockDefinition("unknown"), null);
});

test("registry validates story, category, list, and placeholder configurations", () => {
  assert.equal(getHomepageBlockDefinition("hero-story").validate({ storyId: "11111111-1111-4111-8111-111111111111" }).success, true);
  assert.equal(getHomepageBlockDefinition("category-section").validate({ categoryId: "bad" }).success, false);
  assert.equal(getHomepageBlockDefinition("latest-news").validate({ limit: 101 }).success, false);
  assert.equal(getHomepageBlockDefinition("live-tv").validate({}).success, true);
});

test("Hero Sidebar persists only one to three unique story ids", () => {
  const definition = getHomepageBlockDefinition("hero-sidebar");
  const first = "11111111-1111-4111-8111-111111111111";
  const second = "22222222-2222-4222-8222-222222222222";
  const third = "33333333-3333-4333-8333-333333333333";

  assert.equal(definition.renderer, "hero-sidebar");
  assert.equal(definition.validate({ storyIds: [first] }).success, true);
  assert.equal(definition.validate({ storyIds: [first, second, third] }).success, true);
  assert.equal(definition.validate({ storyIds: [] }).success, false);
  assert.equal(definition.validate({ storyIds: [first, first] }).success, false);
  assert.equal(definition.validate({ storyIds: [first, second, third, "44444444-4444-4444-8444-444444444444"] }).success, false);
  assert.equal(definition.validate({ storyIds: ["bad"] }).success, false);
  assert.equal(definition.validate({ storyIds: [first], renderer: "hero-sidebar" }).success, false);
});
