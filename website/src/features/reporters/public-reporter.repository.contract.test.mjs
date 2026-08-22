import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repository = await readFile(
  new URL("./public-reporter.repository.ts", import.meta.url),
  "utf8",
);
const storiesRepository = await readFile(
  new URL("../news/server/stories.repository.ts", import.meta.url),
  "utf8",
);

test("profile repository reads the safe projection and fails closed on locale or row validation", () => {
  assert.match(repository, /from\("public_reporter_profiles"\)/u);
  assert.match(repository, /public_slug, legal_display_name, avatar_url, public_status, home_district, bio, beats/u);
  assert.match(repository, /getLanguage\(locale\)/u);
  assert.match(repository, /mapPublicReporter/u);
  assert.doesNotMatch(
    repository,
    /profile_id|created_by|phone|date_of_birth|kyc|payment|latitude|longitude|accuracy|review_note/iu,
  );
});

test("profile history filters by safe computed slug plus published provenance and locale", () => {
  assert.match(storiesRepository, /public_reporter->>public_slug/u);
  assert.match(storiesRepository, /\.eq\("status", "published"\)/u);
  assert.match(storiesRepository, /\.eq\("language_id", languageId\)/u);
  assert.match(storiesRepository, /\.not\("published_at", "is", null\)/u);
  assert.match(storiesRepository, /\.lte\("published_at", new Date\(\)\.toISOString\(\)\)/u);
  assert.match(storiesRepository, /\.order\("published_at", \{ ascending: false \}\)/u);
  assert.doesNotMatch(storiesRepository, /story_locations|latitude|longitude|accuracy|captured_at|review_note/iu);
});
