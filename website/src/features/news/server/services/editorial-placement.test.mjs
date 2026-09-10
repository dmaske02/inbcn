import assert from 'node:assert/strict';
import test from 'node:test';
import { composeHomepageData } from './homepage.model.ts';
const story=(id,n,overrides={})=>({id,slug:id,title:id,summary:'published',languageId:'en',categoryId:'news',publishedAt:new Date(Date.UTC(2026,8,20-n)).toISOString(),isFeatured:false,isBreaking:false,...overrides});
const ids=xs=>xs.map(s=>s.id);
test('new reporter publication does not promote Hero, supporting stories or Editor picks; normal feeds remain',()=>{
 const fresh=story('new',0,{editorialPlacementExplicit:true});
 const data=composeHomepageData('en',[fresh,...Array.from({length:15},(_,i)=>story(`old-${i}`,i+1))],[]);
 assert.notEqual(data.featured?.id,'new');assert.ok(!ids(data.editorPicks).includes('new'));assert.ok(!ids(data.heroSupporting??[]).includes('new'));
 assert.ok(ids(data.all).includes('new'));assert.ok(ids(data.topHeadlines).includes('new'));
});
test('explicit Editor pick add/remove is independent of Hero and supporting selection',()=>{
 const legacy=Array.from({length:15},(_,i)=>story(`old-${i}`,i+1));
 for(const picked of [false,true]){const data=composeHomepageData('en',[story('new',0,{editorialPlacementExplicit:true,isFeatured:picked}),...legacy],[]);assert.equal(ids(data.editorPicks).includes('new'),picked);assert.notEqual(data.featured?.id,'new');assert.ok(!ids(data.heroSupporting??[]).includes('new'));}
});
test('existing stories preserve their legacy placement and latest/most-read allocations',()=>{
 const input=Array.from({length:15},(_,i)=>story(`old-${i}`,i));
 const legacy=composeHomepageData('en',input,[]);const explicitFalse=composeHomepageData('en',input.map(s=>({...s,editorialPlacementExplicit:false})),[]);
 assert.deepEqual(legacy,explicitFalse);assert.deepEqual(ids(legacy.editorPicks),['old-1','old-2']);assert.deepEqual(ids(legacy.trending),['old-6','old-7','old-8']);assert.deepEqual(ids(legacy.latest),['old-9','old-10','old-11','old-12']);
});
import { composeHomepageData as composeCmsHomepage } from '../../../../../../cms/src/features/news/server/services/homepage.model.ts';
import { resolveHomepageRendererPayload as resolveWebsite } from '../../../homepage-renderer/homepage-renderer.references.ts';
import { resolveHomepageRendererPayload as resolveCms } from '../../../../../../cms/src/features/homepage-renderer/homepage-renderer.references.ts';
test('CMS and public models agree; chronological Latest News and Most Read still include new reporter stories',()=>{
 const input=Array.from({length:20},(_,i)=>story(`new-${i}`,i,{editorialPlacementExplicit:true}));
 const web=composeHomepageData('en',input,[]),cms=composeCmsHomepage('en',input,[]);
 assert.deepEqual(web,cms);assert.equal(web.featured,null);assert.deepEqual(web.editorPicks,[]);
 assert.deepEqual(ids(web.topHeadlines),['new-0','new-1','new-2']);assert.deepEqual(ids(web.trending),['new-3','new-4','new-5']);assert.deepEqual(ids(web.latest),['new-6','new-7','new-8','new-9']);
});
test('explicit Hero and supporting IDs still resolve new reporter stories in each locale',()=>{
 for(const locale of ['en','hi','mr'])for(const resolve of [resolveWebsite,resolveCms]){
 const model=composeHomepageData(locale,[story('a',0,{editorialPlacementExplicit:true}),story('b',1,{editorialPlacementExplicit:true})],[]);
 const preview={locale,sections:[{id:'hero',blockId:'hero',type:'hero-story',renderer:'hero-story',configuration:{storyId:'a'}},{id:'support',blockId:'support',type:'hero-sidebar',renderer:'hero-sidebar',configuration:{storyIds:['b','a']}}]};
 const result=resolve(locale,preview,model,null);assert.equal(result.sections[0].data.story.id,'a');assert.deepEqual(ids(result.sections[1].data.stories),['b']);
 }
});
