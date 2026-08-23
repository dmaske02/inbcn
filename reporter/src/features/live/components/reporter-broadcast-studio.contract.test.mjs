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
  assert.match(controls, /aria-label=/u);
  assert.match(preview, /aria-label="Live camera preview"/u);
  assert.match(connection, /role="status"/u);
  assert.match(banner, /aria-live="polite"/u);
  assert.doesNotMatch(studio, /createLocalScreen|ScreenShare|chatMessage/iu);
});
