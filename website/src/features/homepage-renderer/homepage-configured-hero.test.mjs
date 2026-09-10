import assert from "node:assert/strict";
import test from "node:test";
import { createHomepageRendererService } from "./homepage-renderer.service-core.ts";
const A="5bb2dadc-f94b-4c7e-92c1-46f1d475689f", B="be268377-f993-402c-9c37-2de5b365467f";
const story=(id,locale="en")=>({id,href:`/${locale}/story/${id}`,title:id===B?"Osaka Bay sees first ship-to-ship LNG bunkering":"Amrit Bharat",image:{src:id===B?"/osaka.jpg":"/train.jpg"}});
function fixture({selected=B,target=story(B),failRead=false}={}) {
 const calls=[];
 const deps={loadLegacy:async locale=>({all:[story(A,locale)],featured:story(A,locale),breaking:[],topHeadlines:[],latest:[],trending:[],editorPicks:[],categoryRails:[]}),loadHero:async locale=>{calls.push(["hero",locale]);if(failRead)throw Error("private db detail");return locale==="mr"?null:selected;},loadStory:async(locale,id)=>{calls.push(["story",locale,id]);return target;},loadConfiguration:async()=>{throw Error("unrelated category/configuration failure");},log:()=>{}};
 return {render:createHomepageRendererService(deps),calls};
}
for(const enabled of [true,false]) test(`configured Osaka survives fallback and layout flag ${enabled}`,async()=>{const f=fixture();const result=await f.render("en",enabled);assert.equal(result.legacy.featured.id,B);assert.equal(result.legacy.featured.image.src,"/osaka.jpg");assert.equal(result.legacy.all.at(-1).id,B);assert.deepEqual(f.calls,[["hero","en"],["story","en",B]]);});
test("unpublished/unavailable/wrong-locale story and failed configuration reads keep safe fallback",async()=>{for(const options of [{target:null},{target:story(B,"hi")},{target:story(A)},{failRead:true},{selected:null},{selected:"invalid"}]){assert.equal((await fixture(options).render("en",true)).legacy.featured.id,A);}});
test("EN and HI use their own published stories and MR retains public fallback",async()=>{for(const locale of ["en","hi","mr"]){const f=fixture({target:story(B,locale)});const result=await f.render(locale,true);assert.equal(result.legacy.featured.id,locale==="mr"?A:B);assert.ok(result.legacy.featured.href.startsWith(`/${locale}/`));}});

import { composeHomepageData } from "../news/server/services/homepage.model.ts";
import { resolveHomepageRendererPayload } from "./homepage-renderer.references.ts";
import { buildHomepagePreview } from "../homepage-builder/homepage-builder.preview.ts";
import { readFile } from "node:fs/promises";
test("real homepage composition retains the selected public story and canonical media",async()=>{
 const dto=(id,featured)=>({id,slug:id,title:id===B?"Osaka":"Amrit",summary:"Published",languageId:"lang-en",categoryId:"cat",publishedAt:"2026-01-01T00:00:00Z",isFeatured:featured,isBreaking:false,featuredMedia:id===B?{secureUrl:"https://res.cloudinary.com/test/image/upload/canonical-published.jpg",altText:"Osaka canonical image",width:1600,height:900}:null,externalImageUrl:"https://example.test/older-external.jpg"});
 const model=composeHomepageData("en",[dto(A,true),dto(B,false)],[]);
 const hero=composeHomepageData("en",[dto(B,false)],[]).featured;
 const section={id:"hero",blockId:"hero",title:"Hero",blockType:"hero-story",renderer:"hero-story",enabled:true,startsAt:null,endsAt:null,position:0,container:"main",width:"full",configuration:{storyId:B}};
 const result=await createHomepageRendererService({loadLegacy:async()=>model,loadHero:async()=>B,loadStory:async()=>hero,loadConfiguration:async()=>({configuration:{id:"config",locale:"en",languageId:"lang-en"},sections:[section]}),composePreview:(c,m)=>buildHomepagePreview("en",c.sections,{stories:m.all.map(s=>({id:s.id,title:s.title,languageId:"lang-en"})),categories:[],liveTv:null}),resolvePayload:resolveHomepageRendererPayload,validatePayload:p=>p,renderSection:s=>s.data,log:()=>{}})("en",true);
 assert.equal(result.kind,"builder");assert.equal(result.sections[0].node.story.id,B);assert.equal(result.sections[0].node.story.image.src,"https://res.cloudinary.com/test/image/upload/canonical-published.jpg");assert.equal(result.legacy.featured.id,B);
});
test("targeted story adapter uses public canonical projections and server-only RPC without privileged credentials",async()=>{
 const repository=await readFile(new URL("../news/server/stories.repository.ts",import.meta.url),"utf8");
 const targeted=repository.slice(repository.indexOf("export async function getPublishedStoryById"),repository.indexOf("export async function getStoriesByLanguage"));
 assert.match(targeted,/from\("public_stories"\)/);assert.match(targeted,/eq\("status", "published"\)/);assert.match(targeted,/eq\("language_id", language.id\)/);assert.match(targeted,/attachFeaturedMedia/);
 assert.match(repository,/from\("public_media"\)/);
 const config=await readFile(new URL("../homepage-builder/homepage-builder.repository.ts",import.meta.url),"utf8");
 assert.ok(config.startsWith('import "server-only"'));assert.match(config,/rpc\("get_public_homepage_hero"/);
 const adapter=config.slice(config.indexOf("export async function getPublicHomepageHero"),config.indexOf("export async function getPublicHomepageConfiguration"));assert.doesNotMatch(adapter,/service.role|createAdminClient|from\(/i);
});
