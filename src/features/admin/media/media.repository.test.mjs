import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./media.repository.ts", import.meta.url), "utf8");

test("active media queries project normalized metadata and exclude retired rows", () => {
  assert.match(source, /title, original_filename, credit, updated_by, deleted_at, deleted_by/u);
  assert.match(source, /\.eq\("media_type", "image"\)[\s\S]*?\.is\("deleted_at", null\)/u);
  assert.match(source, /getMediaById[\s\S]*?\.eq\("media_type", "image"\)[\s\S]*?\.is\("deleted_at", null\)/u);
});

test("active media pages use deterministic newest ordering", () => {
  assert.match(source, /request = request\.order\("created_at", \{ ascending: false \}\)\.order\("id", \{ ascending: false \}\)/u);
});

test("media pages search normalized metadata on the server", () => {
  assert.match(source, /title\.ilike/u);
  assert.match(source, /original_filename\.ilike/u);
  assert.match(source, /credit\.ilike/u);
  assert.match(source, /alt_text\.ilike/u);
  assert.match(source, /metadata->>title\.ilike/u);
});

test("media pages validate image filtering and simple creation-date filtering", () => {
  assert.match(source, /if \(query\.mediaType === "image"\)[\s\S]*?\.eq\("media_type", query\.mediaType\)/u);
  assert.match(source, /if \(query\.createdAfter\)[\s\S]*?\.gte\("created_at", query\.createdAfter\)/u);
});

test("media persistence writes normalized fields and preserves the Story relationship", () => {
  assert.match(source, /title: input\.metadata\.title/u);
  assert.match(source, /original_filename: input\.metadata\.originalFilename/u);
  assert.match(source, /credit: input\.metadata\.credit/u);
  assert.match(source, /updated_by: input\.createdBy/u);
  assert.match(source, /story_id: null/u);
  assert.match(source, /countMediaStoryReferences[\s\S]*?\.eq\("featured_media_id", id\)/u);
});

test("metadata updates write only approved fields, merge legacy JSON, and use optimistic concurrency", () => {
  assert.match(source, /updateMediaMetadata/u);
  assert.match(source, /title: input\.title/u);
  assert.match(source, /original_filename: input\.originalFilename/u);
  assert.match(source, /alt_text: input\.altText/u);
  assert.match(source, /caption: input\.caption/u);
  assert.match(source, /credit: input\.credit/u);
  assert.match(source, /updated_by: input\.updatedBy/u);
  assert.match(source, /metadata: \{[\s\S]*?\.\.\.legacyMetadata[\s\S]*?title: input\.title[\s\S]*?originalFilename: input\.originalFilename[\s\S]*?credit: input\.credit/u);
  assert.match(source, /\.eq\("updated_at", input\.expectedUpdatedAt\)/u);
  assert.match(source, /\.is\("deleted_at", null\)/u);
  assert.doesNotMatch(source, /updateMediaMetadata[\s\S]*?cloudinary_public_id:/u);
});

test("lifecycle repository loads retired records and deterministic Story usage details", () => {
  assert.match(source, /getMediaByIdIncludingRetired/u);
  assert.match(source, /getMediaStoryUsages/u);
  assert.match(source, /id, title, status, language_id/u);
  assert.match(source, /languageCode/u);
  assert.match(source, /adminHref: `\/admin\/stories\/\$\{story\.id\}`/u);
  assert.match(source, /\.order\("title", \{ ascending: true \}\)\.order\("id", \{ ascending: true \}\)/u);
});

test("lifecycle repository invokes guarded RPCs and has no hard-delete method", () => {
  assert.match(source, /retireMediaRecord[\s\S]*?\.rpc\("retire_media_asset"/u);
  assert.match(source, /restoreMediaRecord[\s\S]*?\.rpc\("restore_media_asset"/u);
  assert.doesNotMatch(source, /from\("media"\)\.delete|export async function deleteMedia/u);
});
