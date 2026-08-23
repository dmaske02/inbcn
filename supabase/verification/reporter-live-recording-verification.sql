-- Run after the complete reporter migration chain against a disposable database.
\set ON_ERROR_STOP on

begin;

do $$
declare
  editor_policy_count integer;
  editor_policy_command text;
  editor_policy_roles name[];
  service_function text;
begin
  select count(*) into editor_policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'reporter_live_requests'
    and policyname = 'Active editors can read live requests';
  select cmd, roles into editor_policy_command, editor_policy_roles
  from pg_policies
  where schemaname = 'public'
    and tablename = 'reporter_live_requests'
    and policyname = 'Active editors can read live requests';

  if editor_policy_count is distinct from 1
    or editor_policy_command is distinct from 'SELECT'
    or editor_policy_roles is distinct from array['authenticated']::name[] then
    raise exception 'live editor read policy chain contract failed';
  end if;

  if to_regprocedure('public.claim_livekit_webhook_event(text,text,text)') is null
    or to_regprocedure('public.reserve_reporter_live_recording(uuid,bigint,uuid)') is null
    or to_regprocedure('public.fail_reporter_live_recording_start(uuid,uuid,text)') is null
    or to_regprocedure('public.complete_livekit_webhook_event(text,uuid,uuid,text,text,numeric,bigint,timestamptz,timestamptz,text)') is null
    or to_regprocedure('public.fail_livekit_webhook_event(text,uuid,text)') is null
    or to_regprocedure('public.report_reporter_live_recording_reconciliation(uuid,uuid,text,text)') is null
    or to_regprocedure('public.resolve_quarantined_live_recording(uuid,uuid,text,text,text,numeric,bigint,timestamptz,timestamptz)') is null
    or to_regprocedure('private.quarantine_legacy_live_recording_reconciliations()') is null
    or to_regprocedure('private.guard_live_recording_terminal_reconciliation()') is null
    or to_regprocedure('public.claim_livekit_webhook_event(uuid,text,text)') is not null
    or to_regprocedure('public.complete_livekit_webhook_event(uuid,uuid,uuid,text,text,numeric,bigint,timestamptz,timestamptz,text)') is not null
    or to_regprocedure('public.fail_livekit_webhook_event(uuid,uuid,text)') is not null then
    raise exception 'live recording RPC identity contract failed';
  end if;

  foreach service_function in array array[
    'public.reserve_reporter_live_recording(uuid,bigint,uuid)',
    'public.complete_reporter_live_recording_start(uuid,uuid,text)',
    'public.fail_reporter_live_recording_start(uuid,uuid,text)',
    'public.authorize_reporter_live_session(uuid,bigint,uuid,uuid)',
    'public.complete_livekit_webhook_event(text,uuid,uuid,text,text,numeric,bigint,timestamptz,timestamptz,text)',
    'public.report_reporter_live_recording_reconciliation(uuid,uuid,text,text)',
    'public.resolve_quarantined_live_recording(uuid,uuid,text,text,text,numeric,bigint,timestamptz,timestamptz)'
  ] loop
    if not has_function_privilege('service_role', service_function, 'EXECUTE')
      or has_function_privilege('anon', service_function, 'EXECUTE')
      or has_function_privilege('authenticated', service_function, 'EXECUTE') then
      raise exception 'live recording RPC privilege contract failed: %', service_function;
    end if;
  end loop;

  if has_function_privilege(
    'service_role', 'private.quarantine_legacy_live_recording_reconciliations()', 'EXECUTE'
  ) or has_function_privilege(
    'anon', 'private.quarantine_legacy_live_recording_reconciliations()', 'EXECUTE'
  ) or has_function_privilege(
    'authenticated', 'private.quarantine_legacy_live_recording_reconciliations()', 'EXECUTE'
  ) or has_function_privilege(
    'service_role', 'private.guard_live_recording_terminal_reconciliation()', 'EXECUTE'
  ) or has_function_privilege(
    'anon', 'private.guard_live_recording_terminal_reconciliation()', 'EXECUTE'
  ) or has_function_privilege(
    'authenticated', 'private.guard_live_recording_terminal_reconciliation()', 'EXECUTE'
  ) then
    raise exception 'live terminal reconciliation private function privilege contract failed';
  end if;
