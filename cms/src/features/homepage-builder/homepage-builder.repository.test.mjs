import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production repository is server-only, orders sections, and uses atomic ordering RPCs", async () => {
  const source = await readFile("src/features/homepage-builder/homepage-builder.repository.ts", "utf8");
  assert.match(source, /^import "server-only";/u);
  assert.match(source, /\.order\("position", \{ ascending: true \}\)/u);
  assert.match(source, /rpc\("move_homepage_section"/u);
  assert.match(source, /direction: "up"/u); assert.match(source, /direction: "down"/u);
  assert.match(source, /rpc\("delete_homepage_section"/u);
});

test("conditional section updates match id and updated_at and expose zero rows as conflicts", async () => {
  const source = await readFile("src/features/homepage-builder/homepage-builder.repository.ts", "utf8");
  assert.match(source, /export async function updateSectionIfCurrent/u);
  assert.match(source, /\.eq\("id", id\)\s*\.eq\("updated_at", expectedUpdatedAt\)/u);
  assert.match(source, /\.maybeSingle\(\)/u);
  assert.match(source, /return data \? toHomepageSectionDto\(data\) : null/u);
});

test("target-index movement uses one atomic RPC and then returns server ordering", async () => {
  const source = await readFile("src/features/homepage-builder/homepage-builder.repository.ts", "utf8");
  assert.match(source, /export async function moveSectionTo/u);
  assert.match(source, /rpc\("move_homepage_section_to", \{ section_id: id, target_position: targetPosition \}\)/u);
  assert.match(source, /return listSections\(configurationId\)/u);
});

test("duplicate and conditional delete use atomic RPCs and return authoritative ordering", async () => {
  const source = await readFile("src/features/homepage-builder/homepage-builder.repository.ts", "utf8");
  assert.match(source, /export async function duplicateSectionAfter/u);
  assert.match(source, /rpc\("duplicate_homepage_section_after"/u);
  assert.match(source, /export async function deleteSectionIfCurrent/u);
  assert.match(source, /rpc\("delete_homepage_section_if_current"/u);
  assert.match(source, /return \{ section, sections: await listSections\(configurationId\) \}/u);
  assert.match(source, /return data \? listSections\(configurationId\) : null/u);
});
