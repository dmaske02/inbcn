-- Additive terminal reconciliation fence for deployments that may already have
-- the reporter-live migration chain applied.

alter table public.live_recordings
  add column terminal_reconciliation_status text,
  add constraint live_recordings_terminal_reconciliation_status_check check (
    terminal_reconciliation_status is null
    or (recording_status = 'pending'
      and terminal_reconciliation_status in ('unknown', 'completed', 'failed'))
    or (recording_status = 'completed'
      and terminal_reconciliation_status = 'completed')
    or (recording_status = 'failed'
      and terminal_reconciliation_status = 'failed')
  );

comment on column public.live_recordings.terminal_reconciliation_status is
  'DB-owned monotonic terminal-reconciliation state. Unknown quarantines a legacy bound reconciliation until an exact terminal observation. Never exposed to browsers, public projections, audit metadata, or notifications.';

-- The old reconciliation RPC atomically bound the Egress and wrote this exact
-- audit row while retaining the pending claim. Lock writers while upgrading,
-- reject audited bindings that have since left that exact shape, then quarantine
-- the safe pending claim without guessing a terminal outcome.
lock table public.live_recordings in share row exclusive mode;

create or replace function private.quarantine_legacy_live_recording_reconciliations()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  quarantined_count integer;
begin
  if exists (
    select 1
    from public.live_recordings as legacy_recording
    where legacy_recording.terminal_reconciliation_status is null
      and legacy_recording.egress_id is not null
      and exists (
        select 1
        from public.audit_events as reconciliation_audit
        where reconciliation_audit.action = 'live_recording.reconciliation_required'
          and reconciliation_audit.subject_type = 'live_recording'
          and reconciliation_audit.subject_id = legacy_recording.id
      )
      and not (legacy_recording.recording_status = 'pending'
        and legacy_recording.recording_claim_token is not null
        and legacy_recording.recording_claimed_at is not null)
  ) then
    raise exception using
      errcode = '55000',
      message = 'LIVE_RECORDING_RECONCILIATION_UPGRADE_REQUIRES_OPERATOR_REMEDIATION';
  end if;

  update public.live_recordings as legacy_recording
  set terminal_reconciliation_status = 'unknown'
  where legacy_recording.recording_status = 'pending'
    and legacy_recording.egress_id is not null
    and legacy_recording.recording_claim_token is not null
    and legacy_recording.recording_claimed_at is not null
    and legacy_recording.terminal_reconciliation_status is null
    and exists (
      select 1
      from public.audit_events as reconciliation_audit
      where reconciliation_audit.action = 'live_recording.reconciliation_required'
        and reconciliation_audit.subject_type = 'live_recording'
        and reconciliation_audit.subject_id = legacy_recording.id
    );
  get diagnostics quarantined_count = row_count;
  return quarantined_count;
end;
$$;

revoke all on function private.quarantine_legacy_live_recording_reconciliations()
from public, anon, authenticated, service_role;

select private.quarantine_legacy_live_recording_reconciliations();

create or replace function private.guard_live_recording_terminal_reconciliation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.terminal_reconciliation_status in ('completed', 'failed')
    and new.terminal_reconciliation_status is distinct from old.terminal_reconciliation_status then
    raise exception using errcode = '55000', message = 'LIVE_RECORDING_RECONCILIATION_INVALID';
  end if;
  if old.terminal_reconciliation_status = 'unknown'
    and new.terminal_reconciliation_status is null then
    raise exception using errcode = '55000', message = 'LIVE_RECORDING_RECONCILIATION_INVALID';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_live_recording_terminal_reconciliation()
from public, anon, authenticated, service_role;

create trigger live_recordings_terminal_reconciliation_is_monotonic
before update of terminal_reconciliation_status on public.live_recordings
for each row execute function private.guard_live_recording_terminal_reconciliation();

-- All recording mutations already use guarded security-definer RPCs. Remove
-- the old direct service writes so no caller can bypass marker fencing.
revoke insert (
  live_request_id, live_stream_id, egress_id, recording_status, storage_key,
  duration_seconds, bytes, checksum, provider_error, private_metadata
), update (
  live_stream_id, egress_id, recording_status, storage_key, duration_seconds,
  bytes, checksum, provider_error, private_metadata
) on table public.live_recordings from service_role;

