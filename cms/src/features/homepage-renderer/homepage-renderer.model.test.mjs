import assert from "node:assert/strict";
import test from "node:test";
import { HomepageRendererError, diagnosticFromError, prepareAllRenderers } from "./homepage-renderer.model.ts";

test("diagnostics contain only safe stable metadata", () => {
  const diagnostic = diagnosticFromError("en", new HomepageRendererError("RENDERER_FAILED","Renderer failed\nsecret=hidden",{blockId:"lead",blockType:"hero-story"}));
  assert.deepEqual(diagnostic,{locale:"en",code:"RENDERER_FAILED",message:"Renderer failed secret=[redacted]",blockId:"lead",blockType:"hero-story"});
  assert.equal("stack" in diagnostic,false); assert.equal("configuration" in diagnostic,false);
});
test("renderer preparation is all-or-nothing", () => {
  const sections=[{id:"one"},{id:"two"}];
  assert.throws(()=>prepareAllRenderers(sections,(section)=>{if(section.id==="two") throw new Error("boom"); return section.id;}),/boom/u);
  assert.deepEqual(prepareAllRenderers(sections,(section)=>section.id),["one","two"]);
});
