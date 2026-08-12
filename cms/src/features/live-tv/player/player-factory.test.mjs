import assert from "node:assert/strict";
import test from "node:test";

import { resolvePlayer } from "./player-resolution.ts";

const youtube = {
  status: "live",
  provider: "youtube",
  providerStreamId: "dQw4w9WgXcQ",
  streamUrl: null,
  autoplay: false,
  muted: true,
  allowedHlsHosts: [],
};

test("PlayerFactory resolves a validated YouTube configuration", () => {
  assert.deepEqual(resolvePlayer(youtube), {
    kind: "youtube",
    videoId: "dQw4w9WgXcQ",
    autoplay: false,
    muted: true,
  });
});

test("PlayerFactory resolves an approved HTTPS HLS manifest", () => {
  assert.deepEqual(resolvePlayer({
    ...youtube,
    provider: "hls",
    providerStreamId: null,
    streamUrl: "https://stream.inbcn.example/live/news.m3u8",
    allowedHlsHosts: ["stream.inbcn.example"],
  }), {
    kind: "hls",
    manifestUrl: "https://stream.inbcn.example/live/news.m3u8",
    autoplay: false,
    muted: true,
  });
});

test("PlayerFactory returns offline without selecting a provider", () => {
  assert.deepEqual(resolvePlayer({ ...youtube, status: "offline" }), { kind: "offline" });
});

test("PlayerFactory converts unknown providers and missing sources into safe errors", () => {
  assert.deepEqual(resolvePlayer({ ...youtube, provider: "unknown" }), {
    kind: "error",
    code: "INVALID_PROVIDER",
  });
  assert.deepEqual(resolvePlayer({ ...youtube, providerStreamId: null }), {
    kind: "error",
    code: "MISSING_SOURCE",
  });
});

test("PlayerFactory rejects unapproved, non-HTTPS, and malformed HLS manifests", () => {
  for (const streamUrl of [
    "https://unapproved.example/live/news.m3u8",
    "http://stream.inbcn.example/live/news.m3u8",
    "https://stream.inbcn.example/live/news.mp4",
  ]) {
    assert.deepEqual(resolvePlayer({
      ...youtube,
      provider: "hls",
      providerStreamId: null,
      streamUrl,
      allowedHlsHosts: ["stream.inbcn.example"],
    }), { kind: "error", code: "INVALID_CONFIGURATION" });
  }
});

test("PlayerFactory enforces the Task 1 muted autoplay policy", () => {
  assert.deepEqual(resolvePlayer({ ...youtube, autoplay: true, muted: false }), {
    kind: "error",
    code: "INVALID_CONFIGURATION",
  });
});
