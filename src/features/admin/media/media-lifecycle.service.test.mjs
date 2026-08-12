import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const service = await readFile(new URL("./media.service.ts", import.meta.url), "utf8");
const operations = await readFile(new URL("./media.operations.ts", import.meta.url), "utf8");

test("service exposes usage, retirement, and restoration through repository RPC boundaries", () => {
  assert.match(service, /getMediaLifecycleView/u);
  assert.match(service, /getMediaStoryUsages/u);
  assert.match(service, /export async function retireMedia/u);
  assert.match(service, /export async function restoreMedia/u);
  assert.match(service, /retireMediaRecord/u);
  assert.match(service, /restoreMediaRecord/u);
});

test("lifecycle results distinguish authoritative failure states and reject writers", () => {
  for (const code of ["NOT_FOUND", "IN_USE", "CONFLICT", "ALREADY_RETIRED", "FORBIDDEN"]) {
    assert.match(service, new RegExp(`"${code}"`, "u"));
  }
  assert.match(service, /if \(!canManageMedia\(admin\.role\)\) return \{ ok: false, code: "FORBIDDEN" \};/u);
});

test("retirement and restoration have no Cloudinary or hard-delete path", () => {
  assert.doesNotMatch(service, /removeMedia|deleteMedia/u);
  assert.doesNotMatch(operations, /async remove|countStoryReferences|repository\.delete/u);
  assert.match(operations, /destroy\(uploaded\.publicId\)/u);
  assert.match(operations, /destroy\(existing\.publicId\)/u);
});
