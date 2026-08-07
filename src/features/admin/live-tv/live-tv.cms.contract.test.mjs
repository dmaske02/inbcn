import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the protected Live TV CMS route renders the existing editor experience", async () => {
  const source = await readFile(new URL("../../../app/admin/(protected)/live-tv/page.tsx", import.meta.url), "utf8");
  assert.match(source, /requireAdminUser/u);
  assert.match(source, /LiveTvEditor/u);
});

test("Live TV mutations authenticate, use shared service validation, and narrowly revalidate localized public pages", async () => {
  const source = await readFile(new URL("./live-tv.actions.ts", import.meta.url), "utf8");
  assert.match(source, /requireAdminUser/u);
  assert.match(source, /createManagedLiveTv|updateManagedLiveTv|removeManagedLiveTv/u);
  assert.match(source, /revalidatePath\(`\/\$\{locale\}\/live-tv`\)/u);
  assert.doesNotMatch(source, /revalidatePublicNews/u);
});

test("the CMS form exposes the approved localized editorial controls without playback code", async () => {
  const source = await readFile(new URL("./live-tv-form.tsx", import.meta.url), "utf8");
  for (const field of [
    "streamTitle", "shortDescription", "provider", "providerUrl", "status",
    "posterUrl", "autoplay", "muted", "currentProgramme", "programmeDescription",
    "scheduleStart", "scheduleEnd", "relatedStoryId", "relatedCategoryId",
    "seoTitle", "seoDescription", "openGraphImageUrl", "canonicalUrl",
  ]) assert.match(source, new RegExp(`name=[\"']${field}[\"']`, "u"));
  assert.doesNotMatch(source, /<iframe|<video|hls\.js/u);
});

test("the existing protected admin navigation includes Live TV only for permitted roles", async () => {
  const source = await readFile(new URL("../../../app/admin/(protected)/layout.tsx", import.meta.url), "utf8");
  assert.match(source, /canManageLiveTv/u);
  assert.match(source, /href="\/admin\/live-tv"/u);
});
