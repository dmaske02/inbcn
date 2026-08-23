-- Private reporter-request and recording lifecycle. This does not alter the
-- existing public live_streams channel model.

create table public.reporter_live_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 240),
  purpose text not null check (length(btrim(purpose)) between 1 and 2000),
  intended_locality text not null check (length(btrim(intended_locality)) between 1 and 200),
  expected_starts_at timestamptz not null,
  expected_duration_minutes integer not null check (expected_duration_minutes between 1 and 480),
  supporting_notes text check (supporting_notes is null or length(btrim(supporting_notes)) between 1 and 2000),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'terminated')),
  decided_by uuid references public.profiles (id) on delete restrict,
  decided_at timestamptz,
  decision_reason text check (decision_reason is null or length(btrim(decision_reason)) between 1 and 2000),
  approved_starts_at timestamptz,
  approved_ends_at timestamptz,
  livekit_room_name text unique,
  terminated_by uuid references public.profiles (id) on delete restrict,
  terminated_at timestamptz,
  termination_reason text check (termination_reason is null or length(btrim(termination_reason)) between 1 and 2000),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  constraint reporter_live_requests_state_check check (
    (status = 'pending'
      and decided_by is null and decided_at is null and decision_reason is null
      and approved_starts_at is null and approved_ends_at is null and livekit_room_name is null
      and terminated_by is null and terminated_at is null and termination_reason is null)
    or (status = 'approved'
      and decided_by is not null and decided_at is not null and decision_reason is null
      and approved_starts_at is not null and approved_ends_at is not null
      and approved_ends_at > approved_starts_at
      and livekit_room_name is not null
      and livekit_room_name = 'reporter-live-' || replace(id::text, '-', '')
      and terminated_by is null and terminated_at is null and termination_reason is null)
    or (status = 'rejected'
      and decided_by is not null and decided_at is not null and decision_reason is not null
      and approved_starts_at is null and approved_ends_at is null and livekit_room_name is null
      and terminated_by is null and terminated_at is null and termination_reason is null)
    or (status = 'terminated'
      and decided_by is not null and decided_at is not null and decision_reason is null
      and approved_starts_at is not null and approved_ends_at is not null
      and approved_ends_at > approved_starts_at
      and livekit_room_name is not null
      and livekit_room_name = 'reporter-live-' || replace(id::text, '-', '')
      and terminated_by is not null and terminated_at is not null and termination_reason is not null)
  )
);

create index reporter_live_requests_reporter_created_idx
  on public.reporter_live_requests (profile_id, created_at desc, id desc);

create index reporter_live_requests_admin_queue_idx
  on public.reporter_live_requests (expected_starts_at, id)
  where status = 'pending';

create table public.live_recordings (
  id uuid primary key default gen_random_uuid(),
  live_request_id uuid not null references public.reporter_live_requests (id) on delete restrict,
  live_stream_id uuid references public.live_streams (id) on delete restrict,
  egress_id text,
  recording_status text not null default 'pending'
    check (recording_status in ('pending', 'recording', 'completed', 'failed')),
  storage_key text,
  duration_seconds numeric(12, 3),
  bytes bigint,
  checksum text,
  provider_error text,
  private_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(private_metadata) = 'object'),
  recording_started_at timestamptz,
  recording_completed_at timestamptz,
  replay_status text not null default 'private'
    check (replay_status in ('private', 'published', 'rejected')),
  replay_title text,
  replay_description text,
  replay_category_id uuid references public.categories (id) on delete restrict,
  replay_thumbnail_media_id uuid references public.media (id) on delete restrict,
  replay_published_at timestamptz,
  replay_rejected_at timestamptz,
  retention_delete_at timestamptz,
  legal_hold boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  constraint live_recordings_egress_id_check check (
    egress_id is null or length(btrim(egress_id)) between 1 and 255
  ),
  constraint live_recordings_storage_key_check check (
    storage_key is null or length(btrim(storage_key)) between 1 and 1024
  ),
  constraint live_recordings_duration_seconds_check check (
    duration_seconds is null or duration_seconds > 0
  ),
  constraint live_recordings_bytes_check check (
    bytes is null or bytes > 0
  ),
  constraint live_recordings_output_check check (
    (recording_status = 'pending'
      and recording_started_at is null and recording_completed_at is null
      and storage_key is null and duration_seconds is null and bytes is null)
    or (recording_status = 'recording'
      and recording_started_at is not null and recording_completed_at is null
      and storage_key is null and duration_seconds is null and bytes is null)
    or (recording_status = 'completed'
      and recording_started_at is not null and recording_completed_at is not null
      and storage_key is not null and duration_seconds is not null and duration_seconds > 0
      and bytes is not null and bytes > 0)
    or (recording_status = 'failed'
      and recording_started_at is not null and recording_completed_at is not null
      and provider_error is not null and length(btrim(provider_error)) between 1 and 4000)
  ),
  constraint live_recordings_replay_check check (
    (replay_status = 'private'
      and replay_published_at is null and replay_rejected_at is null)
    or (replay_status = 'published'
      and recording_status = 'completed'
      and replay_title is not null and length(btrim(replay_title)) between 1 and 240
      and replay_description is not null and length(btrim(replay_description)) between 1 and 4000
      and replay_category_id is not null and replay_thumbnail_media_id is not null
      and replay_published_at is not null and replay_rejected_at is null
      and retention_delete_at is null)
    or (replay_status = 'rejected'
      and recording_status in ('completed', 'failed')
      and replay_published_at is null and replay_rejected_at is not null)
  )
);

