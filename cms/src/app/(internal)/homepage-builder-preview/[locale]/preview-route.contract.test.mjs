import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pagePath = "src/app/(internal)/homepage-builder-preview/[locale]/page.tsx";

test("preview route authenticates independently, validates locale and revision, and is non-indexable", async () => {
  const source = await readFile(pagePath, "utf8");
  assert.match(source, /requireAdminUser\(\)/u);
  assert.match(source, /HOMEPAGE_LOCALES/u);
  assert.match(source, /notFound\(\)/u);
  assert.match(source, /robots:\s*\{[^}]*index:\s*false[^}]*follow:\s*false/su);
  assert.match(source, /revision/u);
});

test("preview route accepts revision, refresh, and a selected section highlight", async () => {
  const source = await readFile(pagePath, "utf8");
  const fixedTemplate = await readFile("src/features/homepage-builder/homepage-fixed-template.model.ts", "utf8");
  assert.match(source, /"revision", "refresh", "selected"/u);
  assert.match(source, /const refresh = searchParams\.refresh/u);
  assert.match(source, /\^\\d\{1,10\}\$/u);
  assert.match(source, /renderHomepageEditorPreview\(locale, admin\)/u);
  assert.match(source, /selectedSectionId=\{selectedSectionId\}/u);
  assert.match(source, /isFixedHomepageSelectionId/u);
  assert.match(fixedTemplate, /fixed:public-header/u);
  assert.match(source, /homepage-preview-selection-/u);
  assert.doesNotMatch(source, /refresh[^\n]*(save|mutation|configuration)/iu);
});

test("preview route renders only the shared Homepage Builder renderer result outside the admin shell", async () => {
  const source = await readFile(pagePath, "utf8");
  assert.match(source, /renderHomepageEditorPreview/u);
  assert.match(source, /HomepageBuilderLayout/u);
  assert.match(source, /PublicLayout/u);
  assert.match(source, /getHomepageData/u);
  assert.match(source, /result\.kind === "error"/u);
  assert.doesNotMatch(source, /HomepageBuilderEditor|HomepageBuilderWorkspace|ProtectedAdminLayout/u);
  assert.doesNotMatch(source, /HOMEPAGE_BUILDER_ENABLED|homepageBuilder\.enabled|env\./u);
});

test("locale routing leaves the protected preview URL unprefixed", async () => {
  const proxy = await readFile("src/proxy.ts", "utf8");
  assert.match(proxy, /homepage-builder-preview/u);
  assert.match(proxy, /return sessionResponse/u);
});