create or replace function public.reserve_reporter_live_recording(
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

  if found and current_recording.terminal_reconciliation_status is not null then
    return jsonb_build_object('state', 'busy');
  end if;
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
    where id = current_recording.id
      and terminal_reconciliation_status is null;
    if not found then
      return jsonb_build_object('state', 'busy');
    end if;
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

create or replace function public.complete_reporter_live_recording_start(
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
    and terminal_reconciliation_status is null
    and (egress_id is null or egress_id = p_egress_id);
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.fail_reporter_live_recording_start(
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
  where id = p_recording_id and recording_status = 'pending'
    and recording_claim_token = p_claim_token
    and terminal_reconciliation_status is null;
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

create or replace function public.authorize_reporter_live_session(
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
    or current_recording.terminal_reconciliation_status is not null
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

create or replace function public.complete_livekit_webhook_event(
  p_event_id text,
  p_processing_token uuid,
  p_recording_id uuid,
  p_recording_status text,
  p_storage_key text,
  p_duration_seconds numeric,
  p_bytes bigint,
  p_provider_started_at timestamptz,
  p_provider_ended_at timestamptz,
  p_failure_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_event public.webhook_events%rowtype;
  current_recording public.live_recordings%rowtype;
  current_request public.reporter_live_requests%rowtype;
  target_request_id uuid;
  processing_time timestamptz := clock_timestamp();
  canonical_key text;
  updated_count integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'LIVEKIT_WEBHOOK_FORBIDDEN';
  end if;
  if p_event_id is null or length(p_event_id) not between 1 and 255
    or p_event_id !~ '^[A-Za-z0-9_-]+$'
    or p_processing_token is null or p_recording_id is null
    or p_recording_status is null
    or p_recording_status not in ('recording', 'completed', 'failed')
    or (p_provider_ended_at is not null and p_provider_ended_at < p_provider_started_at)
    or (p_recording_status = 'recording' and (
      p_storage_key is not null or p_duration_seconds is not null or p_bytes is not null
      or p_provider_started_at is not null or p_provider_ended_at is not null
      or p_failure_code is not null
    ))
    or (p_recording_status = 'completed' and (
      p_storage_key is null or p_duration_seconds is null or p_duration_seconds <= 0
      or p_duration_seconds > 86400 or p_bytes is null or p_bytes <= 0
      or p_bytes > 1099511627776 or p_provider_started_at is null
      or p_provider_ended_at is null or p_provider_ended_at <= p_provider_started_at
      or p_failure_code is not null
    ))
    or (p_recording_status = 'failed' and (
      p_storage_key is not null or p_duration_seconds is not null or p_bytes is not null
      or p_provider_started_at is not null or p_provider_ended_at is not null
      or p_failure_code is null
      or p_failure_code not in (
        'provider-egress-failed',
        'provider-egress-aborted',
        'provider-egress-limit-reached'
      )
    )) then
    raise exception using errcode = '22023', message = 'LIVEKIT_WEBHOOK_RESULT_INVALID';
  end if;

  select * into current_event
  from public.webhook_events
  where provider = 'livekit' and provider_event_id = p_event_id
  for update;
  if not found or current_event.processing_status <> 'pending'
    or current_event.processing_token <> p_processing_token then
    return jsonb_build_object('state', 'lease-lost');
  end if;

  -- Resolve the parent without locking so every live flow can acquire the
  -- canonical request row before its recording row.
  select live_request_id into target_request_id
  from public.live_recordings
  where id = p_recording_id;
  if not found then
    raise exception using errcode = '22023', message = 'LIVEKIT_WEBHOOK_TARGET_MISMATCH';
  end if;

  select * into current_request
  from public.reporter_live_requests
  where id = target_request_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'LIVEKIT_WEBHOOK_TARGET_MISMATCH';
  end if;

  select * into current_recording
  from public.live_recordings
  where id = p_recording_id
  for update;
  if not found
    or current_recording.live_request_id is distinct from current_request.id
    or current_recording.egress_id is distinct from current_event.provider_subject_id
    or current_request.livekit_room_name is null
    or current_request.livekit_room_name is distinct from
      'reporter-live-' || replace(current_request.id::text, '-', '') then
    raise exception using errcode = '22023', message = 'LIVEKIT_WEBHOOK_TARGET_MISMATCH';
  end if;

  if current_recording.terminal_reconciliation_status in ('completed', 'failed')
    and p_recording_status in ('completed', 'failed')
    and current_recording.terminal_reconciliation_status is distinct from p_recording_status then
    raise exception using errcode = '22023', message = 'LIVEKIT_WEBHOOK_TERMINAL_MISMATCH';
  end if;

  if current_recording.recording_status in ('completed', 'failed')
    or (current_recording.terminal_reconciliation_status is not null
      and p_recording_status = 'recording') then
    update public.webhook_events
    set processing_status = 'processed', processing_token = null,
        failure_detail = null, subject_type = 'live_recording',
        subject_id = current_recording.id, processed_at = processing_time,
        updated_at = processing_time
    where id = current_event.id and processing_token = p_processing_token
      and processing_status = 'pending';
    get diagnostics updated_count = row_count;
    if updated_count <> 1 then
      raise exception using errcode = '40001', message = 'LIVEKIT_WEBHOOK_LEASE_LOST';
    end if;
    return jsonb_build_object('state', 'stale');
  end if;

  canonical_key := 'reporter-live/' || current_request.id::text || '/'
    || current_recording.id::text || '.mp4';
  if p_recording_status = 'completed' and p_storage_key is distinct from canonical_key then
    raise exception using errcode = '22023', message = 'LIVEKIT_WEBHOOK_KEY_MISMATCH';
  end if;

  if p_recording_status = 'recording' then
    if current_recording.recording_status = 'pending' then
      update public.live_recordings
      set recording_status = 'recording', recording_claim_token = null,
          recording_claimed_at = null
      where id = current_recording.id;
    end if;
  elsif p_recording_status = 'completed' then
    update public.live_recordings
    set recording_status = 'completed', storage_key = canonical_key,
        duration_seconds = p_duration_seconds, bytes = p_bytes,
        provider_error = null, recording_claim_token = null,
        recording_claimed_at = null,
        terminal_reconciliation_status = case
          when terminal_reconciliation_status is null then null
          else 'completed'
        end
    where id = current_recording.id;
  else
    update public.live_recordings
    set recording_status = 'failed', provider_error = p_failure_code,
        storage_key = null, duration_seconds = null, bytes = null,
        recording_claim_token = null, recording_claimed_at = null,
        terminal_reconciliation_status = case
          when terminal_reconciliation_status is null then null
          else 'failed'
        end
    where id = current_recording.id;

    insert into public.audit_events (
      actor_id, action, subject_type, subject_id, metadata, created_at
    ) values (
      null, 'live_recording.failed', 'live_recording', current_recording.id,
      '{"status":"failed","failure_code":"recording-failed"}'::jsonb,
      processing_time
    );
    insert into public.reporter_notifications (
      profile_id, notification_type, message, delivery_channel,
      delivery_status, created_at
    )
    select profiles.id, 'live_recording_failure',
      'A reporter live recording requires editorial attention.',
      'in_app', 'not_applicable', processing_time
    from public.profiles
    where profiles.role in ('editor', 'admin') and profiles.is_active;
  end if;

  update public.webhook_events
  set processing_status = 'processed', processing_token = null,
      failure_detail = null, subject_type = 'live_recording',
      subject_id = current_recording.id, processed_at = processing_time,
      updated_at = processing_time
  where id = current_event.id and processing_token = p_processing_token
    and processing_status = 'pending';
  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception using errcode = '40001', message = 'LIVEKIT_WEBHOOK_LEASE_LOST';
  end if;

  return jsonb_build_object('state', 'updated');
end;
$$;

create or replace function public.report_reporter_live_recording_reconciliation(
  p_recording_id uuid,
  p_claim_token uuid,
  p_egress_id text,
  p_provider_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_request_id uuid;
  current_request public.reporter_live_requests%rowtype;
  current_recording public.live_recordings%rowtype;
  alert_time timestamptz := clock_timestamp();
  alert_required boolean;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'REPORTER_LIVE_RECONCILIATION_FORBIDDEN';
  end if;
  if p_recording_id is null or p_claim_token is null
    or p_egress_id is null
    or length(p_egress_id) not between 1 and 255
    or p_egress_id !~ '^[A-Za-z0-9_-]+$'
    or p_provider_status is null
    or p_provider_status not in ('completed', 'failed') then
    raise exception using errcode = '22023', message = 'REPORTER_LIVE_RECONCILIATION_INVALID';
  end if;

  -- Resolve the parent without locking, then use the shared request -> recording order.
  select live_request_id into target_request_id
  from public.live_recordings
  where id = p_recording_id;
  if not found then return false; end if;

  select * into current_request
  from public.reporter_live_requests
  where id = target_request_id
  for update;
  if not found then return false; end if;

  select * into current_recording
  from public.live_recordings
  where id = p_recording_id
  for update;
  if not found
    or current_recording.live_request_id is distinct from current_request.id
    or current_recording.recording_status <> 'pending'
    or current_recording.recording_claim_token is distinct from p_claim_token
    or current_request.livekit_room_name is null
    or current_request.livekit_room_name is distinct from
      'reporter-live-' || replace(current_request.id::text, '-', '')
    or (current_recording.egress_id is not null
      and current_recording.egress_id is distinct from p_egress_id) then
    return false;
  end if;
  if current_recording.terminal_reconciliation_status in ('completed', 'failed')
    and current_recording.terminal_reconciliation_status is distinct from p_provider_status then
    return false;
  end if;

  select not exists (
    select 1 from public.audit_events
    where action = 'live_recording.reconciliation_required'
      and subject_type = 'live_recording'
      and subject_id = current_recording.id
  ) into alert_required;

  update public.live_recordings
  set egress_id = p_egress_id,
      terminal_reconciliation_status = case
        when terminal_reconciliation_status in ('completed', 'failed') then
          terminal_reconciliation_status
        else p_provider_status
      end
  where id = current_recording.id
    and recording_status = 'pending'
    and recording_claim_token = p_claim_token
    and (egress_id is null or egress_id = p_egress_id)
    and (terminal_reconciliation_status is null
      or terminal_reconciliation_status = 'unknown'
      or terminal_reconciliation_status = p_provider_status);
  if not found then return false; end if;

  if alert_required then
    insert into public.audit_events (
      actor_id, action, subject_type, subject_id, metadata, created_at
    ) values (
      null, 'live_recording.reconciliation_required',
      'live_recording', current_recording.id,
      '{"status":"reconciliation_required"}'::jsonb, alert_time
    );
    insert into public.reporter_notifications (
      profile_id, notification_type, message, delivery_channel,
      delivery_status, created_at
    )
    select profiles.id, 'live_recording_failure',
      'A reporter live recording requires provider reconciliation.',
      'in_app', 'not_applicable', alert_time
    from public.profiles
    where profiles.role in ('editor', 'admin') and profiles.is_active;
  end if;
  return true;
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
revoke all on function public.complete_livekit_webhook_event(text, uuid, uuid, text, text, numeric, bigint, timestamptz, timestamptz, text)
from public, anon, authenticated, service_role;
revoke all on function public.report_reporter_live_recording_reconciliation(uuid, uuid, text, text)
from public, anon, authenticated, service_role;

grant execute on function public.reserve_reporter_live_recording(uuid, bigint, uuid) to service_role;
grant execute on function public.complete_reporter_live_recording_start(uuid, uuid, text) to service_role;
grant execute on function public.fail_reporter_live_recording_start(uuid, uuid, text) to service_role;
grant execute on function public.authorize_reporter_live_session(uuid, bigint, uuid, uuid) to service_role;
grant execute on function public.complete_livekit_webhook_event(text, uuid, uuid, text, text, numeric, bigint, timestamptz, timestamptz, text) to service_role;
grant execute on function public.report_reporter_live_recording_reconciliation(uuid, uuid, text, text) to service_role;
