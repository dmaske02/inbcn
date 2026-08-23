-- Service-only coordination for one provider recording start per approved request.

alter table public.live_recordings
  add column recording_claim_token uuid,
  add column recording_claimed_at timestamptz,
  add column recording_attempt_count integer not null default 0
    check (recording_attempt_count >= 0),
  add constraint live_recordings_recording_claim_check check (
    (recording_status = 'pending'
      and recording_claim_token is not null
      and recording_claimed_at is not null
      and recording_attempt_count >= 1)
    or (recording_status <> 'pending'
      and recording_claim_token is null
      and recording_claimed_at is null)
  );

create unique index live_recordings_one_active_per_request
  on public.live_recordings (live_request_id)
  where recording_status in ('pending', 'recording');

comment on column public.live_recordings.recording_claim_token is
  'Service-only CAS token for a pending provider start. Never exposed to browser or audit records.';
comment on column public.live_recordings.recording_claimed_at is
  'Database claim time. Pending claims may be reclaimed after five minutes.';

create function public.reserve_reporter_live_recording(
  p_profile_id uuid,
  p_access_generation bigint,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_owner uuid;
  current_reporter public.reporter_profiles%rowtype;
  current_profile public.profiles%rowtype;
  current_request public.reporter_live_requests%rowtype;
  current_recording public.live_recordings%rowtype;
  reservation_time timestamptz;
  claim_token uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'REPORTER_LIVE_SESSION_FORBIDDEN';
  end if;
  if p_profile_id is null or p_access_generation is null or p_request_id is null then
    raise exception using errcode = '22023', message = 'REPORTER_LIVE_SESSION_INVALID';
  end if;

  select profile_id into request_owner
  from public.reporter_live_requests
  where id = p_request_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'REPORTER_LIVE_REQUEST_NOT_FOUND';
  end if;
  if request_owner is distinct from p_profile_id then
    raise exception using errcode = '42501', message = 'REPORTER_LIVE_SESSION_FORBIDDEN';
  end if;

  select * into current_request
  from public.reporter_live_requests
  where id = p_request_id
  for update;
  if not found or current_request.profile_id is distinct from request_owner
    or current_request.profile_id is distinct from p_profile_id then
    raise exception using errcode = '42501', message = 'REPORTER_LIVE_SESSION_FORBIDDEN';
  end if;
  select * into current_reporter
  from public.reporter_profiles
  where profile_id = p_profile_id
  for update;
  select * into current_profile
  from public.profiles
  where id = p_profile_id
  for update;

  reservation_time := clock_timestamp();
  if current_reporter.profile_id is null or current_profile.id is null
    or current_profile.role is distinct from 'reporter' or not current_profile.is_active
    or current_reporter.public_status is distinct from 'active'
    or current_reporter.membership_started_at > reservation_time
    or current_reporter.membership_expires_at < reservation_time
    or not current_reporter.can_broadcast_live
    or current_reporter.access_sync_status is distinct from 'succeeded'
    or current_reporter.access_sync_desired_role is distinct from 'reporter'
    or current_reporter.access_sync_generation is distinct from p_access_generation
    or current_reporter.access_sync_claim_token is not null
    or current_request.status is distinct from 'approved'
    or current_request.approved_starts_at is null
    or current_request.approved_ends_at is null
    or reservation_time < current_request.approved_starts_at
    or reservation_time >= current_request.approved_ends_at
    or current_request.livekit_room_name is null
    or current_request.livekit_room_name is distinct from
      'reporter-live-' || replace(current_request.id::text, '-', '') then
    raise exception using errcode = '42501', message = 'REPORTER_LIVE_SESSION_FORBIDDEN';
  end if;

  select * into current_recording
  from public.live_recordings
  where live_request_id = current_request.id
    and recording_status in ('pending', 'recording')
  for update;

  if found and current_recording.recording_status = 'recording' then
    return jsonb_build_object(
      'state', 'existing',
      'request_id', current_request.id,
      'recording_id', current_recording.id,
      'recording_state', 'recording',
      'room_name', current_request.livekit_room_name,
      'starts_at', current_request.approved_starts_at,
      'ends_at', current_request.approved_ends_at
    );
  end if;
  if found and current_recording.recording_claimed_at >= reservation_time - interval '5 minutes' then
    return jsonb_build_object('state', 'busy');
  end if;

  claim_token := gen_random_uuid();
  if found then
    update public.live_recordings
    set recording_claim_token = claim_token,
        recording_claimed_at = reservation_time,
        recording_attempt_count = recording_attempt_count + 1,
        updated_at = reservation_time
    where id = current_recording.id;
    return jsonb_build_object(
      'state', 'claimed',
      'request_id', current_request.id,
      'recording_id', current_recording.id,
      'claim_token', claim_token,
      'reclaimed', true,
      'room_name', current_request.livekit_room_name,
      'starts_at', current_request.approved_starts_at,
      'ends_at', current_request.approved_ends_at
    );
  end if;

  insert into public.live_recordings (
    live_request_id, recording_status, recording_claim_token,
    recording_claimed_at, recording_attempt_count
  ) values (
    current_request.id, 'pending', claim_token, reservation_time, 1
  ) returning * into current_recording;

  return jsonb_build_object(
    'state', 'claimed',
    'request_id', current_request.id,
    'recording_id', current_recording.id,
    'claim_token', claim_token,
    'reclaimed', false,
    'room_name', current_request.livekit_room_name,
    'starts_at', current_request.approved_starts_at,
    'ends_at', current_request.approved_ends_at
  );
end;
$$;

create function public.complete_reporter_live_recording_start(
  p_recording_id uuid,
  p_claim_token uuid,
  p_egress_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'REPORTER_LIVE_SESSION_FORBIDDEN';
  end if;
  if p_recording_id is null or p_claim_token is null
    or p_egress_id is null or length(p_egress_id) not between 1 and 255
    or p_egress_id !~ '^[A-Za-z0-9_-]+$' then
    raise exception using errcode = '22023', message = 'REPORTER_LIVE_RECORDING_START_INVALID';
  end if;
  update public.live_recordings
  set recording_status = 'recording', egress_id = p_egress_id,
      recording_claim_token = null, recording_claimed_at = null
  where id = p_recording_id and recording_status = 'pending'
    and recording_claim_token = p_claim_token
    and (egress_id is null or egress_id = p_egress_id);
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create function public.fail_reporter_live_recording_start(
  p_recording_id uuid,
  p_claim_token uuid,
  p_failure_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
  failure_time timestamptz := clock_timestamp();
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'REPORTER_LIVE_SESSION_FORBIDDEN';
  end if;
  if p_failure_code not in ('room-create-failed', 'egress-start-failed') then
    raise exception using errcode = '22023', message = 'REPORTER_LIVE_RECORDING_FAILURE_INVALID';
  end if;
  update public.live_recordings
  set recording_status = 'failed', provider_error = p_failure_code,
      recording_claim_token = null, recording_claimed_at = null
  where id = p_recording_id and recording_status = 'pending' and recording_claim_token = p_claim_token;
  get diagnostics changed = row_count;
  if changed <> 1 then return false; end if;

  insert into public.audit_events (
    actor_id, action, subject_type, subject_id, metadata, created_at
  ) values (
    null, 'live_recording.start_failed', 'live_recording', p_recording_id,
    '{"status":"failed","failure_code":"recording-start-failed"}'::jsonb, failure_time
  );
  insert into public.reporter_notifications (
    profile_id, notification_type, message, delivery_channel, delivery_status, created_at
  )
  select id, 'live_recording_failure',
    'A reporter live recording could not be started. The broadcast may still be active.',
    'in_app', 'not_applicable', failure_time
  from public.profiles
  where role = 'admin' and is_active;
  return true;
end;
$$;

create function public.authorize_reporter_live_session(
  p_profile_id uuid,
  p_access_generation bigint,
  p_request_id uuid,
  p_recording_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_owner uuid;
  current_request public.reporter_live_requests%rowtype;
  current_reporter public.reporter_profiles%rowtype;
  current_profile public.profiles%rowtype;
  current_recording public.live_recordings%rowtype;
  authorization_time timestamptz;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'REPORTER_LIVE_SESSION_FORBIDDEN';
  end if;
  if p_profile_id is null or p_access_generation is null
    or p_request_id is null or p_recording_id is null then
    raise exception using errcode = '22023', message = 'REPORTER_LIVE_SESSION_INVALID';
  end if;

  select profile_id into request_owner
  from public.reporter_live_requests
  where id = p_request_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'REPORTER_LIVE_REQUEST_NOT_FOUND';
  end if;
  if request_owner is distinct from p_profile_id then
    raise exception using errcode = '42501', message = 'REPORTER_LIVE_SESSION_FORBIDDEN';
  end if;

  select * into current_request
  from public.reporter_live_requests
  where id = p_request_id
  for update;
  if not found or current_request.profile_id is distinct from request_owner
    or current_request.profile_id is distinct from p_profile_id then
    raise exception using errcode = '42501', message = 'REPORTER_LIVE_SESSION_FORBIDDEN';
  end if;
  select * into current_reporter
  from public.reporter_profiles
  where profile_id = p_profile_id
  for update;
  select * into current_profile
  from public.profiles
  where id = p_profile_id
  for update;
  select * into current_recording
  from public.live_recordings
  where id = p_recording_id
  for update;

  authorization_time := clock_timestamp();
  if current_reporter.profile_id is null or current_profile.id is null
    or current_profile.role is distinct from 'reporter' or not current_profile.is_active
    or current_reporter.public_status is distinct from 'active'
    or current_reporter.membership_started_at > authorization_time
    or current_reporter.membership_expires_at < authorization_time
    or not current_reporter.can_broadcast_live
    or current_reporter.access_sync_status is distinct from 'succeeded'
    or current_reporter.access_sync_desired_role is distinct from 'reporter'
    or current_reporter.access_sync_generation is distinct from p_access_generation
    or current_reporter.access_sync_claim_token is not null
    or current_request.status is distinct from 'approved'
    or current_request.approved_starts_at is null
    or current_request.approved_ends_at is null
    or authorization_time < current_request.approved_starts_at
    or authorization_time >= current_request.approved_ends_at
    or current_request.livekit_room_name is null
    or current_request.livekit_room_name is distinct from
      'reporter-live-' || replace(current_request.id::text, '-', '')
    or current_recording.id is null
    or current_recording.live_request_id is distinct from current_request.id
    or current_recording.recording_status not in ('recording', 'failed')
    or (current_recording.recording_status = 'failed'
      and current_recording.provider_error is distinct from 'egress-start-failed') then
    raise exception using errcode = '42501', message = 'REPORTER_LIVE_SESSION_FORBIDDEN';
  end if;

  return jsonb_build_object(
    'request_id', current_request.id,
    'room_name', current_request.livekit_room_name,
    'starts_at', current_request.approved_starts_at,
    'ends_at', current_request.approved_ends_at,
    'recording_state', current_recording.recording_status
  );
end;
$$;

revoke all on function public.reserve_reporter_live_recording(uuid, bigint, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.complete_reporter_live_recording_start(uuid, uuid, text)
from public, anon, authenticated, service_role;
revoke all on function public.fail_reporter_live_recording_start(uuid, uuid, text)
from public, anon, authenticated, service_role;
revoke all on function public.authorize_reporter_live_session(uuid, bigint, uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function public.reserve_reporter_live_recording(uuid, bigint, uuid) to service_role;
grant execute on function public.complete_reporter_live_recording_start(uuid, uuid, text) to service_role;
grant execute on function public.fail_reporter_live_recording_start(uuid, uuid, text) to service_role;
grant execute on function public.authorize_reporter_live_session(uuid, bigint, uuid, uuid) to service_role;