create unique index live_recordings_egress_id_key
  on public.live_recordings (egress_id)
  where egress_id is not null;

create index live_recordings_request_created_idx
  on public.live_recordings (live_request_id, created_at desc, id desc);

create index live_recordings_retention_idx
  on public.live_recordings (retention_delete_at, id)
  where retention_delete_at is not null and not legal_hold;

comment on table public.reporter_live_requests is
  'Private reporter requests. Each approved LiveKit room is derived from this request UUID and can be terminated only by an admin command.';
comment on table public.live_recordings is
  'Private LiveKit Egress segments. Storage/provider fields never belong in public projections or generic audit metadata.';
comment on column public.live_recordings.retention_delete_at is
  'Database-owned deadline: terminal unpublished or rejected recordings are eligible after 90 days unless legal_hold is true; published recordings have no deadline.';

create function public.set_live_recording_lifecycle_clocks()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  transition_time timestamptz := clock_timestamp();
  is_terminal boolean;
  became_terminal boolean;
begin
  is_terminal := new.recording_status in ('completed', 'failed');
  became_terminal := tg_op = 'INSERT'
    or old.recording_status not in ('completed', 'failed')
    or old.replay_status is distinct from new.replay_status;

  new.updated_at := transition_time;
  if tg_op = 'INSERT' then
    if new.recording_status in ('recording', 'completed', 'failed') then
      new.recording_started_at := transition_time;
    end if;
    if is_terminal then
      new.recording_completed_at := transition_time;
    end if;
  elsif new.recording_status is distinct from old.recording_status then
    if old.recording_status in ('completed', 'failed') then
      raise exception using errcode = '55000', message = 'LIVE_RECORDING_TRANSITION_INVALID';
    end if;
    if new.recording_status = 'recording' then
      new.recording_started_at := transition_time;
      new.recording_completed_at := null;
    elsif is_terminal then
      new.recording_started_at := coalesce(old.recording_started_at, transition_time);
      new.recording_completed_at := transition_time;
    else
      raise exception using errcode = '55000', message = 'LIVE_RECORDING_TRANSITION_INVALID';
    end if;
  else
    new.recording_started_at := old.recording_started_at;
    new.recording_completed_at := old.recording_completed_at;
  end if;

  if new.replay_status = 'published' then
    new.retention_delete_at := null;
  elsif is_terminal then
    if became_terminal then
      new.retention_delete_at := transition_time + interval '90 days';
    else
      new.retention_delete_at := old.retention_delete_at;
    end if;
  else
    new.retention_delete_at := null;
  end if;
  return new;
end;
$$;

create trigger set_live_recording_lifecycle_clocks
before insert or update on public.live_recordings
for each row execute function public.set_live_recording_lifecycle_clocks();

