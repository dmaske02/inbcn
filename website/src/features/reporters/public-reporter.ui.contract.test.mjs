import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const byline = await readFile(new URL("./reporter-byline-card.tsx", import.meta.url), "utf8");
const profilePage = await readFile(
  new URL("../../app/[locale]/reporters/[slug]/page.tsx", import.meta.url),
  "utf8",
);
const notFoundPage = await readFile(
  new URL("../../app/[locale]/reporters/[slug]/not-found.tsx", import.meta.url),
  "utf8",
);
const messages = await Promise.all(
  ["en", "hi", "mr"].map(async (locale) => JSON.parse(await readFile(
    new URL(`../../../messages/${locale}.json`, import.meta.url),
    "utf8",
  )).reporters),
);

test("reporter byline is a server-rendered accessible profile link with one approved portrait", () => {
  assert.doesNotMatch(byline, /["']use client["']/u);
  assert.match(byline, /<Link/u);
  assert.match(byline, /reporter\.legalName/u);
  assert.match(byline, /reporter\.photoUrl/u);
  assert.match(byline, /reporter\.status/u);
  assert.match(byline, /reporter\.district/u);
  assert.match(byline, /reporter\.bio/u);
  assert.match(byline, /reporter\.beats/u);
  assert.equal((byline.match(/<Image\b/gu) ?? []).length, 1);
  assert.match(byline, /alt=\{reporter\.legalName\}/u);
});

test("localized reporter profile handles missing data and renders only reporter history", () => {
  assert.match(profilePage, /getPublicReporter\(slug, locale\)/u);
  assert.match(profilePage, /notFound\(\)/u);
  assert.match(profilePage, /generateMetadata/u);
  assert.match(profilePage, /<StoryCard/u);
  assert.match(profilePage, /reporter\.legalName/u);
  assert.match(profilePage, /reporter\.photoUrl/u);
  assert.match(profilePage, /reporter\.status/u);
  assert.match(profilePage, /reporter\.district/u);
  assert.match(profilePage, /reporter\.bio/u);
  assert.match(profilePage, /reporter\.beats/u);
  assert.match(notFoundPage, /reporters\.notFound/u);
  assert.match(notFoundPage, /getLocale\(\)/u);
  assert.match(notFoundPage, /href=\{`\/\$\{locale\}`\}/u);
  assert.doesNotMatch(profilePage, /profileId|createdBy|phone|kyc|coordinates|reviewNote/iu);
});

test("all public reporter copy is present in every supported locale", () => {
  for (const localized of messages) {
    assert.deepEqual(Object.keys(localized.status).sort(), [
      "former",
      "label",
      "suspended",
      "verified",
    ]);
    for (const key of [
      "home",
      "district",
      "beats",
      "viewProfile",
      "publishedStories",
      "noStories",
    ]) {
      assert.equal(typeof localized[key], "string");
      assert.notEqual(localized[key].trim(), "");
    }
    assert.deepEqual(Object.keys(localized.notFound).sort(), [
      "description",
      "home",
      "title",
    ]);
  }
});
