import assert from "node:assert/strict";
import test from "node:test";

import { buildYouTubeEmbedUrl } from "./youtube-player.model.ts";

test("YouTube embeds use the privacy-enhanced HTTPS host and safe player parameters", () => {
  const url = new URL(buildYouTubeEmbedUrl("dQw4w9WgXcQ", { autoplay: false, muted: true }));
  assert.equal(url.origin, "https://www.youtube-nocookie.com");
  assert.equal(url.pathname, "/embed/dQw4w9WgXcQ");
  assert.equal(url.searchParams.get("autoplay"), "0");
  assert.equal(url.searchParams.get("mute"), "1");
  assert.equal(url.searchParams.get("playsinline"), "1");
  assert.equal(url.searchParams.get("controls"), "1");
  assert.equal(url.searchParams.has("enablejsapi"), false);
});

test("YouTube embed builder rejects malformed video identifiers", () => {
  assert.throws(() => buildYouTubeEmbedUrl("not!a-video", { autoplay: false, muted: true }), /identifier/u);
});
