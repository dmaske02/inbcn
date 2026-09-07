import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL("./search-dialog.tsx", import.meta.url);

async function source() {
  return readFile(componentPath, "utf8").catch(() => "");
}

test("search dialog submits a localized native GET request through the existing route", async () => {
  const component = await source();

  assert.match(component, /^"use client";/u);
  assert.match(component, /aria-haspopup="dialog"/u);
  assert.match(component, /aria-expanded=\{isOpen\}/u);
  assert.ok(component.includes('action={`/${locale}/search`}'));
  assert.match(component, /method="get"/u);
  assert.match(component, /name="q"/u);
  assert.match(component, /type="search"/u);
});

test("search dialog owns accessible modal, focus, dismissal, and scroll-lock behavior", async () => {
  const component = await source();

  assert.match(component, /showModal\(\)/u);
  assert.match(component, /role="dialog"/u);
  assert.match(component, /aria-modal="true"/u);
  assert.match(component, /onCancel=/u);
  assert.match(component, /event\.preventDefault\(\)/u);
  assert.match(component, /event\.target === event\.currentTarget/u);
  assert.match(component, /inputRef\.current\?\.focus\(\)/u);
  assert.match(component, /triggerRef\.current\?\.focus\(\)/u);
  assert.match(component, /document\.body\.style\.overflow = "hidden"/u);
  assert.match(component, /document\.body\.style\.overflow = previousOverflow/u);
});

const expected = {
  en: {
    open: "Open search",
    close: "Close search",
    title: "Search INBCN",
    description: "Find reporting by topic, headline, source, or city.",
    placeholder: "Search stories, sources, cities",
    submit: "Search",
  },
  hi: {
    open: "खोज खोलें",
    close: "खोज बंद करें",
    title: "INBCN खोजें",
    description: "विषय, शीर्षक, स्रोत या शहर के अनुसार समाचार खोजें।",
    placeholder: "समाचार, स्रोत, शहर खोजें",
    submit: "खोजें",
  },
  mr: {
    open: "शोध उघडा",
    close: "शोध बंद करा",
    title: "INBCN शोधा",
    description: "विषय, मथळा, स्रोत किंवा शहरानुसार बातम्या शोधा.",
    placeholder: "बातम्या, स्रोत, शहरे शोधा",
    submit: "शोधा",
  },
};

for (const [locale, labels] of Object.entries(expected)) {
  test(`${locale} provides the complete localized search dialog contract`, async () => {
    const messages = JSON.parse(
      await readFile(new URL(`../../../../messages/${locale}.json`, import.meta.url), "utf8"),
    );

    assert.deepEqual(messages.publicChrome.searchDialog, labels);
  });
}
