-- Existing rows retain legacy allocation. No backfill or homepage configuration writes.
alter table public.stories add column editorial_placement_explicit boolean not null default false;

create function private.is_editors_pick_change(previous public.stories, proposed public.stories)
returns boolean language sql stable security definer set search_path = '' as $$
 select previous.status = 'published' and proposed.status = 'published'
 and proposed.editorial_placement_explicit
 and (to_jsonb(previous) - array['is_featured','editorial_placement_explicit','updated_at'])
   = (to_jsonb(proposed) - array['is_featured','editorial_placement_explicit','updated_at'])
 and exists(select 1 from public.profiles where id=auth.uid() and role::text in ('editor','admin') and is_active);
$$;
revoke all on function private.is_editors_pick_change(public.stories,public.stories) from public,anon,authenticated;

-- Retain the deployed provenance guard, including later additions, and permit only
-- a published story's authorized placement-only update before its existing checks.
do $$
declare definition text; insertion integer;
begin
 definition := pg_get_functiondef('public.guard_reporter_story_provenance()'::regprocedure);
 insertion := strpos(definition,E'begin\n');
 if insertion=0 then insertion := strpos(definition,E'begin\r\n'); end if;
 if insertion=0 then raise exception 'Unexpected reporter guard definition'; end if;
 definition := overlay(definition placing E'begin\n  if private.is_editors_pick_change(old,new) then return new; end if;\n' from insertion for 5);
 execute definition;
end $$;

create function private.guard_story_editorial_policy()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if tg_op='INSERT' then
   new.editorial_placement_explicit := public.is_reporter_story(new);
 elsif old.editorial_placement_explicit then
   if not new.editorial_placement_explicit then raise exception 'Editorial policy cannot be reset'; end if;
 elsif new.editorial_placement_explicit and not private.is_editors_pick_change(old,new) then
   raise exception 'Unauthorized editorial policy change';
 elsif public.is_reporter_story(new) and new.status='published'
   and old.status<>'published' and old.published_at is null
   and not exists(select 1 from public.story_revisions r where r.story_id=old.id
     and r.review_outcome in ('published','direct_published') and r.reviewed_at < statement_timestamp()) then
   new.editorial_placement_explicit := true;
 end if;
 return new;
end;
$$;
revoke all on function private.guard_story_editorial_policy() from public,anon,authenticated;
create trigger zz_story_editorial_policy before insert or update on public.stories
for each row execute function private.guard_story_editorial_policy();

create function public.set_story_editors_pick(p_story_id uuid,p_selected boolean,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_story public.stories%rowtype;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role::text in ('editor','admin') and is_active) then
   return jsonb_build_object('code','FORBIDDEN');
 end if;
 if p_selected is null or p_expected_updated_at is null then return jsonb_build_object('code','VALIDATION_ERROR'); end if;
 select * into current_story from public.stories where id=p_story_id for update;
 if not found then return jsonb_build_object('code','NOT_FOUND'); end if;
 if current_story.updated_at is distinct from p_expected_updated_at then return jsonb_build_object('code','CONFLICT'); end if;
 if current_story.status<>'published' or current_story.published_at is null or current_story.published_at>now() then
   return jsonb_build_object('code','INVALID_TRANSITION');
 end if;
 if current_story.is_featured=p_selected and current_story.editorial_placement_explicit then return jsonb_build_object('code','SUCCESS'); end if;
 update public.stories set is_featured=p_selected,editorial_placement_explicit=true,updated_at=clock_timestamp() where id=p_story_id;
 insert into public.audit_events(actor_id,action,subject_type,subject_id,metadata)
 values(auth.uid(),'story.editors_pick_changed','story',p_story_id,jsonb_build_object('selected',p_selected));
 return jsonb_build_object('code','SUCCESS');
end;
$$;
revoke all on function public.set_story_editors_pick(uuid,boolean,timestamptz) from public,anon;
grant execute on function public.set_story_editors_pick(uuid,boolean,timestamptz) to authenticated;

-- Append only the public policy bit, preserving all deployed projection columns
-- (including canonical media and later additions) and the existing view grants.
do $$
declare previous_definition text;
begin
 previous_definition := rtrim(pg_get_viewdef('public.public_stories'::regclass,true),E';\n ');
 execute 'create or replace view public.public_stories with (security_barrier=true) as select projection.*, story.editorial_placement_explicit from ('
   ||previous_definition||') projection join public.stories story on story.id=projection.id';
end $$;
