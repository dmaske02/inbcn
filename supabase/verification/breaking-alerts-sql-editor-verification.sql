-- Breaking Alerts remote verification for the linked DEVELOPMENT project.
-- Run the entire script in Supabase SQL Editor as a database owner.
-- It creates no persistent objects and always ends with ROLLBACK.

begin;

-- ---------------------------------------------------------------------------
-- 1. Schema, trigger, indexes, constraints, foreign keys, RLS, and policies
-- ---------------------------------------------------------------------------
do $$
declare
  missing text[];
begin
  if to_regclass('public.breaking_alerts') is null then
    raise exception 'FAIL schema: public.breaking_alerts does not exist';
  end if;

  if to_regprocedure('public.set_updated_at()') is null then
    raise exception 'FAIL schema: public.set_updated_at() does not exist';
  end if;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'breaking_alerts' and c.relrowsecurity
  ) then
    raise exception 'FAIL schema: RLS is not enabled on public.breaking_alerts';
  end if;

  if (select count(*) from pg_trigger t join pg_proc p on p.oid = t.tgfoid
      where not t.tgisinternal and p.oid = 'public.set_updated_at()'::regprocedure) <> 1 then
    raise exception 'FAIL trigger: set_updated_at() must be attached exactly once';
  end if;

  if not exists (
    select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal and p.oid = 'public.set_updated_at()'::regprocedure
      and n.nspname = 'public' and c.relname = 'breaking_alerts'
      and t.tgname = 'set_breaking_alerts_updated_at'
  ) then
    raise exception 'FAIL trigger: expected trigger is not attached to breaking_alerts';
  end if;

  select array_agg(expected_name) into missing from unnest(array[
    'breaking_alerts_active_schedule_idx','breaking_alerts_language_idx',
    'breaking_alerts_category_idx','breaking_alerts_story_idx',
    'breaking_alerts_priority_idx','breaking_alerts_cms_pagination_idx'
  ]) expected_name where not exists (
    select 1 from pg_indexes i where i.schemaname = 'public'
      and i.tablename = 'breaking_alerts' and i.indexname = expected_name
  );
  if missing is not null then raise exception 'FAIL indexes: missing %', missing; end if;

  select array_agg(expected_name) into missing from unnest(array[
    'breaking_alerts_title_check','breaking_alerts_message_check','breaking_alerts_type_check',
    'breaking_alerts_placement_check','breaking_alerts_status_check',
    'breaking_alerts_target_scope_check','breaking_alerts_priority_check',
    'breaking_alerts_background_color_check','breaking_alerts_text_color_check',
    'breaking_alerts_schedule_check','breaking_alerts_target_check'
  ]) expected_name where not exists (
    select 1 from pg_constraint c where c.conrelid = 'public.breaking_alerts'::regclass
      and c.conname = expected_name and c.contype = 'c'
  );
  if missing is not null then raise exception 'FAIL constraints: missing %', missing; end if;

  select array_agg(expected_name) into missing from unnest(array[
    'breaking_alerts_language_id_fkey','breaking_alerts_category_id_fkey',
    'breaking_alerts_story_id_fkey','breaking_alerts_created_by_fkey'
  ]) expected_name where not exists (
    select 1 from pg_constraint c where c.conrelid = 'public.breaking_alerts'::regclass
      and c.conname = expected_name and c.contype = 'f'
  );
  if missing is not null then raise exception 'FAIL foreign keys: missing %', missing; end if;

  select array_agg(expected_name) into missing from unnest(array[
    'Public can read visible breaking alerts','Editors can read all breaking alerts',
    'Editors can create breaking alerts','Editors can update breaking alerts',
    'Admins can manage breaking alerts'
  ]) expected_name where not exists (
    select 1 from pg_policies p where p.schemaname = 'public'
      and p.tablename = 'breaking_alerts' and p.policyname = expected_name
  );
  if missing is not null then raise exception 'FAIL policies: missing %', missing; end if;

  raise notice 'PASS 1: table, function, exclusive trigger attachment, indexes, constraints, foreign keys, RLS, and policies verified';
end $$;

