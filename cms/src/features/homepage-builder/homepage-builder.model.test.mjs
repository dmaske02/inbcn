import assert from "node:assert/strict";
import test from "node:test";
import { canManageHomepageBuilder, isSectionActive, validatePositions } from "./homepage-builder.model.ts";

test("editors and admins manage while writers are read-only", () => {
  assert.equal(canManageHomepageBuilder("writer"), false);
  assert.equal(canManageHomepageBuilder("editor"), true);
  assert.equal(canManageHomepageBuilder("admin"), true);
});

test("schedule boundaries and contiguous positions are deterministic", () => {
  const now = new Date("2026-08-11T10:00:00Z");
  assert.equal(isSectionActive({ enabled: true, startsAt: "2026-08-11T10:00:00Z", endsAt: "2026-08-11T11:00:00Z" }, now), true);
  assert.equal(isSectionActive({ enabled: true, startsAt: null, endsAt: "2026-08-11T10:00:00Z" }, now), false);
  assert.doesNotThrow(() => validatePositions([{ position: 0 }, { position: 1 }]));
  assert.throws(() => validatePositions([{ position: 0 }, { position: 0 }]), /unique and contiguous/u);
});
