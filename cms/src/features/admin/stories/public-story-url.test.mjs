import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const moduleUrl = new URL("./public-story-url.ts", import.meta.url);
const storyEditorUrl = new URL("./story-editor.tsx", import.meta.url);

test("public Story URLs use the configured Website origin and canonical localized route", async () => {
  const publicStoryUrl = await import(moduleUrl).catch(() => ({}));
  assert.equal(typeof publicStoryUrl.buildPublicStoryUrl, "function");

  const origin = "https://website.preview.example";
  const slug = "report-cf8c1635d42247809b3e1a01a62ee364";

  for (const locale of ["en", "hi", "mr"]) {
    assert.equal(
      publicStoryUrl.buildPublicStoryUrl(origin, locale, slug),
      `${origin}/${locale}/story/${slug}`,
    );
  }

  assert.doesNotMatch(
    publicStoryUrl.buildPublicStoryUrl(origin, "en", slug),
    /^https:\/\/cms\./u,
  );
});

test("Story Editor uses WEBSITE_URL only for published Story links", async () => {
  const source = await readFile(storyEditorUrl, "utf8");

  assert.match(source, /view\.story\?\.status === "published"/u);
  assert.match(source, /buildPublicStoryUrl\(env\.server\.websiteUrl/u);
  assert.doesNotMatch(source, /href=\{`\/\$\{[^}]+\}\/\$\{view\.story\.slug\}`\}/u);
});