-- Required existing development fixtures. No existing rows are modified.
do $$
begin
  if not exists (select 1 from public.languages where is_active) then
    raise exception 'FAIL prerequisite: development project has no active language';
  end if;
  if not exists (select 1 from public.profiles where role = 'editor' and is_active) then
    raise exception 'FAIL prerequisite: development project has no active editor profile';
  end if;
  if not exists (select 1 from public.profiles where role = 'admin' and is_active) then
    raise exception 'FAIL prerequisite: development project has no active admin profile';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. updated_at trigger verification
-- ---------------------------------------------------------------------------
create temporary table verify_alert_ids (id uuid primary key, scenario text not null);
grant select,insert,update,delete on verify_alert_ids to anon,authenticated;

with inserted as (
  insert into public.breaking_alerts (
    title,message,type,placement,status,is_active,priority,target_scope,
    language_id,background_color,text_color,dismissible,start_at,created_at,updated_at
  )
  select 'VERIFY trigger ' || gen_random_uuid(), 'Temporary trigger verification',
    'alert','pinned_banner','draft',false,50,'global',id,'#123456','#FFFFFF',true,now(),
    now()-interval '1 minute',now()-interval '1 minute'
  from public.languages where is_active order by code limit 1
  returning id,created_at,updated_at
), tracked as (
  insert into verify_alert_ids select id,'trigger' from inserted returning id
)
select pg_sleep(0.02) from tracked;

update public.breaking_alerts a set message = 'Temporary trigger verification updated'
where a.id = (select id from verify_alert_ids where scenario = 'trigger');

do $$
declare c timestamptz; u timestamptz;
begin
  select created_at,updated_at into c,u from public.breaking_alerts
  where id = (select id from verify_alert_ids where scenario = 'trigger');
  if c is null or u is null or c <> now()-interval '1 minute' or u <> now() or u <= c then
    raise exception 'FAIL trigger: expected unchanged created_at (%) and trigger-updated updated_at (%), got % and %',
      now()-interval '1 minute',now(),c,u;
  end if;
  raise notice 'PASS 2: INSERT preserved created_at and UPDATE advanced updated_at (% -> %)',c,u;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Anonymous RLS and scheduling/expiry verification
-- ---------------------------------------------------------------------------
insert into public.breaking_alerts (
  title,message,type,placement,status,is_active,priority,target_scope,
  language_id,background_color,text_color,dismissible,start_at,end_at
)
select 'VERIFY ' || scenario || ' ' || gen_random_uuid(),scenario,'alert','pinned_banner',status,is_active,
  50,'global',l.id,'#123456','#FFFFFF',true,start_at,end_at
from (select id from public.languages where is_active order by code limit 1) l
cross join (values
  ('anonymous-visible','active',true,now()-interval '1 minute',now()+interval '1 hour'),
  ('anonymous-draft','draft',false,now()-interval '1 minute',now()+interval '1 hour'),
  ('anonymous-archived','archived',false,now()-interval '1 minute',now()+interval '1 hour'),
  ('anonymous-future','active',true,now()+interval '1 hour',now()+interval '2 hours'),
  ('anonymous-expired','active',true,now()-interval '2 hours',now()-interval '1 hour')
) v(scenario,status,is_active,start_at,end_at)
returning id,replace(split_part(title,' ',2),' ','');

insert into verify_alert_ids(id,scenario)
select id, message from public.breaking_alerts where message like 'anonymous-%';

set local role anon;
do $$
declare visible_count integer; forbidden_count integer;
begin
  select count(*) into visible_count from public.breaking_alerts
  where id in (select id from verify_alert_ids) and message = 'anonymous-visible';
  select count(*) into forbidden_count from public.breaking_alerts
  where id in (select id from verify_alert_ids) and message in (
    'anonymous-draft','anonymous-archived','anonymous-future','anonymous-expired'
  );
  if visible_count <> 1 or forbidden_count <> 0 then
    raise exception 'FAIL anonymous RLS: visible %, forbidden visible %',visible_count,forbidden_count;
  end if;
  raise notice 'PASS 3A: anonymous sees active/started/unexpired only; draft, archived, future, and expired are hidden';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Editor RLS: create, preview/read draft, edit, schedule, activate,
