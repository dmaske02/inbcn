import assert from "node:assert/strict";
import test from "node:test";

import { HomepageRendererError } from "../../homepage-renderer/homepage-renderer.model.ts";
import { createHomepageEditorPreviewService } from "./homepage-editor-preview.service.ts";

const admin = {
  id: "editor-1",
  email: "editor@example.com",
  displayName: "Editor",
  role: "editor",
  preferredLanguage: null,
};

test("a complete persisted configuration returns prepared renderer sections without a legacy branch", async () => {
  const sections = [{ id: "section-1", node: "rendered" }];
  const service = createHomepageEditorPreviewService({
    prepare: async () => sections,
    log: () => assert.fail("successful previews must not log a failure"),
  });

  const result = await service("en", admin);

  assert.deepEqual(result, { kind: "ready", locale: "en", sections });
  assert.equal("legacy" in result, false);
});

test("each preview request resolves persisted homepage content again", async () => {
  let request = 0;
  const service = createHomepageEditorPreviewService({
    prepare: async () => [{ id: `section-${++request}`, node: `rendered-${request}` }],
    log: () => assert.fail("successful previews must not log a failure"),
  });

  const first = await service("en", admin);
  const refreshed = await service("en", admin);

  assert.equal(first.kind, "ready");
  assert.equal(refreshed.kind, "ready");
  assert.equal(first.sections[0].node, "rendered-1");
  assert.equal(refreshed.sections[0].node, "rendered-2");
});

test("known renderer failures return an editor-safe error and log only sanitized diagnostics", async () => {
  const logs = [];
  const service = createHomepageEditorPreviewService({
    prepare: async () => {
      throw new HomepageRendererError(
        "REFERENCE_FAILED",
        "Reference failed\nsecret=never-show-this",
        { blockId: "hero-en", blockType: "hero-story" },
      );
    },
    log: (diagnostic) => logs.push(diagnostic),
  });

  const result = await service("en", admin);

  assert.deepEqual(result, {
    kind: "error",
    locale: "en",
    error: {
      code: "REFERENCE_FAILED",
      message: "The preview could not resolve all required homepage content.",
      blockType: "hero-story",
    },
  });
  assert.deepEqual(logs, [{
    locale: "en",
    code: "REFERENCE_FAILED",
    message: "Reference failed secret=[redacted]",
    blockId: "hero-en",
    blockType: "hero-story",
  }]);
  assert.equal(JSON.stringify(result).includes("never-show-this"), false);
  assert.equal(JSON.stringify(result).includes("hero-en"), false);
});

test("unexpected failures remain private and never fall back to the public legacy homepage", async () => {
  const logs = [];
  const service = createHomepageEditorPreviewService({
    prepare: async () => {
      throw new Error("database password=private");
    },
    log: (diagnostic) => logs.push(diagnostic),
  });

  const result = await service("mr", admin);

  assert.deepEqual(result, {
    kind: "error",
    locale: "mr",
    error: {
      code: "UNEXPECTED",
      message: "The homepage preview is temporarily unavailable.",
    },
  });
  assert.deepEqual(logs, [{
    locale: "mr",
    code: "UNEXPECTED",
    message: "Homepage Builder rendering failed.",
  }]);
});