end;
$$;

do $$
declare
  reserve_definition text;
  complete_start_definition text;
  fail_start_definition text;
  authorize_definition text;
  webhook_definition text;
  reconciliation_definition text;
  provider_resolution_definition text;
  quarantine_definition text;
  reconciliation_guard_definition text;
  lifecycle_definition text;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'live_recordings'
      and column_name = 'terminal_reconciliation_status'
      and data_type = 'text'
      and is_nullable = 'YES'
  ) or not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.live_recordings'::regclass
      and conname = 'live_recordings_terminal_reconciliation_status_check'
      and lower(pg_get_constraintdef(oid)) like '%unknown%completed%failed%'
      and lower(pg_get_constraintdef(oid)) like '%pending%recording%failed%'
  ) then
    raise exception 'live terminal reconciliation marker schema contract failed';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.live_recordings'::regclass
      and tgname = 'live_recordings_terminal_reconciliation_is_monotonic'
      and not tgisinternal
      and tgenabled <> 'D'
      and lower(pg_get_triggerdef(oid)) like
        '%before update of terminal_reconciliation_status on public.live_recordings%'
  ) then
    raise exception 'live terminal reconciliation trigger contract failed';
  end if;

  if exists (
    select 1
    from public.live_recordings as recording
    where recording.terminal_reconciliation_status is not null
      and not (
        (recording.terminal_reconciliation_status = 'unknown'
          and recording.recording_status in ('pending', 'recording', 'failed'))
        or (recording.recording_status = 'pending'
          and recording.terminal_reconciliation_status in ('completed', 'failed'))
        or (recording.recording_status = 'completed'
          and recording.terminal_reconciliation_status = 'completed')
        or (recording.recording_status = 'failed'
          and recording.terminal_reconciliation_status = 'failed')
      )
  ) then
    raise exception 'live terminal reconciliation data invariant failed';
  end if;

  if exists (
    select 1
    from public.live_recordings as legacy_recording
    where legacy_recording.egress_id is not null
      and legacy_recording.recording_status in ('pending', 'recording', 'failed')
      and legacy_recording.terminal_reconciliation_status is null
      and exists (
        select 1
        from public.audit_events as reconciliation_audit
        where reconciliation_audit.action = 'live_recording.reconciliation_required'
          and reconciliation_audit.subject_type = 'live_recording'
          and reconciliation_audit.subject_id = legacy_recording.id
      )
  ) then
    raise exception 'live terminal reconciliation audited binding escaped upgrade fencing';
  end if;

  if exists (
    select 1
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'live_recordings'
      and column_name = 'terminal_reconciliation_status'
      and lower(grantee) in ('public', 'anon', 'authenticated')
  ) or exists (
    select 1
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'live_recordings'
      and grantee = 'service_role'
      and privilege_type in ('INSERT', 'UPDATE')
  ) then
    raise exception 'live terminal reconciliation marker privilege contract failed';
  end if;

  reserve_definition := lower(pg_get_functiondef(
    'public.reserve_reporter_live_recording(uuid,bigint,uuid)'::regprocedure
  ));
  complete_start_definition := lower(pg_get_functiondef(
    'public.complete_reporter_live_recording_start(uuid,uuid,text)'::regprocedure
  ));
  fail_start_definition := lower(pg_get_functiondef(
    'public.fail_reporter_live_recording_start(uuid,uuid,text)'::regprocedure
  ));
  authorize_definition := lower(pg_get_functiondef(
    'public.authorize_reporter_live_session(uuid,bigint,uuid,uuid)'::regprocedure
  ));
  webhook_definition := lower(pg_get_functiondef(
    'public.complete_livekit_webhook_event(text,uuid,uuid,text,text,numeric,bigint,timestamptz,timestamptz,text)'::regprocedure
  ));
  reconciliation_definition := lower(pg_get_functiondef(
    'public.report_reporter_live_recording_reconciliation(uuid,uuid,text,text)'::regprocedure
  ));
  provider_resolution_definition := lower(pg_get_functiondef(
    'public.resolve_quarantined_live_recording(uuid,uuid,text,text,text,numeric,bigint,timestamptz,timestamptz)'::regprocedure
  ));
  quarantine_definition := lower(pg_get_functiondef(
    'private.quarantine_legacy_live_recording_reconciliations()'::regprocedure
  ));
  reconciliation_guard_definition := lower(pg_get_functiondef(
    'private.guard_live_recording_terminal_reconciliation()'::regprocedure
  ));
  lifecycle_definition := lower(pg_get_functiondef(
    'public.set_live_recording_lifecycle_clocks()'::regprocedure
  ));
  if position('terminal_reconciliation_status = ''unknown''' in reserve_definition) = 0
    or position('terminal_reconciliation_status is not null' in reserve_definition) = 0
    or position('return jsonb_build_object(''state'', ''busy'')' in reserve_definition) = 0
    or position('terminal_reconciliation_status is null' in complete_start_definition) = 0
    or position('terminal_reconciliation_status is null' in fail_start_definition) = 0
    or position('terminal_reconciliation_status is not null' in authorize_definition) = 0
    or position('terminal_reconciliation_status = ''unknown''' in authorize_definition) = 0
    or position('terminal_reconciliation_status is not null' in webhook_definition) = 0
    or position('terminal_reconciliation_status in (''completed'', ''failed'')' in webhook_definition) = 0
    or position('p_recording_status in (''completed'', ''failed'')' in webhook_definition) = 0
    or position('livekit_webhook_terminal_mismatch' in webhook_definition) = 0
    or position('terminal_reconciliation_status = ''unknown''' in reconciliation_definition) = 0
    or position('recording_status in (''pending'', ''recording'', ''failed'')' in quarantine_definition) = 0
    or position('raise exception' in quarantine_definition) <> 0
    or position('security definer' in provider_resolution_definition) = 0
    or position('set search_path to' in provider_resolution_definition) = 0
    or position('live_recording.reconciliation_resolved' in provider_resolution_definition) = 0
    or position('provider-confirmed-terminal-failure' in provider_resolution_definition) = 0
    or position('auth.role() is not distinct from ''service_role''' in lifecycle_definition) = 0
    or position('old.terminal_reconciliation_status = ''unknown''' in lifecycle_definition) = 0
    or position('not provider_resolution' in lifecycle_definition) = 0
    or position('old.terminal_reconciliation_status = ''unknown''' in reconciliation_guard_definition) = 0
    or position('new.terminal_reconciliation_status is null' in reconciliation_guard_definition) = 0 then
    raise exception 'live terminal reconciliation marker function contract failed';
  end if;
