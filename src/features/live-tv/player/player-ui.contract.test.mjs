import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const file = (name) => readFile(new URL(name, import.meta.url), "utf8");

test("LiveTvPlayer is the only explicit client boundary and lazy-loads provider implementations", async () => {
  const [player, factory, youtube, hls] = await Promise.all([
    file("./live-tv-player.tsx"), file("./player-factory.tsx"),
    file("./youtube-player.tsx"), file("./hls-player.tsx"),
  ]);
  assert.match(player, /^"use client"/u);
  assert.match(factory, /lazy\(\(\) => import\("\.\/youtube-player"\)\)/u);
  assert.match(factory, /lazy\(\(\) => import\("\.\/hls-player"\)\)/u);
  assert.match(hls, /import\("hls\.js"\)/u);
  assert.doesNotMatch(`${factory}\n${youtube}\n${hls}`, /^"use client"/mu);
});

test("the player exposes poster-first, loading, error, offline, and accessible playback states", async () => {
  const source = [
    await file("./live-tv-player.tsx"), await file("./player-factory.tsx"),
    await file("./youtube-player.tsx"), await file("./hls-player.tsx"),
    await file("./offline-player.tsx"), await file("./player-error.tsx"),
  ].join("\n");
  assert.match(source, /poster/u);
  assert.match(source, /aria-label/u);
  assert.match(source, /role="status"/u);
  assert.match(source, /role="alert"/u);
  assert.match(source, /type="button"/u);
  assert.match(source, /aspect-video/u);
});

test("factory validation errors retain the poster fallback behind the safe message", async () => {
  const factory = await file("./player-factory.tsx");
  assert.match(factory, /player\.kind === "error"[\s\S]*PlayerBackdrop/u);
});

test("YouTube uses a constrained iframe while HLS uses native video controls", async () => {
  const youtube = await file("./youtube-player.tsx");
  const hls = await file("./hls-player.tsx");
  assert.match(youtube, /sandbox="allow-scripts allow-same-origin allow-presentation"/u);
  assert.match(youtube, /referrerPolicy="strict-origin-when-cross-origin"/u);
  assert.doesNotMatch(youtube, /dangerouslySetInnerHTML|<script/u);
  assert.match(hls, /<video/u);
  assert.match(hls, /controls/u);
  assert.match(hls, /playsInline/u);
});

test("HLS fails safely when a provider never becomes ready", async () => {
  const hls = await file("./hls-player.tsx");
  assert.match(hls, /setTimeout\([\s\S]*setState\("error"\)[\s\S]*15_000/u);
  assert.match(hls, /clearTimeout/u);
});
