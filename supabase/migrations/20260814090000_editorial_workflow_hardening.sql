-- M10.1: harden the existing Story lifecycle without replacing it.

create or replace function public.is_story_public(
  p_status public.story_status,
  p_published_at timestamptz
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_status = 'published'
    and p_published_at is not null
    and p_published_at <= statement_timestamp();
$$;

revoke all on function public.is_story_public(public.story_status, timestamptz) from public;
grant execute on function public.is_story_public(public.story_status, timestamptz) to anon, authenticated, service_role;

drop policy "Public can read published stories" on public.stories;
create policy "Public can read eligible stories"
on public.stories
for select
to anon, authenticated
using (public.is_story_public(status, published_at));

drop policy "Public can read media for published stories" on public.media;
create policy "Public can read media for eligible stories"
on public.media
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.stories
    where stories.id = media.story_id
      and public.is_story_public(stories.status, stories.published_at)
  )
);

create table public.story_events (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  command text not null,
  from_status public.story_status,
  to_status public.story_status,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint story_events_command_check check (length(btrim(command)) > 0),
  constraint story_events_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create index story_events_story_id_created_at_idx
  on public.story_events (story_id, created_at desc);

alter table public.story_events enable row level security;

revoke all on table public.story_events from anon, authenticated;
grant select on table public.story_events to authenticated;
grant all on table public.story_events to service_role;

create policy "Writers can read events for their own stories"
on public.story_events
for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'writer'
  and exists (
    select 1
    from public.stories
    where stories.id = story_events.story_id
      and stories.created_by = (select auth.uid())
  )
);

create policy "Editors and admins can read story events"
on public.story_events
for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') in ('editor', 'admin')
);

