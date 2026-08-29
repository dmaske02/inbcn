import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("live request UI uses safe native controls and contains no location capture", async () => {
  const [form, actions, navigation, list, requestPage] = await Promise.all([
    readFile(new URL("./live-request-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("./live-request.actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../navigation/reporter-navigation.tsx", import.meta.url), "utf8"),
    readFile(new URL("./live-request-list.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/(protected)/live/request/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(form, /type="datetime-local"/u);
  assert.match(form, /type="number"/u);
  assert.match(form, /IST/u);
  assert.doesNotMatch(form, /geolocation|latitude|longitude|coordinates/iu);
  assert.match(actions, /requireReporterSession/u);
  assert.match(navigation, /href: "\/live"/u);
  assert.match(list, /href=\{`\/live\/\$\{request\.id\}`\}/u);
  assert.match(requestPage, /will be server-recorded/u);
  assert.doesNotMatch(requestPage, /session is recorded/u);
});

test("live request form uses Reporter primitives and exposes native datetime invalidity", async () => {
  const form = await readFile(new URL("./live-request-form.tsx", import.meta.url), "utf8");
  assert.match(form, /import \{ Button \}/u);
  assert.match(form, /import \{ Card, CardContent, CardFooter, CardHeader \}/u);
  assert.match(form, /<Card>/u);
  assert.match(form, /<Button/u);
  assert.match(form, /onInvalid=/u);
  assert.match(form, /validity\.valid/u);
  assert.match(form, /aria-invalid=/u);
  assert.match(form, /Please enter a complete date and time\./u);
  assert.match(form, /min-h-11/u);
  assert.doesNotMatch(form, /noValidate|preventDefault/u);
});

test("live hub uses compact CMS-style request cards with semantic state guidance", async () => {
  const [page, list] = await Promise.all([
    readFile(new URL("../../app/(protected)/live/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("./live-request-list.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, />Live</u);
  assert.match(page, /Request live broadcast/u);
  assert.match(page, /min-h-11/u);
  assert.match(page, /const currentTime = new Date\(\)\.getTime\(\)/u);
  assert.match(page, /currentTime=\{currentTime\}/u);
  assert.match(list, /import \{ Badge,/u);
  assert.match(list, /import \{ Card, CardContent/u);
  assert.match(list, /Pending review/u);
  assert.match(list, /Approved window/u);
  assert.match(list, /Requested duration/u);
  assert.match(list, /Intended locality/u);
  assert.match(list, /Open broadcast studio/u);
  assert.match(list, /w-full[^"]*sm:w-auto/u);
  assert.match(list, /break-words/u);
  assert.match(list, /currentTime: number/u);
  assert.doesNotMatch(list, /Date\.now\(\)/u);
  assert.doesNotMatch(list, /gradient|shadow-xl|backdrop-blur/u);
});

test("live request page keeps the existing form inside a restrained CMS page hierarchy", async () => {
  const page = await readFile(new URL("../../app/(protected)/live/request/page.tsx", import.meta.url), "utf8");
  assert.match(page, /Request a live broadcast/u);
  assert.match(page, /Back to live/u);
  assert.match(page, /role="status"/u);
  assert.match(page, /rounded-md border border-border/u);
  assert.doesNotMatch(page, /gradient|shadow-xl|backdrop-blur/u);
});
