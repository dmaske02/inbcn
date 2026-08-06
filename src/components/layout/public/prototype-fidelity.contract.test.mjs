import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public chrome exposes every approved prototype control and surface", async () => {
  const source = await readFile(new URL("./prototype-chrome.tsx", import.meta.url), "utf8");
  for (const text of [
    "labels.utility.weather",
    "labels.utility.notifications",
    "labels.utility.reportIncident",
    "labels.utility.descriptor",
    "labels.actions.searchPlaceholder",
    "labels.actions.liveTv",
    "labels.actions.login",
    "labels.actions.signup",
    "labels.actions.enableAlerts",
    "labels.actions.latestUpdate",
    "labels.pinnedAlert",
    "labels.actions.dismiss",
  ]) assert.match(source, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("homepage contains the complete prototype editorial sequence", async () => {
  const source = await readFile(
    new URL("../../../features/news/components/homepage.tsx", import.meta.url),
    "utf8",
  );
  for (const section of [
    "Featured story",
    "Top headlines",
    "Latest news",
    "Trending",
    "Category rails",
    "Editor&apos;s picks",
  ]) assert.match(source, new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
});

test("prototype navigation never derives routes for missing backend categories", async () => {
  const source = await readFile(new URL("./prototype-chrome.tsx", import.meta.url), "utf8");
  assert.match(source, /key: "india", path: "category\/national"/u);
  for (const topic of ["ai", "jobs", "opinion", "factCheck"]) {
    assert.match(
      source,
      new RegExp(`key: "${topic}", path: "search\\?q=`),
    );
  }
  assert.doesNotMatch(source, /category\/\$\{slug\(item\)\}/u);
});
