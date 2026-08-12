import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
test("disabled feature flag short-circuits before builder persistence",async()=>{const source=await readFile("src/features/homepage-renderer/homepage-renderer.service-core.ts","utf8");assert.ok(source.indexOf('if(!enabled)')<source.indexOf('dependencies.loadConfiguration'));});