end;
$$;

-- Runtime upgrade and resolution matrix. All fixtures and mutations roll back.
insert into auth.users (id, email)
values
  ('89000000-0000-4000-8000-000000000001', 'reporter-live-upgrade-admin@example.invalid'),
  ('89000000-0000-4000-8000-000000000002', 'reporter-live-upgrade-reporter@example.invalid');
insert into public.profiles (id, username, display_name, role)
values
  ('89000000-0000-4000-8000-000000000001', 'live_upgrade_admin', 'Live Upgrade Admin', 'admin'),
  ('89000000-0000-4000-8000-000000000002', 'live_upgrade_reporter', 'Live Upgrade Reporter', 'reporter');
insert into public.reporter_profiles (
  profile_id, public_slug, legal_display_name, avatar_url,
  home_city, home_district, home_state, public_status,
  membership_started_at, membership_expires_at, membership_grace_ends_at,
  can_broadcast_live, live_broadcast_granted_by, live_broadcast_granted_at,
  public_photo_verified_by, public_photo_verified_at
) values (
  '89000000-0000-4000-8000-000000000002', 'live_upgrade_reporter',
  'Live Upgrade Reporter', 'https://example.invalid/reporter.jpg',
  'Verification City', 'Verification District', 'Verification State', 'active',
  transaction_timestamp() - interval '1 day', transaction_timestamp() + interval '1 day',
  transaction_timestamp() + interval '8 days', true,
  '89000000-0000-4000-8000-000000000001', clock_timestamp(),
  '89000000-0000-4000-8000-000000000001', clock_timestamp()
);
insert into public.reporter_live_requests (
  id, profile_id, title, purpose, intended_locality, expected_starts_at,
  expected_duration_minutes, status, decided_by, decided_at,
  approved_starts_at, approved_ends_at, livekit_room_name
)
select fixture.id, '89000000-0000-4000-8000-000000000002', fixture.title,
  'Verification', 'Verification locality', clock_timestamp(), 30, 'approved',
  '89000000-0000-4000-8000-000000000001', clock_timestamp(),
  clock_timestamp() - interval '1 minute', clock_timestamp() + interval '1 hour',
  'reporter-live-' || replace(fixture.id::text, '-', '')
