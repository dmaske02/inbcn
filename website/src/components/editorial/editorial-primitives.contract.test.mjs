import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const directory = new URL("./", import.meta.url);

async function source(name) {
  try {
    return await readFile(new URL(name, directory), "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

test("editorial primitives expose presentation-only component contracts", async () => {
  const [header, row, sponsor, ranked, actions, index] = await Promise.all([
    source("editorial-section-header.tsx"),
    source("ledger-story-row.tsx"),
    source("editorial-sponsor-row.tsx"),
    source("ranked-story-list.tsx"),
    source("story-action-buttons.tsx"),
    source("index.ts"),
  ]);
  const presentation = [header, row, sponsor, ranked, actions].join("\n");

  assert.match(header, /export function EditorialSectionHeader/u);
  assert.match(row, /export type LedgerStory\s*=/u);
  assert.match(row, /export function LedgerStoryRow/u);
  assert.match(sponsor, /export function EditorialSponsorRow/u);
  assert.match(ranked, /export function RankedStoryList/u);
  assert.match(actions, /export function StoryActionButtons/u);

  for (const name of [
    "EditorialSectionHeader",
    "LedgerStoryRow",
    "EditorialSponsorRow",
    "RankedStoryList",
    "StoryActionButtons",
  ]) {
    assert.match(index, new RegExp(`export \\{ ${name} \\}`, "u"));
  }
  assert.match(index, /export type \{ LedgerStory \}/u);
  assert.doesNotMatch(presentation, /repository|supabase|server\/services|server-only/iu);
});

test("ledger rows keep image, metadata, story copy, and actions in one semantic row", async () => {
  const row = await source("ledger-story-row.tsx");

  assert.match(row, /import Image from "next\/image"/u);
  assert.match(row, /className="editorial-ledger-row log-row"/u);
  assert.match(row, /<time dateTime=\{story\.publishedAt\}/u);
  assert.match(row, /story\.category/u);
  assert.match(row, /story\.summary/u);
  assert.match(row, /sizes=/u);
  assert.match(row, /showActions/u);
  assert.match(row, /<StoryActionButtons/u);
  assert.doesNotMatch(row, /HomepageStory|StorySummaryDto/u);
});

test("sponsor rows reserve restrained 8:1 desktop and 3:1 mobile geometry", async () => {
  const [sponsor, css] = await Promise.all([
    source("editorial-sponsor-row.tsx"),
    readFile(new URL("../../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(sponsor, /className=\{cn\("editorial-sponsor-row"/u);
  assert.match(sponsor, /aria-label=\{label\}/u);
  assert.match(sponsor, /data-ad-slot=\{slotId\}/u);
  assert.match(css, /\.editorial-sponsor-row\s*\{[^}]*aspect-ratio:\s*8\s*\/\s*1[^}]*border-top:\s*1px solid var\(--editorial-border\)[^}]*border-bottom:\s*1px solid var\(--editorial-border\)/su);
  assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*\.editorial-sponsor-row\s*\{[^}]*aspect-ratio:\s*3\s*\/\s*1/su);
  assert.doesNotMatch(css, /\.editorial-sponsor-row\s*\{[^}]*box-shadow/su);
});

test("ranked stories render an accessible zero-padded ordered list", async () => {
  const ranked = await source("ranked-story-list.tsx");

  assert.match(ranked, /<ol/u);
  assert.match(ranked, /String\(index \+ 1\)\.padStart\(2, "0"\)/u);
  assert.match(ranked, /<Link href=\{story\.href\}/u);
  assert.match(ranked, /aria-labelledby/u);
});

test("story actions guard persistent saves and share with a clipboard fallback", async () => {
  const actions = await source("story-action-buttons.tsx");

  assert.match(actions, /^"use client";/u);
  assert.match(actions, /inbcn:saved-story-ids:v1/u);
  assert.match(actions, /window\.localStorage\.getItem/u);
  assert.match(actions, /window\.localStorage\.setItem/u);
  assert.match(actions, /try\s*\{/u);
  assert.match(actions, /Array\.isArray/u);
  assert.match(actions, /typeof navigator\.share === "function"/u);
  assert.match(actions, /await navigator\.share\(\{ title, url \}\)/u);
  assert.match(actions, /navigator\.clipboard/u);
  assert.match(actions, /writeText\(url\)/u);
  assert.match(actions, /aria-pressed=\{saved\}/u);
  assert.match(actions, /aria-live="polite"/u);
});
