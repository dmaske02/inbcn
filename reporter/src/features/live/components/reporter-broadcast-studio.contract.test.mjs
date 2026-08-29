import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("reporter studio keeps recording disclosure, persistent status, and accessible controls", async () => {
  const [studio, controls, preview, connection, banner] = await Promise.all([
    readFile(new URL("./reporter-broadcast-studio.tsx", import.meta.url), "utf8"),
    readFile(new URL("./broadcast-controls.tsx", import.meta.url), "utf8"),
    readFile(new URL("./camera-preview.tsx", import.meta.url), "utf8"),
    readFile(new URL("./connection-status.tsx", import.meta.url), "utf8"),
    readFile(new URL("./recording-banner.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(studio, /This live broadcast is being recorded\./u);
  assert.match(studio, /type="checkbox"/u);
  assert.match(studio, /import \{ Badge \}/u);
  assert.match(studio, /import \{ Card, CardContent, CardHeader \}/u);
  assert.match(studio, /Approved window/u);
  assert.match(studio, /Intended locality/u);
  assert.match(studio, /Broadcast studio/u);
  assert.match(studio, /break-words/u);
  assert.match(studio, /aria-labelledby="studio-heading"/u);
  assert.match(controls, /aria-label=/u);
  assert.match(controls, /w-full sm:w-auto/u);
  assert.match(controls, /Button/u);
  assert.match(preview, /aria-label="Live camera preview"/u);
  assert.match(connection, /role="status"/u);
  assert.match(banner, /aria-live="polite"/u);
  assert.doesNotMatch(studio, /createLocalScreen|ScreenShare|chatMessage/iu);
  assert.doesNotMatch(studio, /gradient|shadow-xl|backdrop-blur/u);
});
