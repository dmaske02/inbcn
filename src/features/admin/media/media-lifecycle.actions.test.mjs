import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./media.actions.ts", import.meta.url), "utf8");

test("typed lifecycle actions authenticate and validate canonical identifiers and stale tokens", () => {
  assert.match(source, /export async function retireMediaAction/u);
  assert.match(source, /export async function restoreMediaAction/u);
  assert.match(source, /requireAdminUser/u);
  assert.match(source, /z\.uuid\(\)/u);
  assert.match(source, /z\.iso\.datetime/u);
  assert.match(source, /expectedUpdatedAt/u);
  assert.doesNotMatch(source, /deletedBy/u);
});

test("lifecycle actions return sanitized states and revalidate only after success", () => {
  for (const status of ["success", "in-use", "conflict", "not-found", "forbidden", "error"]) {
    assert.match(source, new RegExp(`"${status}"`, "u"));
  }
  assert.match(source, /if \(!result\.ok\)[\s\S]*return lifecycleFailure/u);
  assert.match(source, /refreshMediaViews\(\)/u);
  for (const path of ["/admin/media", "/admin/stories", "/en", "/hi", "/mr"]) {
    assert.match(source, new RegExp(`revalidatePath\\("${path}"\\)`, "u"));
  }
});

test("hard-delete action and lifecycle Cloudinary calls are absent", () => {
  assert.doesNotMatch(source, /deleteMediaAction|removeMedia|changed=deleted|Cloudinary|destroyCloudinary/u);
});