create function public.audit_reporter_live_request_creation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata, created_at)
  values (
    auth.uid(),
    'reporter_live_request.created',
    'reporter_live_request',
    new.id,
    '{"status":"pending"}'::jsonb,
    new.created_at
  );
  return new;
end;
$$;

create trigger audit_reporter_live_request_creation
after insert on public.reporter_live_requests
for each row execute function public.audit_reporter_live_request_creation();

create function public.approve_reporter_live_request(
  p_request_id uuid,
  p_approved_starts_at timestamptz,
  p_approved_ends_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  current_request public.reporter_live_requests%rowtype;
  current_reporter public.reporter_profiles%rowtype;
  current_profile public.profiles%rowtype;
  decision_time timestamptz;
begin
  if actor_id is null or actor_role is distinct from 'admin'
    or not exists (
      select 1 from public.profiles
      where profiles.id = actor_id and profiles.role = 'admin' and profiles.is_active
    ) then
    raise exception using errcode = '42501', message = 'REPORTER_LIVE_APPROVAL_FORBIDDEN';
  end if;
  select * into current_request from public.reporter_live_requests
  where id = p_request_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'REPORTER_LIVE_REQUEST_NOT_FOUND';
  end if;
  select * into current_reporter from public.reporter_profiles
  where profile_id = current_request.profile_id for update;
  select * into current_profile from public.profiles
  where id = current_request.profile_id for update;
  decision_time := clock_timestamp();

  if current_request.status not in ('pending', 'approved') then
    raise exception using errcode = 'P0001', message = 'REPORTER_LIVE_REQUEST_INVALID_STATE';
  end if;
  if current_reporter.profile_id is null or current_profile.id is null
    or current_profile.role is distinct from 'reporter' or not current_profile.is_active
    or current_reporter.public_status is distinct from 'active'
    or current_reporter.membership_started_at > decision_time
    or current_reporter.membership_expires_at < decision_time
    or not current_reporter.can_broadcast_live
    or current_reporter.access_sync_status is distinct from 'succeeded'
    or current_reporter.access_sync_desired_role is distinct from 'reporter' then
    raise exception using errcode = '42501', message = 'REPORTER_LIVE_REQUEST_INELIGIBLE';
  end if;
  if current_request.status = 'approved' then
    if current_request.approved_starts_at is distinct from p_approved_starts_at
      or current_request.approved_ends_at is distinct from p_approved_ends_at then
      raise exception using errcode = '23505', message = 'REPORTER_LIVE_REQUEST_CONFLICT';
    end if;
    return current_request.id;
  end if;
  if p_approved_starts_at is null or p_approved_ends_at is null
    or p_approved_ends_at <= p_approved_starts_at then
    raise exception using errcode = '22023', message = 'REPORTER_LIVE_WINDOW_INVALID';
  end if;
  if p_approved_ends_at > p_approved_starts_at
    + make_interval(mins => current_request.expected_duration_minutes) then
    raise exception using errcode = '22023', message = 'REPORTER_LIVE_WINDOW_INVALID';
  end if;

  update public.reporter_live_requests
  set status = 'approved',
      decided_by = actor_id,
      decided_at = decision_time,
      approved_starts_at = p_approved_starts_at,
      approved_ends_at = p_approved_ends_at,
      livekit_room_name = 'reporter-live-' || replace(current_request.id::text, '-', ''),
      updated_at = decision_time
  where id = current_request.id;

  insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata, created_at)
  values (actor_id, 'reporter_live_request.approved', 'reporter_live_request', current_request.id, '{"status":"approved"}'::jsonb, decision_time);
  insert into public.reporter_notifications (profile_id, notification_type, message, delivery_channel, delivery_status, created_at)
  values (current_request.profile_id, 'live_request_decision', 'Your live broadcast request was approved.', 'in_app', 'not_applicable', decision_time);
  return current_request.id;
end;
$$;

