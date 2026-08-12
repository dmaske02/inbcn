import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("./", import.meta.url);

async function source(file) {
  return readFile(new URL(file, root), "utf8");
}

test("studio uses the existing admin design system and accessible status regions", async () => {
  const [studio, status, permissions] = await Promise.all([
    source("broadcast-studio.tsx"),
    source("connection-status.tsx"),
    source("permission-banner.tsx"),
  ]);

  assert.match(studio, /@\/components\/ui\/card/);
  assert.match(studio, /@\/components\/ui\/typography/);
  assert.match(status, /role="status"/);
  assert.match(status, /aria-live="polite"/);
  assert.match(permissions, /role="alert"/);
  assert.match(permissions, /tabIndex=\{-1\}/);
});

test("studio exposes labelled controls and cleans up for unload and unmount", async () => {
  const studio = await source("broadcast-studio.tsx");
  const preview = await source("camera-preview.tsx");

  assert.match(studio, /beforeunload/);
  assert.match(studio, /controller\.cleanup\(\)/);
  assert.match(studio, /htmlFor="broadcast-language"/);
  assert.match(studio, /label="Camera"/);
  assert.match(studio, /label="Microphone"/);
  assert.match(preview, /aria-label="Live camera preview"/);
  assert.match(preview, /track\.detach/);
});
