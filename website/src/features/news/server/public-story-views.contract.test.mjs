import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [storiesRepository, searchQuery, alertsRepository] = await Promise.all([
  readFile(new URL("./stories.repository.ts", import.meta.url), "utf8"),
  readFile(new URL("./stories.search-query.mjs", import.meta.url), "utf8"),
  readFile(new URL("../../alerts/breaking-alerts.repository.ts", import.meta.url), "utf8"),
]);

test("anonymous website reads use the hardened public Story and media views", () => {
  const publicRepository = storiesRepository.slice(
    0,
    storiesRepository.indexOf("export async function getCmsStories"),
  );
  const cmsRepository = storiesRepository.slice(
    storiesRepository.indexOf("export async function getCmsStories"),
  );
  const publicAlerts = alertsRepository.slice(
    alertsRepository.indexOf("export async function getActiveBreakingAlerts"),
    alertsRepository.indexOf("export type AlertListQuery"),
  );

  assert.match(publicRepository, /from\("public_stories"\)/u);
  assert.match(publicRepository, /from\("public_media"\)/u);
  assert.doesNotMatch(publicRepository, /from\("stories"\)|from\("media"\)/u);
  assert.match(searchQuery, /from\("public_stories"\)/u);
  assert.doesNotMatch(searchQuery, /from\("stories"\)/u);
  assert.match(publicAlerts, /from\("public_stories"\)/u);
  assert.doesNotMatch(publicAlerts, /story:stories|from\("stories"\)/u);
  assert.match(cmsRepository, /from\("stories"\)/u);
});
