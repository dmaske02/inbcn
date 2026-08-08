import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const file = (name) => readFile(new URL(name, import.meta.url), "utf8");

test("viewer surfaces accessible live, loading, reconnect, error, and controls", async () => {
  const source = [
    await file("./live-viewer.tsx"),
    await file("./viewer-player.tsx"),
    await file("./viewer-loading.tsx"),
    await file("./viewer-error.tsx"),
  ].join("\n");
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /role="status"/);
  assert.match(source, /role="alert"/);
  assert.match(source, /aria-label=.*Mute/u);
  assert.match(source, /aria-label=.*fullscreen/iu);
  assert.match(source, /focus-visible:/u);
  assert.match(source, /LIVE/u);
});

test("viewer cleans up media and the room on unmount", async () => {
  const source = await file("./live-viewer.tsx");
  assert.match(source, /client\.disconnect\(\)/u);
  assert.match(source, /track\.detach/u);
  assert.match(source, /return \(\) =>/u);
});
