import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { composeHomepageLayout } from "./homepage-builder-layout.model.ts";

const section=(id,type,node=id)=>({id,type,position:Number(id.replace(/\D/gu,""))||0,container:"main",width:"half",node});

test("layout composition pairs only an immediately adjacent Hero Story then Hero Sidebar",()=>{
  const result=composeHomepageLayout([
    section("s0","hero-story"),
    section("s1","hero-sidebar"),
    section("s2","latest-news"),
  ]);
  assert.equal(result[0].kind,"hero-composition");
  assert.equal(result[0].hero.id,"s0");
  assert.equal(result[0].sidebar.id,"s1");
  assert.equal(result[1].kind,"section");
});

test("non-adjacent Hero Sidebar remains a standalone full-width section",()=>{
  const result=composeHomepageLayout([
    section("s0","hero-story"),
    section("s1","latest-news"),
    section("s2","hero-sidebar"),
  ]);
  assert.equal(result.length,3);
  assert.equal(result[2].kind,"section");
  assert.equal(result[2].section.type,"hero-sidebar");
});

test("empty Hero Sidebar is omitted without consuming or resizing Hero Story",()=>{
  const result=composeHomepageLayout([
    section("s0","hero-story"),
    section("s1","hero-sidebar",null),
  ]);
  assert.equal(result.length,1);
  assert.equal(result[0].kind,"section");
  assert.equal(result[0].section.type,"hero-story");
});

test("HomepageBuilderLayout owns all Hero adjacency composition",async()=>{
  const layout=await readFile("src/features/homepage-renderer/components/homepage-builder-layout.tsx","utf8");
  const sidebar=await readFile("src/features/homepage-renderer/components/hero-sidebar-renderer.tsx","utf8");
  const blocks=await readFile("src/features/homepage-renderer/components/homepage-block-renderers.tsx","utf8");
  assert.match(layout,/composeHomepageLayout/u);
  assert.match(layout,/editorial-builder-hero-composition/u);
  assert.match(layout,/data-homepage-section-id=\{item\.hero\.id\}/u);
  assert.match(layout,/data-homepage-sidebar-id=\{item\.sidebar\.id\}/u);
  assert.doesNotMatch(sidebar+blocks,/composeHomepageLayout|hero-composition/u);
});

test("builder shell adopts the editorial canvas without changing section width contracts",async()=>{
  const layout=await readFile("src/features/homepage-renderer/components/homepage-builder-layout.tsx","utf8");
  const css=await readFile("src/app/globals.css","utf8");
  assert.match(layout,/className="editorial-page editorial-homepage"/u);
  assert.match(layout,/className="editorial-container editorial-homepage-inner"/u);
  assert.match(layout,/<div className="editorial-page editorial-homepage">/u);
  assert.doesNotMatch(layout,/<main className="editorial-page editorial-homepage">/u);
  assert.match(layout,/widthClasses/u);
  assert.doesNotMatch(layout,/proto-/u);
  assert.match(css,/\.editorial-builder-hero-composition\s*\{/u);
  assert.match(css,/\.editorial-builder-hero-sidebar\s*\{/u);
});
