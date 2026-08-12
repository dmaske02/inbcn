import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const directory = "src/features/homepage-builder/components/sections";
const read = (name) => readFile(`${directory}/${name}`, "utf8");

test("duplicate control has an accessible name and delegates one deliberate mutation", async () => {
  const source = await read("duplicate-section-button.tsx");
  assert.match(source, /aria-label=.*Duplicate/u);
  assert.match(source, /onDuplicate/u);
  assert.match(source, /type="button"/u);
});

test("delete dialog requires confirmation and restores trigger focus after Escape or cancellation", async () => {
  const source = await read("delete-section-dialog.tsx");
  assert.match(source, /DialogPrimitive\.Root/u);
  assert.match(source, /DialogPrimitive\.Trigger/u);
  assert.match(source, /DialogPrimitive\.Title/u);
  assert.match(source, /DialogPrimitive\.Description/u);
  assert.match(source, /DialogPrimitive\.Close/u);
  assert.match(source, /onCloseAutoFocus/u);
  assert.match(source, /triggerRef\.current\?\.focus\(\)/u);
  assert.match(source, /onCancel/u);
  assert.match(source, /onConfirm/u);
});

test("section list applies optimistic structural events, rollback, and announcements", async () => {
  const source = await read("section-list.tsx");
  assert.match(source, /duplicateHomepageSection/u);
  assert.match(source, /deleteHomepageSection/u);
  for (const event of [
    "duplicate-optimistic",
    "duplicate-succeeded",
    "delete-optimistic",
    "delete-succeeded",
    "structural-reverted",
  ]) assert.match(source, new RegExp(event, "u"));
  assert.match(source, /Section duplicated/u);
  assert.match(source, /Section deleted/u);
  assert.match(source, /Deletion cancelled/u);
  assert.match(source, /aria-live="polite"/u);
});