create function public.reject_reporter_live_request(
  p_request_id uuid,
  p_decision_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  current_request public.reporter_live_requests%rowtype;
  decision_time timestamptz;
  normalized_decision_reason text := btrim(p_decision_reason);
begin
  if actor_id is null or actor_role is distinct from 'admin'
    or not exists (
      select 1 from public.profiles
      where profiles.id = actor_id and profiles.role = 'admin' and profiles.is_active
    ) then
    raise exception using errcode = '42501', message = 'REPORTER_LIVE_REJECTION_FORBIDDEN';
  end if;
  select * into current_request from public.reporter_live_requests
  where id = p_request_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'REPORTER_LIVE_REQUEST_NOT_FOUND';
  end if;
  if current_request.status = 'rejected' then
    if current_request.decision_reason is distinct from normalized_decision_reason then
      raise exception using errcode = '23505', message = 'REPORTER_LIVE_REQUEST_CONFLICT';
    end if;
    return current_request.id;
  end if;
  if current_request.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'REPORTER_LIVE_REQUEST_INVALID_STATE';
  end if;
  if p_decision_reason is null or length(normalized_decision_reason) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'REPORTER_LIVE_DECISION_REASON_REQUIRED';
  end if;
  decision_time := clock_timestamp();

  update public.reporter_live_requests
  set status = 'rejected', decided_by = actor_id, decided_at = decision_time,
      decision_reason = normalized_decision_reason, updated_at = decision_time
  where id = current_request.id;
  insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata, created_at)
  values (actor_id, 'reporter_live_request.rejected', 'reporter_live_request', current_request.id, '{"status":"rejected"}'::jsonb, decision_time);
  insert into public.reporter_notifications (profile_id, notification_type, message, delivery_channel, delivery_status, created_at)
  values (current_request.profile_id, 'live_request_decision', 'Your live broadcast request was not approved.', 'in_app', 'not_applicable', decision_time);
  return current_request.id;
end;
$$;

create function public.terminate_reporter_live_request(
  p_request_id uuid,
  p_termination_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  current_request public.reporter_live_requests%rowtype;
  termination_time timestamptz;
  normalized_termination_reason text := btrim(p_termination_reason);
begin
  if actor_id is null or actor_role is distinct from 'admin'
    or not exists (
      select 1 from public.profiles
      where profiles.id = actor_id and profiles.role = 'admin' and profiles.is_active
    ) then
    raise exception using errcode = '42501', message = 'REPORTER_LIVE_TERMINATION_FORBIDDEN';
  end if;
  select * into current_request from public.reporter_live_requests
  where id = p_request_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'REPORTER_LIVE_REQUEST_NOT_FOUND';
  end if;
  if current_request.status = 'terminated' then
    if current_request.termination_reason is distinct from normalized_termination_reason then
      raise exception using errcode = '23505', message = 'REPORTER_LIVE_REQUEST_CONFLICT';
    end if;
    return current_request.id;
  end if;
  if current_request.status <> 'approved' then
    raise exception using errcode = 'P0001', message = 'REPORTER_LIVE_REQUEST_INVALID_STATE';
  end if;
  if p_termination_reason is null or length(normalized_termination_reason) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'REPORTER_LIVE_TERMINATION_REASON_REQUIRED';
  end if;
  termination_time := clock_timestamp();

  update public.reporter_live_requests
  set status = 'terminated', terminated_by = actor_id, terminated_at = termination_time,
      termination_reason = normalized_termination_reason, updated_at = termination_time
  where id = current_request.id;
  insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata, created_at)
  values (actor_id, 'reporter_live_request.terminated', 'reporter_live_request', current_request.id, '{"status":"terminated"}'::jsonb, termination_time);
  insert into public.reporter_notifications (profile_id, notification_type, message, delivery_channel, delivery_status, created_at)
  values (current_request.profile_id, 'live_request_terminated', 'Your approved live request window was cancelled by the newsroom.', 'in_app', 'not_applicable', termination_time);
  return current_request.id;
end;
$$;

