import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./reporter-revision-panel.tsx", import.meta.url), "utf8");

test("submitted media is the first prominent evidence section after the immutable revision", () => {
  const revision = source.indexOf("Immutable submitted revision");
  const media = source.indexOf("Submitted media ·");
  const reporter = source.indexOf("Verified reporter");
  assert.ok(revision >= 0 && media > revision && reporter > media);
  assert.match(source, /border-signal\/50[\s\S]*border-l-4[\s\S]*bg-signal\/5/u);
  assert.match(source, /Images[\s\S]*aria-hidden="true"/u);
  assert.match(source, /review\.submitted_media\.length === 1 \? "file" : "files"/u);
});

test("submitted images use canonical URLs and accessible aspect-ratio previews", () => {
  assert.match(source, /media\.type === "image"[\s\S]*<Image/u);
  assert.match(source, /src=\{media\.secure_url\}/u);
  assert.match(source, /alt=\{media\.alt_text \|\| `Submitted media \$\{index \+ 1\}: \$\{media\.original_filename\}`\}/u);
  assert.match(source, /aspect-video[\s\S]*<Image[\s\S]*fill[\s\S]*object-contain[\s\S]*sizes=/u);
});

test("submitted videos and media details remain explicit and ordered", () => {
  assert.match(source, /media\.type === "image"[\s\S]*:[\s\S]*<Video[^>]+aria-hidden="true"/u);
  assert.match(source, /Video file/u);
  assert.match(source, /Media \{index \+ 1\}/u);
  assert.match(source, /media\.id === snapshot\.featured_media_id[\s\S]*Featured/u);
  assert.match(source, /media\.original_filename/u);
  assert.match(source, /media\.width[\s\S]*media\.height/u);
  assert.match(source, /media\.duration_seconds/u);
  assert.match(source, /href=\{media\.secure_url\}[\s\S]*Open submitted media/u);
});

test("submitted media uses a responsive grid and keeps an explicit empty state", () => {
  assert.match(source, /grid gap-4 sm:grid-cols-2 xl:grid-cols-3/u);
  assert.doesNotMatch(source, /min-w-\[/u);
  assert.match(source, /No media submitted/u);
  assert.match(source, /This revision does not contain any canonical media\./u);
});
