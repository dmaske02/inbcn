import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const directory = "src/features/homepage-builder/components/workspace";
const read = (name) => readFile(`${directory}/${name}`, "utf8");

test("workspace composes the completed reducer, visual inspector, autosave, and guard", async () => {
  const source = await read("homepage-builder-workspace.tsx");
  assert.match(source, /useReducer\(homepageEditorReducer/u);
  assert.match(source, /useHomepageAutosave/u);
  assert.match(source, /useUnsavedChangesGuard/u);
  assert.match(source, /saveVisualHomepageSection/u);
  assert.match(source, /createVisualHomepageSection/u);
  assert.match(source, /isFixedHomepageSelectionId/u);
  assert.match(source, /persistHomepageSection/u);
  assert.match(source, /validateHomepageEditorDraft/u);
  assert.match(source, /<HomepageInspector/u);
});

test("inspector resolves the Milestone 4 registry and never bypasses its editors", async () => {
  const source = await read("homepage-inspector.tsx");
  assert.match(source, /getVisualBlockEditor/u);
  assert.match(source, /definition\.component/u);
  assert.doesNotMatch(source, /Configuration JSON|Block ID|renderer/iu);
});

test("toolbar exposes locale navigation while status remains persistent and accessible", async () => {
  const toolbar = await read("homepage-builder-toolbar.tsx");
  const status = await read("homepage-editor-status.tsx");
  assert.match(toolbar, /Homepage locale/u);
  for (const locale of ["en", "hi", "mr"]) assert.match(toolbar, new RegExp(`"${locale}"`, "u"));
  assert.match(status, /aria-live="polite"/u);
  assert.match(status, /Unsaved changes/u);
  assert.match(status, /Saving/u);
  assert.match(status, /Saved at/u);
  assert.match(status, /Save failed/u);
  assert.match(status, /Conflict/u);
  assert.doesNotMatch(status, /draftRevision/u);
});

test("workspace uses the fixed website structure instead of sortable composition", async () => {
  const source = await read("homepage-builder-workspace.tsx");
  assert.match(source, /<FixedHomepageSectionList/u);
  assert.doesNotMatch(source, /<SectionList|AddHomepageSectionDialog|newSectionDraft/u);
});

test("every configurable fixed slot resolves to its existing typed editor", async () => {
  const model = await readFile("src/features/homepage-builder/homepage-fixed-template.model.ts", "utf8");
  const inspector = await read("homepage-inspector.tsx");
  for (const type of [
    "hero-sidebar",
    "breaking-news",
    "latest-news",
    "trending",
    "opinion",
    "advertisement-placeholder",
    "category-section",
  ]) assert.match(model, new RegExp(`blockType: "${type}"`, "u"));
  assert.match(inspector, /getVisualBlockEditor\(draft\.blockType\)/u);
  assert.match(inspector, /selectionLabel/u);
  assert.match(model, /Fixed site chrome/u);
});

test("workspace presents the approved three-panel editorial layout", async () => {
  const source = await read("homepage-builder-workspace.tsx");
  assert.match(source, /xl:grid-cols-\[17\.5rem_minmax\(0,1fr\)_22rem\]/u);
  assert.match(source, /aria-label="Sections navigator"/u);
  assert.match(source, /aria-label="Homepage canvas"/u);
  assert.match(source, /aria-label="Properties inspector"/u);
  assert.match(source, /<FixedHomepageSectionList/u);
  assert.match(source, /<HomepagePreviewFrame/u);
  assert.match(source, /<HomepageInspector/u);
});

test("canvas stays primary while responsive controls open sections and properties", async () => {
  const source = await read("homepage-builder-workspace.tsx");
  assert.match(source, /useState<"sections" \| "properties" \| null>\(null\)/u);
  assert.match(source, /Open sections navigator/u);
  assert.match(source, /Open properties inspector/u);
  assert.match(source, /Close sections navigator/u);
  assert.match(source, /Close properties inspector/u);
  assert.match(source, /xl:hidden/u);
});

test("toolbar follows the approved Hindi-first locale order", async () => {
  const toolbar = await read("homepage-builder-toolbar.tsx");
  assert.match(toolbar, /const LOCALES = \["hi", "en", "mr"\]/u);
});

test("fixed structure hides arbitrary add, duplicate, delete, and reorder controls", async () => {
  const workspace = await read("homepage-builder-workspace.tsx");
  const toolbar = await read("homepage-builder-toolbar.tsx");
  const fixedList = await readFile("src/features/homepage-builder/components/sections/fixed-homepage-section-list.tsx", "utf8");
  assert.match(toolbar, /HomepageBuilder editorial workspace/u);
  assert.doesNotMatch(workspace + toolbar + fixedList, /Add section|Move |Duplicate section|Delete section/u);
  assert.doesNotMatch(fixedList, /DndContext|useSortable|moveHomepageSectionTo/u);
});

test("fixed section selection remains permission-neutral and read-only mode remains navigable", async () => {
  const workspace = await read("homepage-builder-workspace.tsx");
  const fixedList = await readFile("src/features/homepage-builder/components/sections/fixed-homepage-section-list.tsx", "utf8");
  assert.match(workspace, /Read-only access/u);
  assert.match(fixedList, /onSelect/u);
  assert.match(fixedList, /aria-pressed/u);
  assert.doesNotMatch(fixedList, /disabled=\{!item\.draft\}/u);
  assert.match(fixedList, /onSelect\(item\.selectionId\)/u);
  assert.match(workspace, /selectedItem/u);
  assert.match(workspace, /selectionLabel=\{selectedItem\?\.label/u);
});

test("selected section is forwarded to the real homepage canvas", async () => {
  const workspace = await read("homepage-builder-workspace.tsx");
  assert.match(workspace, /selectedSectionId=\{selectedId\}/u);
});

test("workspace derives all visible story-slot usages for picker status text", async () => {
  const workspace = await read("homepage-builder-workspace.tsx");
  const inspector = await read("homepage-inspector.tsx");
  assert.match(workspace, /storyUsageById/u);
  assert.match(workspace, /push\("Hero Story"\)/u);
  assert.match(workspace, /push\(`Secondary Story \$\{index \+ 1\}`\)/u);
  assert.match(workspace, /storyUsageById=\{storyUsageById\}/u);
  assert.match(inspector, /storyUsageById=\{storyUsageById\}/u);
});

test("fixed layout properties are not exposed as editable controls", async () => {
  const fields = await readFile("src/features/homepage-builder/components/editors/shared-section-fields.tsx", "utf8");
  assert.doesNotMatch(fields, /\n\s+Container\r?\n/u);
  assert.doesNotMatch(fields, /\n\s+Width\r?\n/u);
  assert.match(fields, /Section title/u);
  assert.match(fields, /Enabled on the homepage/u);
  assert.match(fields, /Starts at/u);
  assert.match(fields, /Ends at/u);
});
