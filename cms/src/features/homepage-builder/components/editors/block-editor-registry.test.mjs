import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { HOMEPAGE_BLOCK_REGISTRY } from "../../homepage-builder.registry.ts";

test("visual editor registry has exactly one editor for every persisted block type", async () => {
  const source = await readFile("src/features/homepage-builder/components/editors/block-editor-registry.ts", "utf8");
  const expected = HOMEPAGE_BLOCK_REGISTRY.map((definition) => definition.id).toSorted();
  const registered = [...source.matchAll(/^\s*"([a-z-]+)": \{/gmu)].map((match) => match[1]).toSorted();

  assert.deepEqual(registered, expected);
  assert.equal(new Set(registered).size, 11);
  assert.match(source, /VISUAL_BLOCK_EDITOR_REGISTRY/u);
  assert.match(source, /BlockEditorProps/u);
});
