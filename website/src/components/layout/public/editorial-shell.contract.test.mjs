import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const shellPath = new URL("./editorial-shell.tsx", import.meta.url);
const footerPath = new URL("./editorial-footer.tsx", import.meta.url);
const layoutPath = new URL("./public-layout.tsx", import.meta.url);
const cssPath = new URL("../../../app/globals.css", import.meta.url);

async function optionalSource(path) {
  return readFile(path, "utf8").catch(() => "");
}

test("editorial shell preserves localized navigation and public action destinations", async () => {
  const shell = await optionalSource(shellPath);

  assert.match(shell, /^"use client";/u);
  assert.match(shell, /<SearchDialog locale=\{locale\} labels=\{labels\.searchDialog\}/u);
  assert.ok(shell.includes('<Link href={`/${locale}`}'));
  assert.ok(shell.includes('href={`/${locale}/live-tv`}'));
  assert.match(shell, /key: "india", path: "category\/national"/u);
  assert.match(shell, /key: "world", path: "category\/world"/u);
  assert.match(shell, /key: "ai", path: "search\?q=AI"/u);
  assert.match(shell, /key: "jobs", path: "search\?q=Jobs"/u);
  assert.match(shell, /localizePublicPath\(pathname, nextLocale, window\.location\.search, window\.location\.hash\)/u);
  assert.doesNotMatch(shell, /labels\.actions\.login|editorial-shell-sign-in|editorial-drawer-sign-in/u);
});

test("edition strip uses server data and the mobile drawer prioritizes Live TV", async () => {
  const shell = await optionalSource(shellPath);

  assert.match(shell, /className="editorial-edition-strip"/u);
  assert.match(shell, /\{currentDate\}/u);
  assert.match(shell, /labels\.utility\.descriptor/u);
  assert.match(shell, /labels\.utility\.weather/u);
  for (const locale of ["EN", "HI", "MR"]) assert.match(shell, new RegExp(`"${locale}"`, "u"));

  const drawer = shell.indexOf('className="editorial-drawer-links"');
  const live = shell.indexOf('className="editorial-drawer-live"', drawer);
  const categories = shell.indexOf("{categories.map", drawer);
  assert.notEqual(drawer, -1, "drawer navigation is missing");
  assert.notEqual(live, -1, "drawer Live TV link is missing");
  assert.ok(live < categories, "Live TV must be the first drawer destination");
});

test("breaking and pinned newsroom data retain link and dismissal behavior", async () => {
  const shell = await optionalSource(shellPath);

  assert.match(shell, /breaking\.length > 0/u);
  assert.match(shell, /tickerItems\.map/u);
  assert.match(shell, /href=\{story\.href\}/u);
  assert.match(shell, /window\.location\.href = breaking\[0\]\.href/u);
  assert.match(shell, /pinnedAlert && pinnedOpen/u);
  assert.match(shell, /setPinnedOpen\(false\)/u);
});

test("public layout renders the server-fed editorial shell and localized search labels", async () => {
  const layout = await optionalSource(layoutPath);

  assert.match(layout, /import \{ EditorialShell \} from "\.\/editorial-shell"/u);
  assert.match(layout, /<EditorialShell/u);
  assert.match(layout, /breaking=\{homepageData\.breaking\}/u);
  assert.match(layout, /pinnedAlert=\{homepageData\.pinnedAlert\}/u);
  assert.match(layout, /currentDate=\{currentDate\}/u);
  for (const key of ["open", "close", "title", "description", "placeholder", "submit"]) {
    assert.match(layout, new RegExp(`searchDialog\\.${key}`, "u"));
  }
  assert.doesNotMatch(layout, /actions\.login/u);
  assert.doesNotMatch(layout, /PrototypeChrome/u);
});

test("editorial shell CSS provides sticky blur, ledger rules, tablet scroll, and mobile targets", async () => {
  const css = await optionalSource(cssPath);

  assert.match(css, /\.editorial-shell\s*\{[^}]*position:\s*sticky[^}]*top:\s*0[^}]*backdrop-filter:\s*blur\(12px\)/su);
  assert.match(css, /\.editorial-edition-strip\s*\{[^}]*border-bottom:\s*1px solid var\(--editorial-border\)/su);
  assert.match(css, /\.editorial-shell-nav\s*\{[^}]*overflow-x:\s*auto/su);
  assert.match(css, /\.editorial-shell-nav a::after/u);
  assert.match(css, /\.editorial-breaking-track\s*\{[^}]*animation:/su);
  assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*\.editorial-drawer-trigger\s*\{[^}]*display:\s*grid/su);
  assert.match(css, /\.editorial-drawer-links a\s*\{[^}]*min-height:\s*44px/su);
  assert.doesNotMatch(css, /\.editorial-shell-sign-in|\.editorial-drawer-sign-in/u);
});

test("editorial footer preserves universal navigation and newsletter contracts", async () => {
  const [footer, layout, css] = await Promise.all([
    optionalSource(footerPath),
    optionalSource(layoutPath),
    optionalSource(cssPath),
  ]);

  assert.match(footer, /export async function EditorialFooter/u);
  assert.match(footer, /className="editorial-footer"/u);
  assert.match(footer, /className="editorial-container editorial-footer-grid"/u);
  assert.ok(footer.includes('href={`/${locale}/about`}'));
  assert.ok(footer.includes('href={`/${locale}/contact`}'));
  assert.ok(footer.includes('href={`/${locale}/editorial-policy`}'));
  assert.ok(footer.includes('href={`/${locale}/privacy`}'));
  assert.ok(footer.includes('href={`/${locale}/live-tv`}'));
  assert.ok(footer.includes('href={`/${locale}/fact-check`}'));
  assert.match(footer, /type="email"/u);
  assert.match(footer, /t\("connect\.subscribe"\)/u);
  assert.doesNotMatch(footer, /proto-footer/u);

  assert.match(layout, /import \{ EditorialFooter \} from "\.\/editorial-footer"/u);
  assert.match(layout, /footer \?\? <EditorialFooter locale=\{locale\} \/>/u);
  assert.doesNotMatch(layout, /PrototypeFooter/u);

  assert.match(css, /\.editorial-footer\s*\{[^}]*border-top:\s*3px solid var\(--editorial-accent\)[^}]*background:\s*var\(--editorial-inverted\)/su);
});
