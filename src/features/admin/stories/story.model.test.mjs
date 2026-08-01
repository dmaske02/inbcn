import assert from "node:assert/strict";
import test from "node:test";

import {
  canCreateStory,
  generateStorySlug,
  getAllowedStoryCommands,
  storyFormSchema,
} from "./story.model.ts";
import { calculateReadTime } from "../../news/server/services/story-reader.model.ts";

test("generates normalized ASCII slugs from editorial headlines", () => {
  assert.equal(generateStorySlug("  India's New Tech Future!  "), "indias-new-tech-future");
  assert.equal(generateStorySlug("Markets—Live: 2026"), "markets-live-2026");
  assert.equal(generateStorySlug("हिंदी समाचार"), "story");
});

test("calculates reading time at 200 words per minute and rounds up", () => {
  assert.equal(calculateReadTime(""), 0);
  assert.equal(calculateReadTime("one two three"), 1);
  assert.equal(calculateReadTime(Array.from({ length: 201 }, (_, index) => `w${index}`).join(" ")), 2);
});

test("validates schema-backed story form values", () => {
  const valid = {
    title: "A production headline",
    slug: "a-production-headline",
    summary: "A concise but complete summary.",
    content: "A complete story body suitable for saving as a draft.",
    languageId: "11111111-1111-4111-8111-111111111111",
    categoryId: "22222222-2222-4222-8222-222222222222",
    sourceId: "",
    tags: "india, technology",
    seoTitle: "",
    seoDescription: "",
    canonicalUrl: "",
    scheduledAt: "",
    isFeatured: false,
    isBreaking: false,
  };

  assert.equal(storyFormSchema.safeParse(valid).success, true);
  assert.equal(storyFormSchema.safeParse({ ...valid, slug: "Invalid Slug" }).success, false);
  assert.equal(storyFormSchema.safeParse({ ...valid, canonicalUrl: "not-a-url" }).success, false);
});

test("exposes only commands allowed by role, ownership, and status", () => {
  assert.equal(canCreateStory("writer"), true);
  assert.equal(canCreateStory("editor"), false);
  assert.equal(canCreateStory("admin"), true);

  assert.deepEqual(getAllowedStoryCommands("writer", "draft", true), ["save", "submit"]);
  assert.deepEqual(getAllowedStoryCommands("writer", "draft", false), []);
  assert.deepEqual(getAllowedStoryCommands("editor", "pending_review", false), ["save", "approve"]);
  assert.deepEqual(getAllowedStoryCommands("editor", "approved", false), ["publish", "schedule", "archive"]);
  assert.deepEqual(getAllowedStoryCommands("editor", "scheduled", false), ["publish", "archive"]);
  assert.deepEqual(getAllowedStoryCommands("admin", "scheduled", true), ["save", "publish", "archive", "delete"]);
  assert.deepEqual(getAllowedStoryCommands("admin", "draft", true), ["save", "submit", "approve", "publish", "schedule", "archive", "delete"]);
});
