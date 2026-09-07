import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("protected admin route renders the lean Phase 3 workspace and navigation exposes Homepage Builder", async () => {
  const page = await readFile("src/app/admin/(protected)/homepage-builder/page.tsx", "utf8");
  const layout = await readFile("src/app/admin/(protected)/layout.tsx", "utf8");
  assert.match(page, /requireAdminUser/u);
  assert.match(page, /getHomepageEditorWorkspaceView/u);
  assert.match(page, /<HomepageBuilderWorkspace/u);
  assert.match(page, /canManage=\{view\.canManage\}/u);
  assert.doesNotMatch(page, /HomepageBuilderEditor|HomepageSectionForm|HomepageSectionList/u);
  assert.match(layout, /\/admin\/homepage-builder/u);
});

test("Homepage Builder defaults to Hindi while preserving explicit locale selection", async () => {
  const page = await readFile("src/app/admin/(protected)/homepage-builder/page.tsx", "utf8");
  const toolbar = await readFile("src/features/homepage-builder/components/workspace/homepage-builder-toolbar.tsx", "utf8");

  assert.match(page, /const locale = Array\.isArray\(params\.locale\) \? params\.locale\[0\] : params\.locale;/u);
  assert.match(page, /getHomepageEditorWorkspaceView\(admin, locale \?\? "hi"\)/u);
  for (const locale of ["en", "hi", "mr"]) {
    assert.match(toolbar, new RegExp(`locale=\\$\\{item\\}`, "u"));
    assert.match(toolbar, new RegExp(`"${locale}"`, "u"));
  }
});

test("workspace components reuse the design system and never query Supabase", async () => {
  for (const file of [
    "workspace/homepage-builder-workspace.tsx",
    "workspace/add-homepage-section-dialog.tsx",
    "workspace/homepage-preview-frame.tsx",
  ]) {
    const source = await readFile(`src/features/homepage-builder/components/${file}`, "utf8");
    assert.match(source, /@\/components\/ui\//u); assert.doesNotMatch(source, /supabase/u);
  }
});

test("legacy developer-oriented editor components are removed", async () => {
  for (const file of [
    "homepage-builder-editor.tsx",
    "homepage-section-form.tsx",
    "homepage-section-list.tsx",
    "homepage-preview-data.tsx",
  ]) {
    await assert.rejects(
      readFile(`src/features/homepage-builder/components/${file}`, "utf8"),
      (error) => error?.code === "ENOENT",
    );
  }
});
