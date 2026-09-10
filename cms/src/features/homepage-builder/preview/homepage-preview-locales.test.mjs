import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHomepageEditorPreviewService } from "./homepage-editor-preview.service.ts";
import { createHomepageRendererService } from "../../homepage-renderer/homepage-renderer.service-core.ts";

const admin = { id: "editor", role: "editor" };
for (const locale of ["hi", "en", "mr"]) {
  for (const failure of ["empty", "missing", "reference"]) {
    test(`${locale}: ${failure} configuration uses the same localized fallback as the public renderer`, async () => {
      const calls = [];
      const legacy = { all: [{ href: `/${locale}/story/local-story` }] };
      const render = createHomepageRendererService({
        loadLegacy: async (value) => { calls.push(["content", value]); return legacy; },
        loadConfiguration: async (value) => {
          calls.push(["configuration", value]);
          return failure === "missing" ? null : { configuration: { locale }, sections: [] };
        },
        composePreview: () => {
          if (failure === "reference") throw new Error("Configured category is outside the homepage feed");
          return { locale, sections: [] };
        },
        log: () => {},
      });
      const preview = createHomepageEditorPreviewService({ render: (value) => render(value, true), log: () => {} });
      assert.deepEqual(await preview(locale, admin), { kind: "legacy", locale, legacy });
      assert.deepEqual(calls, [["content", locale], ["configuration", locale]]);
    });
  }
}

test("locale navigation remounts the editor so persisted drafts and selection cannot cross languages", async () => {
  const route = await readFile(new URL("../../../app/admin/(protected)/homepage-builder/page.tsx", import.meta.url), "utf8");
  assert.match(route, /<HomepageBuilderWorkspace\s[^>]*key=\{view\.locale\}/u);
});

test("fallback uses the website homepage and keeps highlights tied to the selected section", async () => {
  const route = await readFile(new URL("../../../app/(internal)/homepage-builder-preview/[locale]/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../../../app/globals.css", import.meta.url), "utf8");
  assert.match(route, /website\/src\/features\/news\/components\/homepage/u);
  assert.match(route, /<Homepage locale=\{locale\} data=\{homepageData\}/u);
  assert.match(route, /data-homepage-fallback-selection=\{fallbackSelection\}/u);
  for (const type of ["hero-story", "breaking-news", "latest-news", "trending", "opinion", "category-section", "leaderboard", "mid-feed-ad"]) {
    assert.ok(styles.includes(`[data-homepage-fallback-selection="${type}"]`), type);
  }
});