from (values
  ('89100000-0000-4000-8000-000000000001'::uuid, 'Clean fixture'),
  ('89100000-0000-4000-8000-000000000002'::uuid, 'Pending quarantine fixture'),
  ('89100000-0000-4000-8000-000000000003'::uuid, 'Recording quarantine fixture'),
  ('89100000-0000-4000-8000-000000000004'::uuid, 'Failed quarantine fixture'),
  ('89100000-0000-4000-8000-000000000005'::uuid, 'Webhook resolution fixture'),
  ('89100000-0000-4000-8000-000000000006'::uuid, 'Completed remediation fixture'),
  ('89100000-0000-4000-8000-000000000007'::uuid, 'Failed remediation fixture'),
  ('89100000-0000-4000-8000-000000000008'::uuid, 'Sibling fence fixture')
) as fixture (id, title);

insert into public.live_recordings (
  id, live_request_id, egress_id, recording_status,
  recording_claim_token, recording_claimed_at, recording_attempt_count
) values
  ('89200000-0000-4000-8000-000000000001', '89100000-0000-4000-8000-000000000001',
    'EG_verify_clean', 'pending', '89300000-0000-4000-8000-000000000001', clock_timestamp(), 1),
  ('89200000-0000-4000-8000-000000000002', '89100000-0000-4000-8000-000000000002',
    'EG_verify_pending', 'pending', '89300000-0000-4000-8000-000000000002', clock_timestamp(), 1);
insert into public.live_recordings (id, live_request_id, egress_id, recording_status)
values
  ('89200000-0000-4000-8000-000000000003', '89100000-0000-4000-8000-000000000003', 'EG_verify_recording', 'recording'),
  ('89200000-0000-4000-8000-000000000005', '89100000-0000-4000-8000-000000000005', 'EG_verify_webhook', 'recording'),
  ('89200000-0000-4000-8000-000000000007', '89100000-0000-4000-8000-000000000007', 'EG_verify_resolve_failed', 'recording'),
  ('89200000-0000-4000-8000-000000000082', '89100000-0000-4000-8000-000000000008', 'EG_verify_sibling_active', 'recording');
insert into public.live_recordings (id, live_request_id, egress_id, recording_status, provider_error)
values
  ('89200000-0000-4000-8000-000000000004', '89100000-0000-4000-8000-000000000004', 'EG_verify_failed', 'failed', 'provider-egress-failed'),
  ('89200000-0000-4000-8000-000000000006', '89100000-0000-4000-8000-000000000006', 'EG_verify_resolve_completed', 'failed', 'provider-egress-failed'),
  ('89200000-0000-4000-8000-000000000081', '89100000-0000-4000-8000-000000000008', 'EG_verify_sibling_quarantine', 'failed', 'provider-egress-failed');
insert into public.audit_events (action, subject_type, subject_id, metadata)
select 'live_recording.reconciliation_required', 'live_recording', fixture.id,
  '{"status":"reconciliation_required"}'::jsonb
