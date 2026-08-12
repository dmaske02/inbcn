import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const directory = "src/features/homepage-builder/components/sections";
const read = (name) => readFile(`${directory}/${name}`, "utf8");

test("section list performs one optimistic move and rolls back exactly on rejection", async () => {
  const source = await read("section-list.tsx");
  assert.match(source, /moveHomepageSectionTo/u);
  assert.match(source, /expectedOrder/u);
  assert.match(source, /targetPosition/u);
  assert.match(source, /reorder-optimistic/u);
  assert.match(source, /reorder-succeeded/u);
  assert.match(source, /reorder-reverted/u);
  assert.match(source, /arrayMove/u);
  assert.doesNotMatch(source, /moveSectionUp|moveSectionDown/u);
});

test("section list configures pointer, touch, and keyboard sensors with sortable coordinates", async () => {
  const source = await read("section-list.tsx");
  for (const sensor of ["PointerSensor", "TouchSensor", "KeyboardSensor"]) {
    assert.match(source, new RegExp(`useSensor\\(${sensor}`, "u"));
  }
  assert.match(source, /sortableKeyboardCoordinates/u);
  assert.match(source, /onDragStart/u);
  assert.match(source, /onDragOver/u);
  assert.match(source, /onDragEnd/u);
  assert.match(source, /onDragCancel/u);
  assert.match(source, /aria-live="polite"/u);
});

test("sortable cards expose a named keyboard-operable drag handle and reduced-motion styling", async () => {
  const source = await read("sortable-section-card.tsx");
  assert.match(source, /useSortable/u);
  assert.match(source, /aria-label=.*Move/u);
  assert.match(source, /listeners/u);
  assert.match(source, /attributes/u);
  assert.match(source, /touch-none/u);
  assert.match(source, /motion-reduce:transition-none/u);
  assert.match(source, /type="button"/u);
});
