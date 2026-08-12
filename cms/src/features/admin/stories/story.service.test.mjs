import assert from "node:assert/strict";
import test from "node:test";

import { validateFeaturedMediaChange } from "./story-featured-media-policy.ts";

const admin = { id: "admin-1", role: "admin" };
const writer = { id: "writer-1", role: "writer" };
const mediaId = "33333333-3333-4333-8333-333333333333";
const replacementId = "44444444-4444-4444-8444-444444444444";

test("accepts active featured media and supports removal and replacement", async () => {
  const checked = [];
  const selectable = async (_admin, id) => { checked.push(id); return true; };

  assert.deepEqual(await validateFeaturedMediaChange(admin, mediaId, null, selectable), { ok: true });
  assert.deepEqual(await validateFeaturedMediaChange(admin, null, mediaId, selectable), { ok: true });
  assert.deepEqual(await validateFeaturedMediaChange(admin, replacementId, mediaId, selectable), { ok: true });

  assert.deepEqual(checked, [mediaId, replacementId]);
});

test("rejects nonexistent or retired featured media", async () => {
  for (const unavailable of ["nonexistent", "retired"]) {
    assert.deepEqual(
      await validateFeaturedMediaChange(admin, mediaId, null, async () => false),
      { ok: false, code: "UNAVAILABLE" },
      unavailable,
    );
  }
});

test("writers cannot forge, remove, or replace featured media", async () => {
  let selectionChecks = 0;
  const selectable = async () => { selectionChecks += 1; return true; };

  assert.deepEqual(await validateFeaturedMediaChange(writer, mediaId, mediaId, selectable), { ok: true });
  for (const requested of [null, replacementId]) {
    assert.deepEqual(
      await validateFeaturedMediaChange(writer, requested, mediaId, selectable),
      { ok: false, code: "FORBIDDEN" },
    );
  }
  assert.equal(selectionChecks, 0);
});
