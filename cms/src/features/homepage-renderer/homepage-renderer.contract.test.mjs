import assert from "node:assert/strict";
import test from "node:test";
import { parseHomepageRendererPayload } from "./homepage-renderer.contract.ts";

const item = (overrides={}) => ({ id:"section", blockId:"lead", title:"Lead", type:"latest-news", renderer:"latest-news", position:0, container:"main", width:"full", data:{ kind:"stories", stories:[] }, ...overrides });
test("renderer contract accepts localized ordered layout payloads", () => {
  const payload = parseHomepageRendererPayload({ locale:"en", sections:[item()] });
  assert.equal(payload.locale,"en"); assert.equal(payload.sections[0].width,"full");
});
test("renderer contract accepts Supabase timestamps with an explicit UTC offset", () => {
  const story={id:"story",slug:"story",href:"/en/story/story",title:"Story",summary:"Summary",publishedAt:"2026-08-05T12:47:50.512+00:00",categoryId:"category",categoryName:"News",categorySlug:"news",isBreaking:false,isFeatured:false,image:{src:"/story.jpg",alt:"Story",unoptimized:false,width:1200,height:675,aspectRatio:16/9}};
  const payload=parseHomepageRendererPayload({locale:"en",sections:[item({type:"hero-story",renderer:"hero-story",data:{kind:"story",story}})]});
  assert.equal(payload.sections[0].data.story.publishedAt,story.publishedAt);
});
test("renderer contract accepts the dedicated Hero Sidebar payload", () => {
  const story={id:"story",slug:"story",href:"/en/story/story",title:"Story",summary:"Summary",publishedAt:"2026-08-05T12:47:50.512+00:00",categoryId:"category",categoryName:"News",categorySlug:"news",isBreaking:false,isFeatured:false,image:{src:"/story.jpg",alt:"Story",unoptimized:false,width:1200,height:675,aspectRatio:16/9}};
  const payload=parseHomepageRendererPayload({locale:"en",sections:[item({type:"hero-sidebar",renderer:"hero-sidebar",data:{kind:"hero-sidebar",stories:[story]}})]});
  assert.equal(payload.sections[0].data.kind,"hero-sidebar");
  assert.equal(payload.sections[0].data.stories[0].id,"story");
});
test("renderer contract rejects empty, unordered, duplicate, unknown, and invalid layout payloads", () => {
  assert.throws(()=>parseHomepageRendererPayload({locale:"en",sections:[]}),/active section/u);
  assert.throws(()=>parseHomepageRendererPayload({locale:"en",sections:[item({position:2}),item({id:"two",position:1})]}),/ordered/u);
  assert.throws(()=>parseHomepageRendererPayload({locale:"en",sections:[item(),item({id:"two"})]}),/ordered/u);
  assert.throws(()=>parseHomepageRendererPayload({locale:"en",sections:[item({type:"unknown",renderer:"unknown"})]}),/invalid/u);
  assert.throws(()=>parseHomepageRendererPayload({locale:"en",sections:[item({width:"wide"})]}),/invalid/u);
});
