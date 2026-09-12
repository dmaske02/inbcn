import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [preview, card, ledger, homepage] = await Promise.all([
  readFile(new URL("./story-preview-media.tsx", import.meta.url), "utf8").catch(() => ""),
  readFile(new URL("./story-card.tsx", import.meta.url), "utf8"),
  readFile(new URL("../editorial/ledger-story-row.tsx", import.meta.url), "utf8"),
  readFile(new URL("../../features/news/components/homepage-sections.tsx", import.meta.url), "utf8"),
]);

test("shared card media renders video previews without the image placeholder", () => {
  assert.match(preview, /^"use client";/u);
  assert.match(preview, /export function StoryPreviewMedia/u);
  assert.match(preview, /<video/u);
  assert.match(preview, /preload="metadata"/u);
  assert.match(preview, /muted/u);
  assert.match(preview, /playsInline/u);
  assert.match(preview, /buildStoryVideoPlaybackHref/u);
  assert.match(preview, /aria-label=\{`Play video in full story:/u);
  assert.match(preview, /<Play/u);
  assert.doesNotMatch(preview, /useState|setIsPlaying|<video[\s\S]*controls/u);
  assert.match(preview, /object-cover/u);
  assert.match(card, /<StoryPreviewMedia/u);
  assert.match(card, /href=\{href\}/u);
  assert.match(ledger, /<StoryPreviewMedia/u);
  assert.match(ledger, /href=\{story\.href\}/u);
  assert.match(homepage, /<StoryPreviewMedia/u);
  assert.match(homepage, /href=\{story\.href\}/u);
});
