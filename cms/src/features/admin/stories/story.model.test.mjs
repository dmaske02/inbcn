import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canCreateStory,
  generateStorySlug,
  getAllowedStoryCommands,
  parseStoryUpdateForm,
  resolveEditableStoryType,
  storyUpdateSubmissionSchema,
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
    featuredMediaId: "",
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
  assert.deepEqual(getAllowedStoryCommands("editor", "draft", false, true), ["save", "approve", "reject"]);
  assert.deepEqual(getAllowedStoryCommands("editor", "draft", false, false), []);
  assert.deepEqual(getAllowedStoryCommands("editor", "approved", false), ["publish", "schedule", "archive"]);
  assert.deepEqual(getAllowedStoryCommands("editor", "scheduled", false), ["publish", "archive"]);
  assert.deepEqual(getAllowedStoryCommands("admin", "scheduled", true), ["save", "publish", "archive", "delete"]);
  assert.deepEqual(getAllowedStoryCommands("admin", "draft", true), ["save", "submit", "approve", "reject", "publish", "schedule", "archive", "delete"]);
});

test("legacy citizen reports retain ordinary CMS edit and archive commands", () => {
  assert.deepEqual(
    getAllowedStoryCommands("writer", "draft", true, false, false),
    ["save", "submit"],
  );
  assert.deepEqual(
    getAllowedStoryCommands("editor", "pending_review", false, false, false),
    ["save", "approve"],
  );
  assert.deepEqual(
    getAllowedStoryCommands("admin", "approved", false, false, false),
    ["save", "publish", "schedule", "archive", "delete"],
  );
  assert.deepEqual(
    getAllowedStoryCommands("admin", "archived", false, false, false),
    ["delete"],
  );
});

