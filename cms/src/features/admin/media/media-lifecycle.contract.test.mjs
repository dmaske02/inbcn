import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(name, import.meta.url), "utf8");

test("usage list shows authoritative Story details without internal identifiers", async () => {
  const source = await read("./media-usage-list.tsx");
  assert.match(source, /Used by \{usages\.length\} \{usages\.length === 1 \? "Story" : "Stories"\}/u);
  assert.match(source, /usage\.title/u);
  assert.match(source, /usage\.status/u);
  assert.match(source, /usage\.languageCode/u);
  assert.match(source, /usage\.adminHref/u);
  assert.doesNotMatch(source, /storyId|mediaId|publicId|Cloudinary/u);
});

test("client-facing media views do not serialize provider or audit identifiers", async () => {
  const service = await read("./media.service.ts");
  const viewType = service.match(/export type MediaLibraryItemView = Readonly<\{([\s\S]*?)\n\}>;/u)?.[1] ?? "";
  const mapper = service.match(/function toView\([\s\S]*?\n\}/u)?.[0] ?? "";
  assert.doesNotMatch(viewType, /publicId|deletedBy/u);
  assert.doesNotMatch(mapper, /publicId:|deletedBy:/u);
});

test("lifecycle controls retire unused assets, protect used assets, and restore retired assets", async () => {
  const source = await read("./media-lifecycle-controls.tsx");
  assert.match(source, /Not currently used by a Story/u);
  assert.match(source, /Cannot retire this image while it is used by a Story/u);
  assert.match(source, /Retire image/u);
  assert.match(source, /Restore image/u);
  assert.match(source, /retireMediaAction/u);
  assert.match(source, /restoreMediaAction/u);
  assert.match(source, /expectedUpdatedAt/u);
  assert.match(source, /aria-live="polite"/u);
  assert.match(source, /window\.confirm/u);
  assert.doesNotMatch(source, /permanent deletion|deleteMedia|destroyCloudinary|Cloudinary/u);
});

test("library exposes an explicit retired filter and lifecycle state without changing picker queries", async () => {
  const [library, preview, service, repository] = await Promise.all([
    read("./media-library.tsx"), read("./media-preview-dialog.tsx"),
    read("./media.service.ts"), read("./media.repository.ts"),
  ]);
  assert.match(library, /name="lifecycle"/u);
  assert.match(library, /value="retired"/u);
  assert.match(library, /Retired/u);
  assert.match(preview, /MediaUsageList/u);
  assert.match(preview, /MediaLifecycleControls/u);
  assert.match(service, /const lifecycle = params\.lifecycle === "retired" \? "retired" : "active"/u);
  assert.match(repository, /query\.lifecycle === "retired"[\s\S]*?\.not\("deleted_at", "is", null\)/u);
});

test("dialogs retain Radix focus restoration and accessible lifecycle announcements", async () => {
  const [preview, controls] = await Promise.all([
    read("./media-preview-dialog.tsx"), read("./media-lifecycle-controls.tsx"),
  ]);
  assert.match(preview, /DialogPrimitive\.Trigger asChild/u);
  assert.match(preview, /DialogPrimitive\.Content/u);
  assert.match(controls, /role="status"/u);
  assert.match(controls, /focus-visible/u);
});
