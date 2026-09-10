import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const A="5bb2dadc-f94b-4c7e-92c1-46f1d475689f", B="be268377-f993-402c-9c37-2de5b365467f";
test("public Hero RPC enforces locale, publication, schedules and private table boundaries",async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table languages(id uuid primary key,code text,is_active boolean);
 create table homepage_configurations(id uuid primary key,language_id uuid);
 create table homepage_sections(id uuid primary key,homepage_configuration_id uuid,configuration jsonb,block_type text,enabled boolean,starts_at timestamptz,ends_at timestamptz,position integer);
 create table stories(id uuid primary key,language_id uuid,status text,published_at timestamptz);
 create view public_stories as select * from stories where status='published' and published_at<=now();
 insert into languages values ('00000000-0000-4000-8000-000000000001','en',true),('00000000-0000-4000-8000-000000000002','hi',true),('00000000-0000-4000-8000-000000000003','mr',true);
 insert into homepage_configurations values ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001');
 insert into homepage_sections values ('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000010','{"storyId":"${B}","privateNote":"never public"}','hero-story',true,null,null,0);
 insert into stories values ('${B}','00000000-0000-4000-8000-000000000001','published',now()-interval '1 day');
 alter table homepage_configurations enable row level security;
 alter table homepage_sections enable row level security;
 revoke all on homepage_configurations,homepage_sections,stories from anon,authenticated;`);
 await db.exec(await readFile(new URL("../../../../supabase/migrations/20260910110000_public_homepage_hero.sql",import.meta.url),"utf8"));
 const read=async(locale="en")=>{await db.exec("set role anon");try{return (await db.query("select get_public_homepage_hero($1) as id",[locale])).rows[0].id;}finally{await db.exec("reset role");}};
 assert.equal(await read(),B);assert.equal(await read("hi"),null);assert.equal(await read("mr"),null);assert.equal(await read("xx"),null);
 await db.exec("set role anon");
 await assert.rejects(db.query("select * from homepage_configurations"),/permission denied/);
 await assert.rejects(db.query("select * from homepage_sections"),/permission denied/);
 await assert.rejects(db.query("update homepage_sections set enabled=false"),/permission denied/);
 await db.exec("reset role");
 for(const update of ["enabled=false","starts_at=now()+interval '1 day'","starts_at=now()-interval '2 days',ends_at=now()-interval '1 day'"]){await db.exec(`update homepage_sections set ${update}`);assert.equal(await read(),null);await db.exec("update homepage_sections set enabled=true,starts_at=null,ends_at=null");}
 for(const update of ["status='draft'","published_at=null","published_at=now()+interval '1 day'","language_id='00000000-0000-4000-8000-000000000002'"]){await db.exec(`update stories set ${update}`);assert.equal(await read(),null);await db.exec("update stories set status='published',published_at=now()-interval '1 day',language_id='00000000-0000-4000-8000-000000000001'");}
 for(const id of [A,"invalid"]){await db.query("update homepage_sections set configuration=jsonb_build_object('storyId',$1::text)",[id]);assert.equal(await read(),null);}
 } finally { await db.close(); }
});