from (values
  ('89200000-0000-4000-8000-000000000002'::uuid),
  ('89200000-0000-4000-8000-000000000003'::uuid),
  ('89200000-0000-4000-8000-000000000004'::uuid),
  ('89200000-0000-4000-8000-000000000005'::uuid),
  ('89200000-0000-4000-8000-000000000006'::uuid),
  ('89200000-0000-4000-8000-000000000007'::uuid),
  ('89200000-0000-4000-8000-000000000081'::uuid)
) as fixture (id);

do $$
declare
  quarantined_count integer;
begin
  select private.quarantine_legacy_live_recording_reconciliations() into quarantined_count;
  if quarantined_count is distinct from 7
    or exists (
      select 1 from public.live_recordings
      where id in (
        '89200000-0000-4000-8000-000000000002',
        '89200000-0000-4000-8000-000000000003',
        '89200000-0000-4000-8000-000000000004',
        '89200000-0000-4000-8000-000000000005',
        '89200000-0000-4000-8000-000000000006',
        '89200000-0000-4000-8000-000000000007',
        '89200000-0000-4000-8000-000000000081'
      ) and terminal_reconciliation_status is distinct from 'unknown'
    )
    or (select terminal_reconciliation_status from public.live_recordings
        where id = '89200000-0000-4000-8000-000000000001') is not null
    or (select count(*) from public.audit_events
        where action = 'live_recording.reconciliation_required'
          and subject_id::text like '89200000-0000-4000-8000-%') is distinct from 7::bigint then
    raise exception 'pending/recording/failed quarantine runtime failed';
  end if;
end;
$$;

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $$
declare
  reservation jsonb;
begin
  select public.reserve_reporter_live_recording(
    '89000000-0000-4000-8000-000000000002', 0,
    '89100000-0000-4000-8000-000000000004'
  ) into reservation;
  if reservation ->> 'state' is distinct from 'busy'
    or public.complete_reporter_live_recording_start(
      '89200000-0000-4000-8000-000000000002',
      '89300000-0000-4000-8000-000000000002', 'EG_verify_pending'
    )
    or public.fail_reporter_live_recording_start(
      '89200000-0000-4000-8000-000000000002',
      '89300000-0000-4000-8000-000000000002', 'egress-start-failed'
    )
    or public.report_reporter_live_recording_reconciliation(
      '89200000-0000-4000-8000-000000000003',
      '89300000-0000-4000-8000-000000000003', 'EG_verify_recording', 'completed'
    ) then
    raise exception 'quarantined provider mutation path did not fail closed';
  end if;

  begin
    perform public.authorize_reporter_live_session(
      '89000000-0000-4000-8000-000000000002', 0,
      '89100000-0000-4000-8000-000000000008',
      '89200000-0000-4000-8000-000000000082'
    );
    raise exception 'quarantined sibling final authorization was accepted';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

insert into public.webhook_events (
  provider, provider_event_id, event_type, provider_subject_id,
  signature_verified_at, processing_status, attempt_count, processing_token
) values
  ('livekit', 'EV_verify_nonterminal', 'egress_updated', 'EG_verify_webhook',
    clock_timestamp(), 'pending', 1, '89300000-0000-4000-8000-000000000011'),
  ('livekit', 'EV_verify_matching', 'egress_ended', 'EG_verify_webhook',
    clock_timestamp(), 'pending', 1, '89300000-0000-4000-8000-000000000012'),
  ('livekit', 'EV_verify_conflict', 'egress_ended', 'EG_verify_webhook',
    clock_timestamp(), 'pending', 1, '89300000-0000-4000-8000-000000000013');
do $$
declare
  nonterminal_result jsonb;
  terminal_result jsonb;
  provider_started timestamptz := clock_timestamp() - interval '20 seconds';
  provider_ended timestamptz := clock_timestamp() - interval '10 seconds';