--    deactivate, archive, and duplicate. Editor delete must be denied.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',json_build_object(
  'sub',(select id from public.profiles where role='editor' and is_active order by created_at limit 1),
  'app_metadata',json_build_object('role','editor')
)::text,true);
set local role authenticated;

with inserted as (
  insert into public.breaking_alerts (
    title,message,type,placement,status,is_active,priority,target_scope,language_id,
    background_color,text_color,dismissible,start_at,created_by
  )
  select 'VERIFY editor ' || gen_random_uuid(),'editor-original','breaking','breaking_ticker',
    'draft',false,20,'global',id,'#8B0000','#FFFFFF',true,now()+interval '30 minutes',auth.uid()
  from public.languages where is_active order by code limit 1 returning id
)
insert into verify_alert_ids select id,'editor-original' from inserted;

do $$ begin
  if (select count(*) from public.breaking_alerts where id=(select id from verify_alert_ids where scenario='editor-original')) <> 1 then
    raise exception 'FAIL editor RLS: editor cannot preview/read own draft';
  end if;
end $$;

update public.breaking_alerts set message='editor-edited',status='active',is_active=true
where id=(select id from verify_alert_ids where scenario='editor-original');
update public.breaking_alerts set is_active=false
where id=(select id from verify_alert_ids where scenario='editor-original');
update public.breaking_alerts set status='archived',is_active=false
where id=(select id from verify_alert_ids where scenario='editor-original');

with duplicated as (
  insert into public.breaking_alerts (
    title,message,type,placement,status,is_active,priority,target_scope,language_id,
    background_color,text_color,dismissible,start_at,created_by
  ) select title||' copy','editor-duplicate',type,placement,'draft',false,priority,target_scope,
    language_id,background_color,text_color,dismissible,start_at,auth.uid()
  from public.breaking_alerts where id=(select id from verify_alert_ids where scenario='editor-original') returning id
)
insert into verify_alert_ids select id,'editor-duplicate' from duplicated;

do $$
declare affected integer;
begin
  delete from public.breaking_alerts where id=(select id from verify_alert_ids where scenario='editor-duplicate');
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL editor RLS: editor unexpectedly deleted an alert'; end if;
  raise notice 'PASS 3B: editor create/read/edit/schedule/activate/deactivate/archive/duplicate succeeded and delete was denied';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. Admin RLS full CRUD
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',json_build_object(
  'sub',(select id from public.profiles where role='admin' and is_active order by created_at limit 1),
  'app_metadata',json_build_object('role','admin')
)::text,true);
set local role authenticated;
with inserted as (
  insert into public.breaking_alerts (
    title,message,type,placement,status,is_active,priority,target_scope,language_id,
    background_color,text_color,dismissible,start_at,created_by
  ) select 'VERIFY admin '||gen_random_uuid(),'admin-original','emergency','emergency_banner',
    'draft',false,1,'global',id,'#B42318','#FFFFFF',false,now(),auth.uid()
  from public.languages where is_active order by code limit 1 returning id
)
insert into verify_alert_ids select id,'admin-original' from inserted;
update public.breaking_alerts set message='admin-updated',status='active',is_active=true
where id=(select id from verify_alert_ids where scenario='admin-original');
delete from public.breaking_alerts where id=(select id from verify_alert_ids where scenario='admin-original');
do $$
begin
  if exists(select 1 from public.breaking_alerts where id=(select id from verify_alert_ids where scenario='admin-original')) then
    raise exception 'FAIL admin RLS: admin delete did not remove row';
  end if;
  raise notice 'PASS 3C: admin full create/read/update/delete succeeded';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 6. Final rollback: removes every VERIFY row and temporary table.
-- ---------------------------------------------------------------------------
rollback;

-- Expected final command result: ROLLBACK
-- Expected Messages/Notices:
-- PASS 1: schema objects and RLS catalog verified
-- PASS 2: created_at preserved and updated_at advanced
-- PASS 3A: anonymous visibility and scheduling verified
-- PASS 3B: editor permissions verified, including denied delete
-- PASS 3C: admin full CRUD verified
