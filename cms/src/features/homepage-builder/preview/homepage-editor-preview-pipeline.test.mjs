import assert from "node:assert/strict";
import test from "node:test";

import { buildHomepagePreview } from "../homepage-builder.preview.ts";
import { prepareHomepageBuilder } from "../../homepage-renderer/homepage-renderer.service-core.ts";
import { parseHomepageRendererPayload } from "../../homepage-renderer/homepage-renderer.contract.ts";
import { resolveHomepageRendererPayload } from "../../homepage-renderer/homepage-renderer.references.ts";

const legacy = {
  all: [],
  featured: null,
  breaking: [],
  pinnedAlert: null,
  topHeadlines: [],
  latest: [],
  trending: [],
  categoryRails: [],
  editorPicks: [],
};

function section(overrides = {}) {
  return {
    id: "section-1",
    homepageConfigurationId: "configuration-1",
    blockId: "latest-en",
    title: "Latest News",
    blockType: "latest-news",
    renderer: "latest-news",
    position: 0,
    container: "main",
    width: "full",
    enabled: true,
    startsAt: null,
    endsAt: null,
    configuration: { limit: 4 },
    createdBy: "editor-1",
    updatedBy: "editor-1",
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
    ...overrides,
  };
}

function dependencies(sections) {
  return {
    loadLegacy: async () => legacy,
    loadConfiguration: async () => ({
      configuration: { id: "configuration-1", languageId: "language-en", locale: "en" },
      sections,
    }),
    composePreview(configuration, homepage) {
      return buildHomepagePreview(configuration.configuration.locale, configuration.sections, {
        stories: homepage.all.map((story) => ({
          id: story.id,
          languageId: configuration.configuration.languageId,
          title: story.title,
        })),
        categories: [],
        liveTv: { id: "live-tv-en", languageId: "language-en", title: "Live TV" },
      }, new Date("2026-08-12T00:00:00.000Z"));
    },
    resolvePayload: resolveHomepageRendererPayload,
    loadLiveTv: async () => ({ mode: "offline" }),
    validatePayload: parseHomepageRendererPayload,
    renderSection: (resolved) => `rendered:${resolved.id}`,
    log: () => {},
  };
}

test("the shared renderer preparation returns one all-or-nothing persisted preview", async () => {
  const result = await prepareHomepageBuilder("en", legacy, dependencies([section()]));
  assert.deepEqual(result.map((item) => item.node), ["rendered:section-1"]);
});

test("scheduling that leaves no active sections fails instead of producing a partial or legacy preview", async () => {
  await assert.rejects(
    prepareHomepageBuilder("en", legacy, dependencies([
      section({ startsAt: "2026-08-13T00:00:00.000Z" }),
    ])),
    (error) => error?.code === "EMPTY_CONFIGURATION",
  );
});

test("unresolved references and unsupported blocks fail through the shared renderer pipeline", async () => {
  await assert.rejects(
    prepareHomepageBuilder("en", legacy, dependencies([
      section({ blockType: "hero-story", renderer: "hero-story", configuration: { storyId: "missing" } }),
    ])),
    (error) => error?.code === "PREVIEW_FAILED",
  );
  await assert.rejects(
    prepareHomepageBuilder("en", legacy, dependencies([
      section({ blockType: "unsupported", renderer: "unsupported", configuration: {} }),
    ])),
    (error) => error?.code === "PREVIEW_FAILED",
  );
});