begin
  select public.complete_livekit_webhook_event(
    'EV_verify_nonterminal', '89300000-0000-4000-8000-000000000011',
    '89200000-0000-4000-8000-000000000005', 'recording',
    null, null, null, null, null, null
  ) into nonterminal_result;
  if nonterminal_result ->> 'state' is distinct from 'stale'
    or (select terminal_reconciliation_status from public.live_recordings
        where id = '89200000-0000-4000-8000-000000000005') is distinct from 'unknown' then
    raise exception 'quarantined nonterminal receipt was not stale';
  end if;

  select public.complete_livekit_webhook_event(
    'EV_verify_matching', '89300000-0000-4000-8000-000000000012',
    '89200000-0000-4000-8000-000000000005', 'completed',
    'reporter-live/89100000-0000-4000-8000-000000000005/89200000-0000-4000-8000-000000000005.mp4',
    10, 4096, provider_started, provider_ended, null
  ) into terminal_result;
  if terminal_result ->> 'state' is distinct from 'updated'
    or not exists (
      select 1 from public.live_recordings
      where id = '89200000-0000-4000-8000-000000000005'
        and recording_status = 'completed'
        and terminal_reconciliation_status = 'completed'
        and recording_started_at = provider_started
        and recording_completed_at = provider_ended
    ) then
    raise exception 'matching terminal callback did not resolve quarantine';
  end if;

  begin
    perform public.complete_livekit_webhook_event(
      'EV_verify_conflict', '89300000-0000-4000-8000-000000000013',
      '89200000-0000-4000-8000-000000000005', 'failed',
      null, null, null, null, null, 'provider-egress-failed'
    );
    raise exception 'conflicting terminal webhook was accepted as stale';
  exception
    when sqlstate '22023' then
      if sqlerrm is distinct from 'LIVEKIT_WEBHOOK_TERMINAL_MISMATCH' then raise; end if;
  end;
  if (select processing_status from public.webhook_events
      where provider = 'livekit' and provider_event_id = 'EV_verify_conflict')
      is distinct from 'pending' then
    raise exception 'conflicting terminal webhook did not fail closed';
  end if;
end;
$$;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
do $$
begin
  perform public.resolve_quarantined_live_recording(
    '89100000-0000-4000-8000-000000000006',
    '89200000-0000-4000-8000-000000000006', 'EG_verify_resolve_completed',
    'completed',
    'reporter-live/89100000-0000-4000-8000-000000000006/89200000-0000-4000-8000-000000000006.mp4',
    12.345, 8192, clock_timestamp() - interval '20 seconds',
    clock_timestamp() - interval '5 seconds'
  );
  raise exception 'non-service provider resolution was accepted';
exception
  when sqlstate '42501' then
    if sqlerrm is distinct from 'LIVE_RECORDING_PROVIDER_RESOLUTION_FORBIDDEN' then raise; end if;
end;
$$;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $$
declare
  provider_started timestamptz := clock_timestamp() - interval '20 seconds';
  provider_ended timestamptz := clock_timestamp() - interval '5 seconds';
  remediation_started timestamptz := clock_timestamp();
  first_result jsonb;
  retry_result jsonb;
