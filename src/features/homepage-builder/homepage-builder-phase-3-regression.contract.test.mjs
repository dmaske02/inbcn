import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the final workspace composes every Phase 3 workflow without developer persistence controls", async () => {
  const files = [
    "components/workspace/homepage-builder-workspace.tsx",
    "components/workspace/add-homepage-section-dialog.tsx",
    "components/workspace/homepage-preview-frame.tsx",
    "components/sections/section-list.tsx",
    "components/sections/sortable-section-card.tsx",
    "components/pickers/story-picker.tsx",
    "components/pickers/category-picker.tsx",
  ];
  const source = (await Promise.all(files.map((file) => readFile(`src/features/homepage-builder/${file}`, "utf8")))).join("\n");
  for (const expected of [
    "createVisualHomepageSection",
    "saveVisualHomepageSection",
    "moveHomepageSectionTo",
    "duplicateHomepageSection",
    "deleteHomepageSection",
    "HomepagePreviewFrame",
    "desktop",
    "tablet",
    "mobile",
    "StoryPicker",
    "CategoryPicker",
  ]) assert.match(source, new RegExp(expected, "u"));
  assert.doesNotMatch(source, /Configuration JSON|name="blockId"|name="renderer"|UUID field/iu);
});

test("the workspace keeps locale, permissions, preview, and public rendering boundaries isolated", async () => {
  const route = await readFile("src/app/admin/(protected)/homepage-builder/page.tsx", "utf8");
  const preview = await readFile("src/app/(internal)/homepage-builder-preview/[locale]/page.tsx", "utf8");
  const publicPage = await readFile("src/app/[locale]/page.tsx", "utf8");
  for (const locale of ["en", "hi", "mr"]) {
    assert.match(await readFile("src/features/homepage-builder/components/workspace/homepage-builder-toolbar.tsx", "utf8"), new RegExp(`"${locale}"`, "u"));
  }
  assert.match(route, /requireAdminUser/u);
  assert.match(preview, /requireAdminUser/u);
  assert.match(publicPage, /getRenderedHomepage/u);
  assert.doesNotMatch(publicPage, /HomepageBuilderWorkspace|createVisualHomepageSection/u);
});

test("final interactive flows preserve keyboard names, focus restoration, and live announcements", async () => {
  const addDialog = await readFile("src/features/homepage-builder/components/workspace/add-homepage-section-dialog.tsx", "utf8");
  const deleteDialog = await readFile("src/features/homepage-builder/components/sections/delete-section-dialog.tsx", "utf8");
  const ordering = await readFile("src/features/homepage-builder/components/sections/section-list.tsx", "utf8");
  const preview = await readFile("src/features/homepage-builder/components/workspace/homepage-preview-frame.tsx", "utf8");
  assert.match(addDialog, /DialogPrimitive\.Title/u);
  assert.match(addDialog, /DialogPrimitive\.Description/u);
  assert.match(addDialog, /onCloseAutoFocus/u);
  assert.match(addDialog, /triggerRef\.current\?\.focus/u);
  assert.match(deleteDialog, /onCloseAutoFocus/u);
  assert.match(ordering, /Press Space or Enter/u);
  assert.match(ordering, /Escape to cancel/u);
  assert.match(ordering, /aria-live="polite"/u);
  assert.match(preview, /aria-pressed/u);
  assert.match(preview, /title="Homepage visual preview"/u);
});
