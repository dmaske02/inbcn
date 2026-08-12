import assert from "node:assert/strict";
import test from "node:test";
import { resolveHomepageRendererPayload } from "./homepage-renderer.references.ts";

const story=(id,locale="en")=>({id,slug:id,href:`/${locale}/story/${id}`,title:id,summary:"Summary",publishedAt:"2026-08-11T00:00:00Z",categoryId:"cat",categoryName:"News",categorySlug:"news",isBreaking:id==="breaking",isFeatured:id==="hero",image:{src:"/x.svg",alt:id,unoptimized:true,width:null,height:null,aspectRatio:null}});
const categoryStory=(id,categoryId,name,slug)=>({...story(id),categoryId,categoryName:name,categorySlug:slug});
const legacy={all:[story("hero"),story("breaking"),story("latest")],featured:story("hero"),breaking:[story("breaking")],pinnedAlert:null,topHeadlines:[],latest:[story("latest")],trending:[story("breaking")],categoryRails:[{category:{id:"cat",languageId:"lang",slug:"news",name:"News",description:null,parentId:null,sortOrder:0},stories:[story("latest")]}],editorPicks:[story("hero")]};
const section=(type,configuration={},overrides={})=>({id:type,blockId:type,title:type,type,renderer:type==="custom-html-placeholder"?"custom-html-disabled":type,position:0,container:"main",width:"full",configuration,...overrides});

const entertainmentStories=[
  categoryStory("entertainment-1","entertainment","Entertainment","entertainment"),
  categoryStory("entertainment-2","entertainment","Entertainment","entertainment"),
  categoryStory("entertainment-3","entertainment","Entertainment","entertainment"),
];
const otherStory=categoryStory("other-1","other","Other","other");
const depletedCategoryLegacy={
  ...legacy,
  all:[...entertainmentStories,otherStory],
  trending:entertainmentStories.slice(0,2),
  categoryRails:[
    {category:{id:"entertainment",languageId:"lang",slug:"entertainment",name:"Entertainment",description:null,parentId:null,sortOrder:0},stories:[entertainmentStories[2]]},
    {category:{id:"other",languageId:"lang",slug:"other",name:"Other",description:null,parentId:null,sortOrder:1},stories:[otherStory]},
  ],
};

test("resolves story, category, lists, and safe placeholders from one legacy model",()=>{
  const sections=[section("hero-story",{storyId:"hero"}),section("breaking-news",{limit:1},{position:1}),section("latest-news",{limit:1},{position:2}),section("category-section",{categoryId:"cat",limit:1},{position:3}),section("trending",{limit:1},{position:4}),section("opinion",{limit:1},{position:5}),section("advertisement-placeholder",{label:"Advertisement"},{position:6}),section("custom-html-placeholder",{content:"<script>bad()</script>"},{position:7}),section("future-placeholder",{note:"Future"},{position:8})];
  const result=resolveHomepageRendererPayload("en",{locale:"en",sections},legacy,null);
  assert.equal(result.sections.length,9); assert.equal(result.sections[0].data.story.id,"hero"); assert.equal(result.sections[3].data.category.id,"cat"); assert.equal(result.sections[7].data.kind,"placeholder"); assert.equal(JSON.stringify(result).includes("<script>"),false);
});
test("Live TV resolves lazily and missing or cross-locale references fail closed",()=>{
  assert.throws(()=>resolveHomepageRendererPayload("en",{locale:"en",sections:[section("hero-story",{storyId:"missing"})]},legacy,null),/story/u);
  assert.throws(()=>resolveHomepageRendererPayload("hi",{locale:"hi",sections:[section("hero-story",{storyId:"hero"})]},legacy,null),/locale/u);
  assert.throws(()=>resolveHomepageRendererPayload("en",{locale:"en",sections:[section("live-tv",{})]},legacy,null),/Live TV/u);
  assert.equal(resolveHomepageRendererPayload("en",{locale:"en",sections:[section("live-tv",{})]},legacy,{mode:"offline"}).sections[0].data.kind,"live-tv");
});

test("Homepage Builder category sections use all matching stories without changing the depleted legacy rail",()=>{
  const result=resolveHomepageRendererPayload("en",{locale:"en",sections:[section("category-section",{categoryId:"entertainment",limit:8})]},depletedCategoryLegacy,null);
  assert.deepEqual(depletedCategoryLegacy.categoryRails[0].stories.map(({id})=>id),["entertainment-3"]);
  assert.deepEqual(result.sections[0].data.stories.map(({id})=>id),["entertainment-1","entertainment-2","entertainment-3"]);
});

test("Homepage Builder category sections apply only the configured story limit",()=>{
  const result=resolveHomepageRendererPayload("en",{locale:"en",sections:[section("category-section",{categoryId:"entertainment",limit:2})]},depletedCategoryLegacy,null);
  assert.deepEqual(result.sections[0].data.stories.map(({id})=>id),["entertainment-1","entertainment-2"]);
});

test("Homepage Builder category sections include only the configured category",()=>{
  const result=resolveHomepageRendererPayload("en",{locale:"en",sections:[section("category-section",{categoryId:"other",limit:8})]},depletedCategoryLegacy,null);
  assert.deepEqual(result.sections[0].data.stories.map(({id})=>id),["other-1"]);
});

test("Hero Sidebar resolves available stories in configured order and omits unavailable stories",()=>{
  const result=resolveHomepageRendererPayload("en",{locale:"en",sections:[section("hero-sidebar",{storyIds:["latest","missing","breaking"]})]},legacy,null);
  assert.equal(result.sections[0].data.kind,"hero-sidebar");
  assert.deepEqual(result.sections[0].data.stories.map(({id})=>id),["latest","breaking"]);
});

test("Hero Sidebar resolves to an empty non-throwing payload when no stories remain available",()=>{
  const result=resolveHomepageRendererPayload("en",{locale:"en",sections:[section("hero-sidebar",{storyIds:["missing"]})]},legacy,null);
  assert.deepEqual(result.sections[0].data.stories,[]);
});

test("adjacent Hero Sidebar omits the configured Hero Story while standalone mode remains independent",()=>{
  const adjacent=[section("hero-story",{storyId:"hero"}),section("hero-sidebar",{storyIds:["hero","latest"]},{position:1})];
  const adjacentResult=resolveHomepageRendererPayload("en",{locale:"en",sections:adjacent},legacy,null);
  assert.deepEqual(adjacentResult.sections[1].data.stories.map(({id})=>id),["latest"]);

  const standalone=[section("hero-story",{storyId:"hero"}),section("latest-news",{limit:1},{position:1}),section("hero-sidebar",{storyIds:["hero"]},{position:2})];
  const standaloneResult=resolveHomepageRendererPayload("en",{locale:"en",sections:standalone},legacy,null);
  assert.deepEqual(standaloneResult.sections[2].data.stories.map(({id})=>id),["hero"]);
});
