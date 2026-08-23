import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("localized replay page uses native video and verified reporter attribution", async () => {
  const [page, player, notFound, route] = await Promise.all([
    readFile(new URL("../../app/[locale]/replays/[id]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("./replay-player.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/[locale]/replays/[id]/not-found.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/api/replays/[id]/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /params: Promise<\{ locale: string; id: string \}>/u);
  assert.match(page, /await getPublicReplay\(id, locale\)/u);
  assert.match(page, /notFound\(\)/u);
  assert.match(page, /ReporterBylineCard/u);
  assert.match(page, /buildPublicReporterUrl/u);
  assert.match(page, /"@type": "VideoObject"/u);
  assert.match(player, /<video/u);
  assert.match(player, /controls/u);
  assert.match(player, /playsInline/u);
  assert.match(player, /preload="metadata"/u);
  assert.match(notFound, /<h1/u);
  assert.match(route, /export async function GET/u);
  assert.match(route, /export async function HEAD/u);
  assert.doesNotMatch(route, /redirect\(/u);
  for (const source of [page, player, notFound]) {
    assert.doesNotMatch(source, /(storageKey|signedUrl|egressId|liveRequestId|profileId|accountId|privateNotes|exactLocation)/u);
  }
});

test("every public locale provides accessible replay copy", async () => {
  for (const locale of ["en", "hi", "mr"]) {
    const messages = JSON.parse(await readFile(new URL(`../../../messages/${locale}.json`, import.meta.url), "utf8"));
    assert.equal(typeof messages.replays?.playerFallback, "string");
    assert.equal(typeof messages.replays?.notFound?.title, "string");
    assert.equal(typeof messages.replays?.reporter?.profile, "string");
  }
});
