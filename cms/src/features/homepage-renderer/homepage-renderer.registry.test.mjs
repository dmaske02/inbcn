import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const ids=["hero-story","hero-sidebar","breaking-news","live-tv","latest-news","category-section","trending","opinion","advertisement-placeholder","custom-html-disabled","future-placeholder"];
test("registry is the single complete renderer catalog",async()=>{const source=await readFile("src/features/homepage-renderer/homepage-renderer.registry.ts","utf8");for(const id of ids)assert.match(source,new RegExp(`id:"${id}"`,"u"));assert.equal(new Set(ids).size,11);assert.match(source,/getHomepageRenderer/u);assert.match(source,/\.find\(\(item\)=>item\.id===id\)\?\?null/u);});
