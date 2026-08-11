import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("legacy form actions are removed after final workspace integration", async () => {
  const source = await readFile("src/features/homepage-builder/homepage-builder.actions.ts", "utf8");
  for (const name of [
    "createHomepageSection",
    "updateHomepageSection",
    "deleteHomepageSectionLegacy",
    "moveSectionUp",
    "moveSectionDown",
    "toggleSection",
  ]) assert.doesNotMatch(source, new RegExp(`export async function ${name}`, "u"));
  assert.match(source, /requireAdminUser/u);
  assert.doesNotMatch(source, /FormData|redirect\(/u);
});

test("interactive actions are typed, authenticated, non-redirecting, and revalidate only after success", async () => {
  const source = await readFile("src/features/homepage-builder/homepage-builder.actions.ts", "utf8");
  for (const name of [
    "searchHomepageStories",
    "searchHomepageCategories",
    "createVisualHomepageSection",
    "saveVisualHomepageSection",
    "setVisualHomepageSectionEnabled",
    "moveHomepageSectionTo",
    "duplicateHomepageSection",
    "deleteHomepageSection",
  ]) {
    assert.match(source, new RegExp(`export async function ${name}`, "u"));
  }
  assert.match(source, /EditorActionResult/u);
  assert.match(source, /requireAdminUser/u);
  assert.match(source, /revalidatePath\(`\/\$\{locale\}`\)/u);
  assert.match(source, /const result = await work\(admin, parsed\.data\)/u);
  assert.match(source, /revalidateHomepageMutation\(\(parsed\.data as \{ locale: string \}\)\.locale\)/u);
  assert.match(source, /return \{ ok: true, data: result \}/u);
});

test("interactive transport schemas reject every client-controlled persistence field", async () => {
  const source = await readFile("src/features/homepage-builder/homepage-builder.actions.ts", "utf8");
  const interactiveSchemas = source.slice(source.indexOf("const localeSchema"), source.indexOf("function validationFailure"));
  assert.match(interactiveSchemas, /\.strict\(\)/u);
  for (const forbidden of ["renderer", "configurationId", "languageId", "blockId", "createdBy", "updatedBy", "created_by", "updated_by"]) {
    assert.doesNotMatch(interactiveSchemas, new RegExp(`\\b${forbidden}\\s*:`, "u"));
  }
  assert.match(source, /code: "VALIDATION"/u);
  assert.match(source, /code: "PERSISTENCE"/u);
  assert.match(source, /error instanceof HomepageBuilderError/u);
  assert.match(source, /error instanceof HomepageMutationConflictError/u);
  assert.match(source, /console\.error\("\[homepage-builder-action\]"/u);
  assert.doesNotMatch(source, /error\.stack/u);
});

test("Hero Sidebar transport accepts only one to three unique story ids", async () => {
  const source = await readFile("src/features/homepage-builder/homepage-builder.actions.ts", "utf8");
  assert.match(source, /blockType: z\.literal\("hero-sidebar"\)/u);
  assert.match(source, /storyIds: z\.array\(idSchema\)\.min\(1\)\.max\(3\)/u);
  assert.match(source, /Hero Sidebar stories must be unique/u);
});

test("the service derives internal ownership, renderer, block id, and audit values", async () => {
  const source = await readFile("src/features/homepage-builder/homepage-builder.service.ts", "utf8");
  assert.match(source, /randomUUID\(\)/u);
  assert.match(source, /getHomepageBlockDefinition/u);
  assert.match(source, /current\.blockId/u);
  assert.match(source, /current\.homepageConfigurationId !== configuration\.id/u);
  assert.match(source, /operations\.updateIfCurrent/u);
  assert.match(source, /operations\.setEnabledIfCurrent/u);
  assert.match(source, /moveVisualManagedHomepageSectionTo/u);
});

test("move action validates a complete expected order and revalidates only after success", async () => {
  const source = await readFile("src/features/homepage-builder/homepage-builder.actions.ts", "utf8");
  assert.match(source, /const moveVisualSchema/u);
  assert.match(source, /sectionId: idSchema/u);
  assert.match(source, /targetPosition: z\.number\(\)\.int\(\)\.nonnegative\(\)/u);
  assert.match(source, /expectedOrder: z\.array\(idSchema\)/u);
  assert.match(source, /export async function moveHomepageSectionTo/u);
  assert.match(source, /runHomepageMutation\("moveHomepageSectionTo"/u);
});

test("typed duplicate and delete actions require timestamp and complete expected order", async () => {
  const source = await readFile("src/features/homepage-builder/homepage-builder.actions.ts", "utf8");
  assert.match(source, /const structuralMutationSchema/u);
  assert.match(source, /expectedUpdatedAt: z\.iso\.datetime/u);
  assert.match(source, /expectedOrder: z\.array\(idSchema\)/u);
  assert.match(source, /export async function duplicateHomepageSection/u);
  assert.match(source, /export async function deleteHomepageSection\(inputValue: unknown\)/u);
  assert.match(source, /duplicateVisualManagedHomepageSection/u);
  assert.match(source, /deleteVisualManagedHomepageSection/u);
  assert.doesNotMatch(source, /export async function deleteHomepageSectionLegacy/u);
});
