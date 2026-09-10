import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const id='00000000-0000-4000-8000-000000000001', editor='00000000-0000-4000-8000-000000000002';
test('editorial migration preserves legacy rows; new publication and explicit action enforce security',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table profiles(id uuid,role text,is_active boolean);
 insert into profiles values('${editor}','editor',true);
 create table stories(id uuid primary key,status text,published_at timestamptz,is_featured boolean default false,is_reporter_story boolean default true,updated_at timestamptz default now(),title text default 'Story');
 create table story_revisions(story_id uuid,review_outcome text,reviewed_at timestamptz);
 create table audit_events(actor_id uuid,action text,subject_type text,subject_id uuid,metadata jsonb);
 create function public.is_reporter_story(s public.stories) returns boolean language sql as $$select s.is_reporter_story$$;
 create function public.guard_reporter_story_provenance() returns trigger language plpgsql as $$begin
 if new.is_featured is distinct from old.is_featured then raise exception 'REPORTER_STORY_PROVENANCE_IMMUTABLE'; end if;return new;end;$$;
 create trigger reporter_guard before update on stories for each row execute function public.guard_reporter_story_provenance();
 create view public_stories as select id,title,is_featured from stories where status='published';
 insert into stories(id,status,published_at,is_featured)values('${id}','published',now()-interval '2 days',true);`);
 await db.exec(`insert into stories(id,status)values('00000000-0000-4000-8000-000000000004','pending_review'),('00000000-0000-4000-8000-000000000005','approved');
 insert into story_revisions values('00000000-0000-4000-8000-000000000005','published',now()-interval '3 days');`);
 const sql=await readFile(new URL('../../../../supabase/migrations/20260910180000_story_editorial_placement.sql',import.meta.url),'utf8');
 const originalGuard=(await db.query("select pg_get_functiondef('public.guard_reporter_story_provenance()'::regprocedure) as definition")).rows[0].definition;
 await db.exec(sql);
 const updatedGuard=(await db.query("select pg_get_functiondef('public.guard_reporter_story_provenance()'::regprocedure) as definition")).rows[0].definition;
 assert.equal(updatedGuard.replace('begin\n  if private.is_editors_pick_change(old,new) then return new; end if;\n','begin'),originalGuard);
 const get=async()=> (await db.query('select *,updated_at::text as updated_at from stories where id=$1',[id])).rows[0];
 assert.equal((await get()).editorial_placement_explicit,false);assert.equal((await get()).is_featured,true);
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${editor}',false);`);
 const act=async(selected,stamp)=>(await db.query('select set_story_editors_pick($1,$2,$3) as result',[id,selected,stamp??(await get()).updated_at])).rows[0].result;
 // Fetch timestamps as owner; authenticated has no direct story-table grant.
 await db.exec('reset role');const stamp=(await get()).updated_at;await db.exec('set role authenticated');
 assert.equal((await act(false,stamp)).code,'SUCCESS');assert.equal((await act(true,stamp)).code,'CONFLICT');
 await db.exec('reset role');let row=await get();assert.equal(row.is_featured,false);assert.equal(row.status,'published');assert.equal(row.editorial_placement_explicit,true);
 await db.exec('set role authenticated');assert.equal((await act(true,row.updated_at)).code,'SUCCESS');await db.exec('reset role');row=await get();assert.equal(row.is_featured,true);
 await db.exec('set role authenticated');assert.equal((await act(true,row.updated_at)).code,'SUCCESS');await db.exec('reset role');
 for(const deniedRole of ['writer','reporter']){await db.exec(`update profiles set role='${deniedRole}';set role authenticated`);assert.equal((await act(false,row.updated_at)).code,'FORBIDDEN');await db.exec('reset role');}
 await db.exec('set role anon');await assert.rejects(db.query('select set_story_editors_pick($1,false,now())',[id]),/permission denied/);await db.exec('reset role');
 await db.exec(`insert into stories(id,status) values('00000000-0000-4000-8000-000000000003','draft');update stories set status='approved' where id<>'${id}';update stories set status='scheduled' where id<>'${id}';update stories set status='published',published_at=now() where id<>'${id}';`);
 await db.exec("update stories set status='published',published_at=now() where id in ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000005')");
 const policies=(await db.query('select id,editorial_placement_explicit from stories order by id')).rows;
 assert.equal(policies.find(s=>s.id.endsWith('004')).editorial_placement_explicit,true);
 assert.equal(policies.find(s=>s.id.endsWith('005')).editorial_placement_explicit,false);
 const fresh=(await db.query(`select * from stories where id<>'${id}'`)).rows[0];assert.equal(fresh.editorial_placement_explicit,true);assert.equal(fresh.is_featured,false);assert.equal(fresh.status,'published');
 await assert.rejects(db.query('update stories set editorial_placement_explicit=false where id=$1',[id]),/policy cannot be reset/);
 assert.equal((await db.query('select count(*)::int as n from audit_events')).rows[0].n,2);
 }finally{await db.close();}
});