test("explicit reporter submissions retain review transitions but cannot be silently saved", async () => {
  assert.deepEqual(
    getAllowedStoryCommands("editor", "pending_review", false, false, true),
    ["request_changes", "approve", "reject", "publish", "schedule"],
  );
  assert.deepEqual(
    getAllowedStoryCommands("admin", "pending_review", false, false, true),
    ["request_changes", "approve", "reject", "publish", "schedule"],
  );
  assert.deepEqual(
    getAllowedStoryCommands("admin", "approved", false, false, true),
    ["publish", "schedule", "archive"],
  );
  assert.deepEqual(getAllowedStoryCommands("admin", "draft", false, false, true), []);
  assert.deepEqual(
    getAllowedStoryCommands("admin", "rejected", false, false, true),
    ["archive"],
  );
  assert.deepEqual(getAllowedStoryCommands("admin", "archived", false, false, true), []);

  const [service, repository, dto, databaseTypes] = await Promise.all([
    readFile(new URL("./story.service.ts", import.meta.url), "utf8"),
    readFile(new URL("../../news/server/stories.repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../../news/server/dto.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../../../packages/database/src/database.types.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(service, /story\.type === "citizen_report"/u);
  assert.match(
    service,
    /export async function saveStory[\s\S]*?story\.isReporterStory[\s\S]*?\.includes\("save"\)/u,
  );
  assert.match(
    service,
    /export async function runStoryCommand[\s\S]*?story\.isReporterStory/u,
  );
  assert.match(repository, /CMS_STORY_COLUMNS[\s\S]*is_reporter_story/u);
  assert.match(repository, /isReporterStory: row\.is_reporter_story/u);
  assert.match(dto, /isReporterStory: boolean/u);
  assert.match(databaseTypes, /stories: \{[\s\S]*?Row: \{[\s\S]*?is_reporter_story: boolean/u);
  assert.match(databaseTypes, /is_reporter_story: \{[\s\S]*Args: \{ "": Database\["public"\]\["Tables"\]\["stories"\]\["Row"\] \}[\s\S]*Returns: boolean/u);
});

const validStoryForm = {
  title: "A production headline",
  slug: "a-production-headline",
  summary: "A concise but complete summary.",
  content: "A complete story body suitable for saving as a draft.",
  languageId: "11111111-1111-4111-8111-111111111111",
  categoryId: "22222222-2222-4222-8222-222222222222",
  sourceId: "",
  featuredMediaId: "",
  tags: "india, technology",
  seoTitle: "",
  seoDescription: "",
  canonicalUrl: "",
  scheduledAt: "",
  isFeatured: false,
  isBreaking: false,
};

test("preserves an exact legacy summary while unrelated featured media changes", () => {
  const legacySummary = "x".repeat(2_489);
  const featuredMediaId = "33333333-3333-4333-8333-333333333333";

  const result = parseStoryUpdateForm(
    { ...validStoryForm, summary: legacySummary, featuredMediaId },
    legacySummary,
  );

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.summary, legacySummary);
  assert.equal(result.data.featuredMediaId, featuredMediaId);
});

test("rejects a one-character modification to an oversized legacy summary", () => {
  const legacySummary = "x".repeat(2_489);
  assert.equal(
    parseStoryUpdateForm(
      { ...validStoryForm, summary: `${legacySummary}!` },
      legacySummary,
    ).success,
    false,
  );
});

test("keeps the one-thousand-character authoring limit for creation and valid-story edits", () => {
  const oversized = "x".repeat(1_001);
  assert.equal(storyFormSchema.safeParse({ ...validStoryForm, summary: oversized }).success, false);
  assert.equal(
    parseStoryUpdateForm({ ...validStoryForm, summary: oversized }, validStoryForm.summary).success,
    false,
  );
});

test("allows exact legacy summaries through action submission but not final update validation", () => {
  const legacySummary = "x".repeat(2_489);
  assert.equal(storyUpdateSubmissionSchema.safeParse({ ...validStoryForm, summary: legacySummary }).success, true);
  assert.equal(parseStoryUpdateForm({ ...validStoryForm, summary: legacySummary }, legacySummary).success, true);
  assert.equal(parseStoryUpdateForm({ ...validStoryForm, summary: `${legacySummary} ` }, legacySummary).success, false);
});

test("preserves persisted legacy bytes when textarea line endings are normalized", () => {
  const persisted = `${"x".repeat(1_100)}\r\nSecond paragraph`;
  const submitted = persisted.replace("\r\n", "\n");
  const result = parseStoryUpdateForm({ ...validStoryForm, summary: submitted }, persisted);

  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.summary, persisted);
});

test("preserves legacy summaries while featured media is removed or replaced", () => {
  const legacySummary = "x".repeat(2_489);
  const replacementId = "44444444-4444-4444-8444-444444444444";
  const removed = parseStoryUpdateForm({ ...validStoryForm, summary: legacySummary, featuredMediaId: "" }, legacySummary);
  const replaced = parseStoryUpdateForm({ ...validStoryForm, summary: legacySummary, featuredMediaId: replacementId }, legacySummary);

  assert.equal(removed.success, true);
  assert.equal(replaced.success, true);
  if (removed.success) assert.equal(removed.data.featuredMediaId, "");
  if (replaced.success) assert.equal(replaced.data.featuredMediaId, replacementId);
});

test("does not bypass validation for other fields on legacy-summary updates", () => {
  const legacySummary = "x".repeat(2_489);
  assert.equal(
    parseStoryUpdateForm({ ...validStoryForm, summary: legacySummary, featuredMediaId: "not-a-uuid" }, legacySummary).success,
    false,
  );
  assert.equal(
    parseStoryUpdateForm({ ...validStoryForm, summary: legacySummary, title: "" }, legacySummary).success,
    false,
  );
});

test("update compatibility is authoritative in the service while creation stays strict", async () => {
  const [actions, service] = await Promise.all([
    readFile(new URL("./story.actions.ts", import.meta.url), "utf8"),
    readFile(new URL("./story.service.ts", import.meta.url), "utf8"),
  ]);
  const createAction = actions.match(/export async function createStoryAction[\s\S]*?\n\}/u)?.[0] ?? "";
  const saveAction = actions.match(/export async function saveStoryAction[\s\S]*?\n\}/u)?.[0] ?? "";
  const createService = service.match(/export async function createStory[\s\S]*?\n\}/u)?.[0] ?? "";
  const saveService = service.match(/export async function saveStory[\s\S]*?\n\}/u)?.[0] ?? "";

  assert.match(createAction, /validateForm\(formData\)/u);
  assert.doesNotMatch(createAction, /storyUpdateSubmissionSchema/u);
  assert.match(saveAction, /validateForm\(formData, storyUpdateSubmissionSchema\)/u);
  assert.match(createService, /parseValues\(input\)/u);
  assert.match(saveService, /getCmsStoryById[\s\S]*parseUpdateValues\(input, story\.summary\)/u);
  assert.match(saveService, /assertFeaturedMediaSelection[\s\S]*updateCmsStory/u);
});

test("preserves imported story provenance during editorial edits", () => {
  assert.equal(resolveEditableStoryType(null), "staff_article");
  assert.equal(resolveEditableStoryType("staff_article"), "staff_article");
  assert.equal(resolveEditableStoryType("external_article"), "external_article");
  assert.equal(resolveEditableStoryType("citizen_report"), "citizen_report");
});