create function public.set_live_recording_legal_hold(
  p_recording_id uuid,
  p_legal_hold boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  current_recording public.live_recordings%rowtype;
  change_time timestamptz := clock_timestamp();
begin
  if actor_id is null or actor_role is distinct from 'admin'
    or not exists (
      select 1 from public.profiles
      where profiles.id = actor_id and profiles.role = 'admin' and profiles.is_active
    ) then
    raise exception using errcode = '42501', message = 'LIVE_RECORDING_LEGAL_HOLD_FORBIDDEN';
  end if;
  if p_legal_hold is null then
    raise exception using errcode = '22023', message = 'LIVE_RECORDING_LEGAL_HOLD_INVALID';
  end if;
  select * into current_recording from public.live_recordings
  where id = p_recording_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'LIVE_RECORDING_NOT_FOUND';
  end if;
  if current_recording.legal_hold is not distinct from p_legal_hold then
    return current_recording.id;
  end if;

  update public.live_recordings
  set legal_hold = p_legal_hold, updated_at = change_time
  where id = current_recording.id;
  insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata, created_at)
  values (actor_id, 'live_recording.legal_hold_changed', 'live_recording', current_recording.id, jsonb_build_object('legal_hold', p_legal_hold), change_time);
  return current_recording.id;
end;
$$;

alter table public.reporter_live_requests enable row level security;
alter table public.live_recordings enable row level security;

revoke all on table public.reporter_live_requests, public.live_recordings
from public, anon, authenticated, service_role;

grant select, insert (profile_id, title, purpose, intended_locality, expected_starts_at, expected_duration_minutes, supporting_notes)
on table public.reporter_live_requests to authenticated;
grant select on table public.live_recordings to authenticated;
grant select, insert (live_request_id, live_stream_id, egress_id, recording_status, storage_key, duration_seconds, bytes, checksum, provider_error, private_metadata),
  update (live_stream_id, egress_id, recording_status, storage_key, duration_seconds, bytes, checksum, provider_error, private_metadata)
on table public.live_recordings to service_role;
grant select on table public.reporter_live_requests to service_role;

create policy "Reporters can read their own live requests"
on public.reporter_live_requests
for select to authenticated
using (profile_id = (select auth.uid()));

create policy "Eligible reporters can create their own pending live requests"
on public.reporter_live_requests
for insert to authenticated
with check (
  profile_id = (select auth.uid())
  and status = 'pending'
  and decided_by is null and decided_at is null and decision_reason is null
  and approved_starts_at is null and approved_ends_at is null and livekit_room_name is null
  and terminated_by is null and terminated_at is null and termination_reason is null
  and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'reporter'
  and exists (
    select 1 from public.profiles
    join public.reporter_profiles on reporter_profiles.profile_id = profiles.id
    where profiles.id = (select auth.uid())
      and profiles.role = 'reporter' and profiles.is_active
      and reporter_profiles.public_status = 'active'
      and reporter_profiles.membership_started_at <= clock_timestamp()
      and reporter_profiles.membership_expires_at >= clock_timestamp()
      and reporter_profiles.can_broadcast_live
      and reporter_profiles.access_sync_status = 'succeeded'
      and reporter_profiles.access_sync_desired_role = 'reporter'
      and (select auth.jwt() -> 'app_metadata' -> 'reporter_access_generation')
        = to_jsonb(reporter_profiles.access_sync_generation)
  )
);

create policy "Active admins can read live requests"
on public.reporter_live_requests
for select to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid()) and profiles.role = 'admin' and profiles.is_active
  )
);

create policy "Active staff can read private live recordings"
on public.live_recordings
for select to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') in ('editor', 'admin')
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role::text = (select auth.jwt() -> 'app_metadata' ->> 'role')
      and profiles.role in ('editor', 'admin') and profiles.is_active
  )
);

revoke all on function public.set_live_recording_lifecycle_clocks()
from public, anon, authenticated, service_role;
revoke all on function public.audit_reporter_live_request_creation()
from public, anon, authenticated, service_role;
revoke all on function public.approve_reporter_live_request(uuid, timestamptz, timestamptz)
from public, anon, authenticated, service_role;
revoke all on function public.reject_reporter_live_request(uuid, text)
from public, anon, authenticated, service_role;
revoke all on function public.terminate_reporter_live_request(uuid, text)
from public, anon, authenticated, service_role;
revoke all on function public.set_live_recording_legal_hold(uuid, boolean)
from public, anon, authenticated, service_role;

grant execute on function public.approve_reporter_live_request(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.reject_reporter_live_request(uuid, text) to authenticated;
grant execute on function public.terminate_reporter_live_request(uuid, text) to authenticated;
grant execute on function public.set_live_recording_legal_hold(uuid, boolean) to authenticated;
