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
  const homepage = await readFile(
    new URL("../../../features/news/components/homepage.tsx", import.meta.url),
    "utf8",
  );
  const sections = await readFile(
    new URL("../../../features/news/components/homepage-sections.tsx", import.meta.url),
    "utf8",
  );
  const source = homepage + sections;
  for (const section of [
    "Featured story",
    "Top headlines",
    "Latest news",
    "Trending",
    "Category rails",
    "Editor's picks",
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

test("mobile drawer exposes localized Live TV first and closes after navigation", async () => {
  const source = await readFile(new URL("./prototype-chrome.tsx", import.meta.url), "utf8");
  const drawerStart = source.indexOf('<div className="proto-drawer-links">');
  const categoriesStart = source.indexOf("{categories.map", drawerStart);
  const liveTvLink = source.indexOf(
    '<Link className="proto-live-tv proto-drawer-live-tv" href={navigationHref(locale, "live-tv")} onClick={() => setDrawerOpen(false)}>',
    drawerStart,
  );

  assert.notEqual(drawerStart, -1, "mobile drawer links are missing");
  assert.notEqual(liveTvLink, -1, "mobile drawer Live TV link is missing");
  assert.ok(liveTvLink < categoriesStart, "Live TV must be the first mobile drawer item");
  assert.match(source.slice(liveTvLink, categoriesStart), /labels\.actions\.liveTv/u);
});

test("public chrome receives a server-formatted date instead of formatting during hydration", async () => {
  const [chrome, layout] = await Promise.all([
    readFile(new URL("./prototype-chrome.tsx", import.meta.url), "utf8"),
    readFile(new URL("./public-layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /const currentDate = new Intl\.DateTimeFormat/u);
  assert.match(layout, /<PrototypeChrome[\s\S]*currentDate=\{currentDate\}/u);
  assert.match(chrome, /currentDate: string/u);
  assert.doesNotMatch(chrome, /Intl\.DateTimeFormat|new Date\(now\)/u);
});
