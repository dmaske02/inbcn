import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actions = await readFile(new URL("./media.actions.ts", import.meta.url), "utf8");
const service = await readFile(new URL("./media.service.ts", import.meta.url), "utf8");
const editor = await readFile(new URL("./media-metadata-editor.tsx", import.meta.url), "utf8").catch(() => "");
const preview = await readFile(new URL("./media-preview-dialog.tsx", import.meta.url), "utf8");

test("metadata service authorizes, validates, detects stale edits, and updates through the narrow repository method", () => {
  assert.match(service, /updateMediaMetadata/u);
  assert.match(service, /requireMediaManager\(admin\)/u);
  assert.match(service, /normalizeMediaMetadataUpdate/u);
  assert.match(service, /expectedUpdatedAt/u);
  assert.match(service, /"CONFLICT"/u);
  assert.match(service, /updateMediaMetadataRecord/u);
});

test("metadata action authenticates, sanitizes failures, and revalidates only after success", () => {
  assert.match(actions, /updateMediaMetadataAction/u);
  assert.match(actions, /requireAdminUser\(\)/u);
  assert.match(actions, /await updateMediaMetadata/u);
  assert.match(actions, /revalidatePath\("\/admin\/media"\)/u);
  assert.match(actions, /Unable to update media\. Try again\./u);
});

test("metadata editor renders approved fields and accessible save states", () => {
  for (const name of ["title", "originalFilename", "altText", "caption", "credit"]) assert.match(editor, new RegExp(`name="${name}"`, "u"));
  assert.match(editor, /Describe the image for users who cannot see it\./u);
  assert.match(editor, /aria-live="polite"/u);
  assert.match(editor, /Saving/u);
  assert.match(editor, /Saved/u);
});

test("metadata editor protects dirty state across close, Escape, and navigation", () => {
  assert.match(editor, /beforeunload/u);
  assert.match(preview, /onEscapeKeyDown/u);
  assert.match(preview, /onInteractOutside/u);
  assert.match(preview, /confirmDiscard/u);
  assert.match(editor, /sm:grid-cols-2/u);
});
