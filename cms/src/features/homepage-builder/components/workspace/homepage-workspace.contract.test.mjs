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

test("workspace delegates ordering to the sortable section list", async () => {
  const source = await read("homepage-builder-workspace.tsx");
  assert.match(source, /<SectionList/u);
  assert.match(source, /dispatch/u);
  assert.doesNotMatch(source, /moveSectionUp|moveSectionDown/u);
});

test("workspace exposes explicit visual creation and keeps writers read-only", async () => {
  const workspace = await read("homepage-builder-workspace.tsx");
  const toolbar = await read("homepage-builder-toolbar.tsx");
  const addDialog = await read("add-homepage-section-dialog.tsx");
  assert.match(workspace, /canManage/u);
  assert.match(workspace, /newSectionDraft/u);
  assert.match(workspace, /<AddHomepageSectionDialog/u);
  assert.match(workspace, /canManage \? \(/u);
  assert.match(toolbar, /HomepageBuilder editorial workspace/u);
  assert.match(addDialog, /createVisualHomepageSection/u);
  assert.match(addDialog, /validateHomepageEditorDraft/u);
  assert.match(addDialog, /getVisualBlockEditor/u);
  assert.match(addDialog, /Add section/u);
  assert.match(addDialog, /aria-live="polite"/u);
  assert.doesNotMatch(addDialog, /Configuration JSON|Block ID|UUID|renderer selector/iu);
});

test("all structural controls are permission-gated and read-only mode remains navigable", async () => {
  const workspace = await read("homepage-builder-workspace.tsx");
  const sectionList = await readFile("src/features/homepage-builder/components/sections/section-list.tsx", "utf8");
  const sectionCard = await readFile("src/features/homepage-builder/components/sections/sortable-section-card.tsx", "utf8");
  assert.match(workspace, /canManage=\{canManage\}/u);
  assert.match(workspace, /Read-only access/u);
  assert.match(sectionList, /canManage/u);
  assert.match(sectionCard, /canManage/u);
  assert.match(sectionCard, /\{canManage \? \(/u);
});