create or replace function public.transition_story(
  p_story_id uuid,
  p_command text,
  p_expected_updated_at timestamptz,
  p_scheduled_at timestamptz default null,
  p_rejection_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_story public.stories%rowtype;
  v_actor_id uuid := auth.uid();
  v_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  v_now timestamptz := clock_timestamp();
  v_from_status public.story_status;
  v_to_status public.story_status;
  v_is_owner boolean;
  v_is_external boolean;
  v_allowed boolean := false;
  v_reason text := nullif(btrim(p_rejection_reason), '');
begin
  if v_actor_id is null or v_role not in ('writer', 'editor', 'admin') then
    return jsonb_build_object('code', 'FORBIDDEN');
  end if;

  if not exists (
    select 1
    from public.profiles
    where profiles.id = v_actor_id
      and profiles.is_active
      and profiles.role::text = v_role
  ) then
    return jsonb_build_object('code', 'FORBIDDEN');
  end if;

  select * into v_story
  from public.stories
  where stories.id = p_story_id
  for update;

  if not found then
    return jsonb_build_object('code', 'NOT_FOUND');
  end if;

  if v_story.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object(
      'code', 'CONFLICT',
      'updatedAt', v_story.updated_at
    );
  end if;

  v_from_status := v_story.status;
  v_is_owner := v_story.created_by = v_actor_id;
  v_is_external := v_story.story_type = 'external_article';

  if v_role = 'writer' then
    v_allowed := p_command = 'submit' and v_from_status = 'draft' and v_is_owner;
  elsif v_role = 'editor' then
    v_allowed :=
      (p_command in ('approve', 'reject') and v_from_status = 'pending_review')
      or (p_command in ('approve', 'reject') and v_from_status = 'draft' and v_is_external)
      or (p_command in ('publish', 'schedule', 'archive') and v_from_status = 'approved')
      or (p_command in ('publish', 'schedule', 'cancel_schedule', 'archive') and v_from_status = 'scheduled')
      or (p_command in ('unpublish', 'archive') and v_from_status = 'published')
      or (p_command = 'send_back' and v_from_status = 'rejected');
  elsif v_role = 'admin' then
    v_allowed :=
      (p_command in ('submit', 'approve', 'reject') and v_from_status in ('draft', 'pending_review'))
      or (p_command in ('publish', 'schedule') and v_from_status in ('draft', 'pending_review', 'approved'))
      or (p_command in ('publish', 'schedule', 'cancel_schedule', 'archive') and v_from_status = 'scheduled')
      or (p_command in ('unpublish', 'archive') and v_from_status = 'published')
      or (p_command = 'archive' and v_from_status = 'approved')
      or (p_command = 'send_back' and v_from_status = 'rejected');
  end if;

  if not v_allowed then
    return jsonb_build_object('code', 'INVALID_TRANSITION');
  end if;

  if p_command = 'reject' and (
    v_reason is null
    or char_length(v_reason) > 1000
    or v_reason ~ '[[:cntrl:]]'
  ) then
    return jsonb_build_object('code', 'VALIDATION_ERROR');
  end if;

  if p_command = 'schedule' and (p_scheduled_at is null or p_scheduled_at <= v_now) then
    return jsonb_build_object('code', 'INVALID_SCHEDULE');
  end if;

  if p_command = 'submit' then
    v_to_status := 'pending_review';
    update public.stories set
      status = v_to_status,
      submitted_at = coalesce(submitted_at, v_now),
      updated_at = v_now
    where id = p_story_id;
  elsif p_command = 'approve' then
    v_to_status := 'approved';
    update public.stories set
      status = v_to_status,
      submitted_at = coalesce(submitted_at, v_now),
      approved_by = v_actor_id,
      approved_at = v_now,
      rejected_at = null,
      rejection_reason = null,
      updated_at = v_now
    where id = p_story_id;
  elsif p_command = 'reject' then
    v_to_status := 'rejected';
    update public.stories set
      status = v_to_status,
      submitted_at = coalesce(submitted_at, v_now),
      rejected_at = v_now,
      rejection_reason = v_reason,
      scheduled_at = null,
      published_at = null,
      updated_at = v_now
    where id = p_story_id;
  elsif p_command = 'send_back' then
    v_to_status := 'draft';
    update public.stories set
      status = v_to_status,
      submitted_at = null,
      approved_by = null,
      approved_at = null,
      rejected_at = null,
      rejection_reason = null,
      scheduled_at = null,
      published_at = null,
      updated_at = v_now
    where id = p_story_id;
  elsif p_command = 'publish' then
    v_to_status := 'published';
    update public.stories set
      status = v_to_status,
      submitted_at = coalesce(submitted_at, v_now),
      approved_by = coalesce(approved_by, v_actor_id),
      approved_at = coalesce(approved_at, v_now),
      rejected_at = null,
      rejection_reason = null,
      scheduled_at = null,
      published_at = v_now,
      updated_at = v_now
    where id = p_story_id;
  elsif p_command = 'schedule' then
    v_to_status := 'scheduled';
    update public.stories set
      status = v_to_status,
      submitted_at = coalesce(submitted_at, v_now),
      approved_by = coalesce(approved_by, v_actor_id),
      approved_at = coalesce(approved_at, v_now),
      rejected_at = null,
      rejection_reason = null,
      scheduled_at = p_scheduled_at,
      published_at = null,
      updated_at = v_now
    where id = p_story_id;
  elsif p_command = 'cancel_schedule' then
    v_to_status := 'approved';
    update public.stories set
      status = v_to_status,
      scheduled_at = null,
      published_at = null,
      updated_at = v_now
    where id = p_story_id;
  elsif p_command = 'unpublish' then
    v_to_status := 'approved';
    update public.stories set
      status = v_to_status,
      scheduled_at = null,
      published_at = null,
      updated_at = v_now
    where id = p_story_id;
  elsif p_command = 'archive' then
    v_to_status := 'archived';
    update public.stories set
      status = v_to_status,
      updated_at = v_now
    where id = p_story_id;
  else
    return jsonb_build_object('code', 'INVALID_TRANSITION');
  end if;

  insert into public.story_events (
    story_id, actor_id, command, from_status, to_status, metadata, created_at
  ) values (
    p_story_id,
    v_actor_id,
    p_command,
    v_from_status,
    v_to_status,
    case
      when p_command = 'schedule' then jsonb_build_object('scheduledAt', p_scheduled_at)
      when p_command = 'reject' then jsonb_build_object('reason', v_reason)
      else '{}'::jsonb
    end,
    v_now
  );

  select * into v_story from public.stories where stories.id = p_story_id;
  return jsonb_build_object(
    'code', 'SUCCESS',
    'story', to_jsonb(v_story)
  );
end;
$$;

revoke all on function public.transition_story(uuid, text, timestamptz, timestamptz, text) from public;
grant execute on function public.transition_story(uuid, text, timestamptz, timestamptz, text) to authenticated;

comment on table public.story_events is
  'Append-only lifecycle events written by trusted Story transition mechanisms.';
