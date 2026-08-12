import assert from "node:assert/strict";
import test from "node:test";

import { selectHlsPlaybackEngine } from "./hls-player.model.ts";

test("HLS uses hls.js when Media Source playback is available", () => {
  assert.equal(selectHlsPlaybackEngine({ hlsJsSupported: true, nativeSupported: true }), "hls.js");
});

test("HLS falls back to native browser playback", () => {
  assert.equal(selectHlsPlaybackEngine({ hlsJsSupported: false, nativeSupported: true }), "native");
});

test("HLS reports an unsupported browser when neither engine is available", () => {
  assert.equal(selectHlsPlaybackEngine({ hlsJsSupported: false, nativeSupported: false }), "unsupported");
});
