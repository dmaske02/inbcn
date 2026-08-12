import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const form = await readFile(new URL("./story-form.tsx", import.meta.url), "utf8");
const field = await readFile(new URL("./story-featured-media-field.tsx", import.meta.url), "utf8").catch(() => "");
const service = await readFile(new URL("./story.service.ts", import.meta.url), "utf8");
const mediaPolicy = await readFile(new URL("./story-featured-media-policy.ts", import.meta.url), "utf8");
const model = await readFile(new URL("./story.model.ts", import.meta.url), "utf8");
const repository = await readFile(new URL("../../news/server/stories.repository.ts", import.meta.url), "utf8");

test("Story form migrates from the legacy picker to the reusable MediaPicker wrapper", () => {
  assert.match(form, /StoryFeaturedMediaField/u);
  assert.doesNotMatch(form, /@\/features\/admin\/media\/media-picker/u);
  assert.match(field, /components\/media-picker/u);
  assert.match(field, /<MediaPicker/u);
  assert.match(field, /selectedMediaId=\{selectedId/u);
  assert.match(field, /onSelect=\{selectMedia\}/u);
  assert.match(field, /trigger=\{/u);
});

test("Story owns the featured media draft and persists only its UUID in the existing form", () => {
  assert.match(field, /name="featuredMediaId"/u);
  assert.match(field, /value=\{selectedId\}/u);
  assert.match(field, /setSelectedId\(media\.id\)/u);
  assert.doesNotMatch(field, /secureUrl|publicId|cloudinary/u);
  assert.match(repository, /from\("stories"\)\.insert\(values\)/u);
  assert.match(repository, /from\("stories"\)\.update\(values\)/u);
});

test("current, absent, and missing media states never substitute another asset", () => {
  assert.match(field, /currentMedia/u);
  assert.match(field, /No featured image selected/u);
  assert.match(field, /Featured media is unavailable/u);
  assert.doesNotMatch(field, /\?\? view\.media\[0\]/u);
});

test("Story service resolves only current media instead of preloading picker options", () => {
  assert.match(service, /getMediaReferenceView/u);
  assert.doesNotMatch(service, /getMediaPickerOptions/u);
  assert.match(service, /featuredMedia:/u);
});

test("server mutation validates UUID and active canonical media before persistence", () => {
  assert.match(model, /featuredMediaId: optionalUuid/u);
  assert.match(service, /values\.featuredMediaId[\s\S]*?isSelectableMedia/u);
  assert.match(service, /Select an available featured image\./u);
  assert.match(service, /featured_media_id: resolveFeaturedMediaSelection/u);
  assert.doesNotMatch(service, /featuredMediaUrl|cloudinaryPublicId/u);
  assert.match(service, /assertFeaturedMediaSelection/u);
  assert.match(mediaPolicy, /admin\.role === "writer"[\s\S]*?requestedFeaturedMediaId === currentFeaturedMediaId/u);
  assert.match(service, /validateFeaturedMediaChange/u);
  assert.match(service, /You cannot change featured media\./u);
});

test("Story field preserves writer policy, removal, accessibility, and responsive presentation", () => {
  assert.match(field, /canManage/u);
  assert.match(field, /Featured image/u);
  assert.match(field, /aria-live="polite"/u);
  assert.match(field, /Remove featured image/u);
  assert.match(field, /sm:grid-cols/u);
});

test("the legacy Story-specific picker is removed only after its sole consumer migrates", async () => {
  const legacy = await readFile(new URL("../media/media-picker.tsx", import.meta.url), "utf8").catch(() => "");
  assert.equal(legacy, "");
});
