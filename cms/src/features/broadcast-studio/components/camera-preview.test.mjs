import assert from "node:assert/strict";
import test from "node:test";

import { attachPreviewTrack } from "../client/preview-video.ts";

test("preview attaches its media stream before explicitly starting video playback", async () => {
  const calls = [];
  const stream = { id: "local-preview" };
  const element = {
    srcObject: null,
    async play() {
      calls.push(["play", this.srcObject]);
    },
  };
  const track = {
    attach(video) {
      video.srcObject = stream;
      calls.push(["attach", video.srcObject]);
    },
  };

  await attachPreviewTrack(track, element);

  assert.deepEqual(calls, [
    ["attach", stream],
    ["play", stream],
  ]);
});
