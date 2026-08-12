import assert from "node:assert/strict";
import test from "node:test";
import { parseHomepageSectionInput } from "./homepage-builder.validation.ts";

const base = { blockId: "lead", title: "Lead", blockType: "hero-story", renderer: "hero-story", container: "main", width: "full", enabled: true, startsAt: "", endsAt: "", configuration: '{"storyId":"11111111-1111-4111-8111-111111111111"}' };

test("section validation parses JSON and normalizes schedules", () => {
  assert.deepEqual(parseHomepageSectionInput(base), { ...base, startsAt: null, endsAt: null, configuration: { storyId: "11111111-1111-4111-8111-111111111111" } });
});

test("section validation rejects unknown blocks, mismatched renderers, malformed JSON, and schedules", () => {
  assert.throws(() => parseHomepageSectionInput({ ...base, blockType: "unknown" }), /Unsupported block type/u);
  assert.throws(() => parseHomepageSectionInput({ ...base, renderer: "wrong" }), /renderer/u);
  assert.throws(() => parseHomepageSectionInput({ ...base, configuration: "{" }), /JSON/u);
  assert.throws(() => parseHomepageSectionInput({ ...base, startsAt: "2026-08-12T10:00", endsAt: "2026-08-11T10:00" }), /after/u);
});