begin
  select public.resolve_quarantined_live_recording(
    '89100000-0000-4000-8000-000000000006',
    '89200000-0000-4000-8000-000000000006', 'EG_verify_resolve_completed',
    'completed',
    'reporter-live/89100000-0000-4000-8000-000000000006/89200000-0000-4000-8000-000000000006.mp4',
    12.345, 8192, provider_started, provider_ended
  ) into first_result;
  if first_result ->> 'state' is distinct from 'resolved'
    or not exists (
      select 1 from public.live_recordings
      where id = '89200000-0000-4000-8000-000000000006'
        and recording_status = 'completed'
        and terminal_reconciliation_status = 'completed'
        and storage_key = 'reporter-live/89100000-0000-4000-8000-000000000006/89200000-0000-4000-8000-000000000006.mp4'
        and duration_seconds = 12.345 and bytes = 8192
        and provider_error is null and recording_started_at = provider_started
        and recording_completed_at = provider_ended
        and retention_delete_at >= remediation_started + interval '90 days'
    ) then
    raise exception 'provider-confirmed completed resolution runtime failed';
  end if;

  select public.resolve_quarantined_live_recording(
    '89100000-0000-4000-8000-000000000006',
    '89200000-0000-4000-8000-000000000006', 'EG_verify_resolve_completed',
    'completed',
    'reporter-live/89100000-0000-4000-8000-000000000006/89200000-0000-4000-8000-000000000006.mp4',
    12.345, 8192, provider_started, provider_ended
  ) into retry_result;
  if retry_result ->> 'state' is distinct from 'unchanged'
    or (select count(*) from public.audit_events
        where action = 'live_recording.reconciliation_resolved'
          and subject_id = '89200000-0000-4000-8000-000000000006'
          and metadata = '{"status":"resolved"}'::jsonb) is distinct from 1::bigint then
    raise exception 'provider resolution exact retry runtime failed';
  end if;

  begin
    perform public.resolve_quarantined_live_recording(
      '89100000-0000-4000-8000-000000000006',
      '89200000-0000-4000-8000-000000000006', 'EG_verify_resolve_completed',
      'completed',
      'reporter-live/89100000-0000-4000-8000-000000000006/89200000-0000-4000-8000-000000000006.mp4',
      12.346, 8192, provider_started, provider_ended
    );
    raise exception 'provider resolution conflict was accepted';
  exception
    when sqlstate '55000' then
      if sqlerrm is distinct from 'LIVE_RECORDING_PROVIDER_RESOLUTION_CONFLICT' then raise; end if;
  end;
end;
$$;

do $$
declare
  resolution_result jsonb;
  retry_result jsonb;
  post_resolution_reservation jsonb;
begin
  select public.resolve_quarantined_live_recording(
    '89100000-0000-4000-8000-000000000007',
    '89200000-0000-4000-8000-000000000007', 'EG_verify_resolve_failed',
    'failed', null, null, null, null, null
  ) into resolution_result;
  if resolution_result ->> 'state' is distinct from 'resolved'
    or not exists (
      select 1 from public.live_recordings
      where id = '89200000-0000-4000-8000-000000000007'
        and recording_status = 'failed'
        and terminal_reconciliation_status = 'failed'
        and storage_key is null and duration_seconds is null and bytes is null
        and checksum is null
        and provider_error = 'provider-confirmed-terminal-failure'
        and recording_claim_token is null and recording_claimed_at is null
        and retention_delete_at is not null
    ) then
    raise exception 'provider-confirmed failed resolution runtime failed';
  end if;

  select public.resolve_quarantined_live_recording(
    '89100000-0000-4000-8000-000000000007',
    '89200000-0000-4000-8000-000000000007', 'EG_verify_resolve_failed',
    'failed', null, null, null, null, null
  ) into retry_result;
  if retry_result ->> 'state' is distinct from 'unchanged'
    or (select count(*) from public.audit_events
        where action = 'live_recording.reconciliation_resolved'
          and subject_id = '89200000-0000-4000-8000-000000000007'
          and metadata = '{"status":"resolved"}'::jsonb) is distinct from 1::bigint then
    raise exception 'provider-confirmed failed retry runtime failed';
  end if;

  select public.reserve_reporter_live_recording(
    '89000000-0000-4000-8000-000000000002', 0,
    '89100000-0000-4000-8000-000000000007'
  ) into post_resolution_reservation;
  if post_resolution_reservation ->> 'state' is distinct from 'claimed' then
    raise exception 'provider resolution did not release request quarantine';
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from public.audit_events
    where action = 'live_recording.reconciliation_resolved'
      and metadata <> '{"status":"resolved"}'::jsonb
  ) or (select count(*) from public.audit_events
        where action = 'live_recording.reconciliation_required'
          and subject_id::text like '89200000-0000-4000-8000-%') is distinct from 7::bigint then
    raise exception 'provider resolution audit evidence contract failed';
  end if;
end;
$$;

set local role service_role;
do $$
begin
  update public.live_recordings
  set recording_status = 'recording', terminal_reconciliation_status = null
  where id = '89200000-0000-4000-8000-000000000007';
  raise exception 'direct service-role recording DML bypass was accepted';
exception
  when insufficient_privilege then null;
end;
$$;
reset role;

rollback;
