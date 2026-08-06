import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("reading progress uses a passive, animation-frame scroll island with accessible state", async () => {
  const source = await readFile(new URL("./reading-progress.tsx", import.meta.url), "utf8");

  assert.match(source, /role="progressbar"/u);
  assert.match(source, /aria-valuenow=\{progress\}/u);
  assert.match(source, /requestAnimationFrame/u);
  assert.match(source, /addEventListener\("scroll", scheduleUpdate, \{ passive: true \}\)/u);
  assert.match(source, /removeEventListener\("scroll", scheduleUpdate\)/u);
  assert.match(source, /cancelAnimationFrame/u);
});

test("share island supports all approved destinations and responsive placements", async () => {
  const source = await readFile(new URL("./story-share-actions.tsx", import.meta.url), "utf8");

  for (const destination of ["wa.me", "x.com", "facebook.com", "linkedin.com", "t.me", "mailto:"]) {
    assert.match(source, new RegExp(destination.replace(".", "\\."), "u"));
  }
  assert.match(source, /navigator\.clipboard\.writeText/u);
  assert.match(source, /placement === "desktop"/u);
  assert.match(source, /placement === "mobile"/u);
  assert.match(source, /sticky/u);
  assert.match(source, /fixed/u);
});
