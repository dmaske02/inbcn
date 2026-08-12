import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("Homepage Builder block contracts keep canonical media resolution indirect", async () => {
  const [registry, editorTypes, actions] = await Promise.all([
    read("src/features/homepage-builder/homepage-builder.registry.ts"),
    read("src/features/homepage-builder/editor/homepage-editor.types.ts"),
    read("src/features/homepage-builder/homepage-builder.actions.ts"),
  ]);

  for (const source of [registry, editorTypes, actions]) {
    for (const field of ["storyId", "storyIds", "categoryId", "label"]) {
      assert.match(source, new RegExp(`\\b${field}\\b`, "u"));
    }
    assert.doesNotMatch(source, /mediaId|mediaIds|imageUrl/u);
  }
});

test("visual editors retain their purpose-built selectors and expose no direct media picker", async () => {
  const [hero, sidebar, category, list, advertisement, liveTv, registry] = await Promise.all([
    read("src/features/homepage-builder/components/editors/hero-story-editor.tsx"),
    read("src/features/homepage-builder/components/editors/hero-sidebar-editor.tsx"),
    read("src/features/homepage-builder/components/editors/category-section-editor.tsx"),
    read("src/features/homepage-builder/components/editors/list-block-editor.tsx"),
    read("src/features/homepage-builder/components/editors/advertisement-editor.tsx"),
    read("src/features/homepage-builder/components/editors/live-tv-editor.tsx"),
    read("src/features/homepage-builder/components/editors/block-editor-registry.ts"),
  ]);

  assert.match(hero, /StoryPicker[\s\S]*?storyId: story\.id/u);
  assert.match(sidebar, /StoryPicker[\s\S]*?storyIds/u);
  assert.match(category, /CategoryPicker[\s\S]*?categoryId: category\.id/u);
  assert.match(list, /Story list/u);
  assert.match(advertisement, /Advertisement slot/u);
  assert.match(liveTv, /Zero configuration/u);
  assert.doesNotMatch([hero, sidebar, category, list, advertisement, liveTv, registry].join("\n"), /MediaPicker/u);
});

test("renderer resolves Story, category, Live TV, and advertisement paths without querying media", async () => {
  const [references, renderer, storyImage] = await Promise.all([
    read("src/features/homepage-renderer/homepage-renderer.references.ts"),
    read("src/features/homepage-renderer/components/homepage-block-renderers.tsx"),
    read("src/features/news/components/homepage-sections.tsx"),
  ]);

  assert.match(references, /configuration\.storyId/u);
  assert.match(references, /configuration\.storyIds/u);
  assert.match(references, /configuration\.categoryId/u);
  assert.match(references, /kind:"live-tv"/u);
  assert.match(references, /kind:"placeholder"/u);
  assert.doesNotMatch(`${references}\n${renderer}`, /media\.repository|MediaPicker|featured_media_id/u);
  assert.match(storyImage, /story\.image/u);
});

test("persisted preview, autosave, stale-response, and locale boundaries remain authoritative", async () => {
  const [previewFrame, previewService, autosave, reducer, service, actions] = await Promise.all([
    read("src/features/homepage-builder/components/workspace/homepage-preview-frame.tsx"),
    read("src/features/homepage-builder/preview/homepage-editor-preview.service.ts"),
    read("src/features/homepage-builder/editor/use-homepage-autosave.ts"),
    read("src/features/homepage-builder/editor/homepage-editor.reducer.ts"),
    read("src/features/homepage-builder/homepage-builder.service.ts"),
    read("src/features/homepage-builder/homepage-builder.actions.ts"),
  ]);

  assert.match(previewFrame, /Refresh Preview/u);
  assert.match(previewService, /preparePersistedHomepageBuilder/u);
  assert.doesNotMatch(previewFrame, /postMessage|JSON\.stringify\(.*draft/u);
  assert.match(autosave, /validationById/u);
  assert.match(reducer, /requestSequence !== event\.requestSequence/u);
  assert.match(reducer, /previewRevision: state\.previewRevision \+ 1/u);
  assert.match(service, /findPublishedStoryForLocale/u);
  assert.match(service, /findActiveCategoryForLocale/u);
  assert.match(actions, /requireAdminUser/u);
});

test("Media Library documents the Homepage Builder classification and future direct-media seam", async () => {
  const documentation = await read("docs/media-library.md");
  assert.match(documentation, /## Homepage Builder media compatibility/u);
  assert.match(documentation, /Hero Story[\s\S]*?`storyId`/u);
  assert.match(documentation, /Hero Sidebar[\s\S]*?`storyIds`/u);
  assert.match(documentation, /Category[\s\S]*?`categoryId`/u);
  assert.match(documentation, /Advertisement[\s\S]*?label/u);
  assert.match(documentation, /Live TV[\s\S]*?locale/u);
  assert.match(documentation, /future direct-media block[\s\S]*?MediaPicker/u);
  assert.match(documentation, /Milestone 8[\s\S]*?media_usages/u);
});
