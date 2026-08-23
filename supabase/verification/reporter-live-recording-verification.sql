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
    'public.report_reporter_live_recording_reconciliation(uuid,uuid,text,text)'
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
  quarantine_definition text;
  reconciliation_guard_definition text;
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
      and lower(pg_get_constraintdef(oid)) like '%recording_status%pending%'
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
        (recording.recording_status = 'pending'
          and recording.terminal_reconciliation_status in ('unknown', 'completed', 'failed'))
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
  quarantine_definition := lower(pg_get_functiondef(
    'private.quarantine_legacy_live_recording_reconciliations()'::regprocedure
  ));
  reconciliation_guard_definition := lower(pg_get_functiondef(
    'private.guard_live_recording_terminal_reconciliation()'::regprocedure
  ));
  if position('terminal_reconciliation_status is not null' in reserve_definition) = 0
    or position('return jsonb_build_object(''state'', ''busy'')' in reserve_definition) = 0
    or position('terminal_reconciliation_status is null' in complete_start_definition) = 0
    or position('terminal_reconciliation_status is null' in fail_start_definition) = 0
    or position('terminal_reconciliation_status is not null' in authorize_definition) = 0
    or position('terminal_reconciliation_status is not null' in webhook_definition) = 0
    or position('terminal_reconciliation_status in (''completed'', ''failed'')' in webhook_definition) = 0
    or position('p_recording_status in (''completed'', ''failed'')' in webhook_definition) = 0
    or position('livekit_webhook_terminal_mismatch' in webhook_definition) = 0
    or position('terminal_reconciliation_status = ''unknown''' in reconciliation_definition) = 0
    or position('live_recording_reconciliation_upgrade_requires_operator_remediation' in quarantine_definition) = 0
    or position('recording_claimed_at is not null' in quarantine_definition) = 0
    or position('old.terminal_reconciliation_status = ''unknown''' in reconciliation_guard_definition) = 0
    or position('new.terminal_reconciliation_status is null' in reconciliation_guard_definition) = 0 then
    raise exception 'live terminal reconciliation marker function contract failed';
  end if;
end;
$$;

-- Runtime upgrade matrix. All fixtures and mutations roll back below.
insert into auth.users (id, email)
values (
  '89000000-0000-4000-8000-000000000001',
  'reporter-live-upgrade-verification@example.invalid'
);
insert into public.profiles (id, username, display_name, role)
values (
  '89000000-0000-4000-8000-000000000001',
  'live_upgrade_verify',
  'Live Upgrade Verifier',
  'admin'
);
insert into public.reporter_live_requests (
  id, profile_id, title, purpose, intended_locality, expected_starts_at,
  expected_duration_minutes, status, decided_by, decided_at,
  approved_starts_at, approved_ends_at, livekit_room_name
)
select
  fixture.id,
  '89000000-0000-4000-8000-000000000001',
  fixture.title,
  'Verification',
  'Verification locality',
  clock_timestamp(),
  30,
  'approved',
  '89000000-0000-4000-8000-000000000001',
  clock_timestamp(),
  clock_timestamp() - interval '1 minute',
  clock_timestamp() + interval '1 hour',
  'reporter-live-' || replace(fixture.id::text, '-', '')
from (values
  ('89100000-0000-4000-8000-000000000001'::uuid, 'Clean upgrade fixture'),
  ('89100000-0000-4000-8000-000000000002'::uuid, 'Pending upgrade fixture'),
  ('89100000-0000-4000-8000-000000000003'::uuid, 'Recording upgrade fixture'),
  ('89100000-0000-4000-8000-000000000004'::uuid, 'Partial upgrade fixture'),
  ('89100000-0000-4000-8000-000000000005'::uuid, 'Failed upgrade fixture'),
  ('89100000-0000-4000-8000-000000000006'::uuid, 'Webhook terminal fixture')
) as fixture (id, title);

-- Clean audited absence is ignored; the exact pending+claim audit is quarantined.
insert into public.live_recordings (
  id, live_request_id, egress_id, recording_status,
  recording_claim_token, recording_claimed_at, recording_attempt_count
) values
  (
    '89200000-0000-4000-8000-000000000001',
    '89100000-0000-4000-8000-000000000001',
    'EG_verify_clean', 'pending',
    '89300000-0000-4000-8000-000000000001', clock_timestamp(), 1
  ),
  (
    '89200000-0000-4000-8000-000000000002',
    '89100000-0000-4000-8000-000000000002',
    'EG_verify_pending', 'pending',
    '89300000-0000-4000-8000-000000000002', clock_timestamp(), 1
  );
insert into public.audit_events (action, subject_type, subject_id, metadata)
values (
  'live_recording.reconciliation_required', 'live_recording',
  '89200000-0000-4000-8000-000000000002',
  '{"status":"reconciliation_required"}'::jsonb
);
do $$
declare
  quarantined_count integer;
begin
  select private.quarantine_legacy_live_recording_reconciliations()
  into quarantined_count;
  if quarantined_count is distinct from 1
    or (select terminal_reconciliation_status from public.live_recordings
        where id = '89200000-0000-4000-8000-000000000002') is distinct from 'unknown'
    or (select terminal_reconciliation_status from public.live_recordings
        where id = '89200000-0000-4000-8000-000000000001') is not null then
    raise exception 'live terminal reconciliation clean/pending upgrade runtime failed';
  end if;
end;
$$;

-- A legacy callback may already have moved the audited binding to recording.
insert into public.live_recordings (
  id, live_request_id, egress_id, recording_status
) values (
  '89200000-0000-4000-8000-000000000003',
  '89100000-0000-4000-8000-000000000003',
  'EG_verify_recording', 'recording'
);
insert into public.live_recordings (
  id, live_request_id, egress_id, recording_status,
  recording_claim_token, recording_claimed_at, recording_attempt_count
) values (
  '89200000-0000-4000-8000-000000000004',
  '89100000-0000-4000-8000-000000000004',
  'EG_verify_partial', 'pending',
  '89300000-0000-4000-8000-000000000004', clock_timestamp(), 1
);
insert into public.audit_events (action, subject_type, subject_id, metadata)
values
  (
    'live_recording.reconciliation_required', 'live_recording',
    '89200000-0000-4000-8000-000000000003',
    '{"status":"reconciliation_required"}'::jsonb
  ),
  (
    'live_recording.reconciliation_required', 'live_recording',
    '89200000-0000-4000-8000-000000000004',
    '{"status":"reconciliation_required"}'::jsonb
  );
do $$
begin
  perform private.quarantine_legacy_live_recording_reconciliations();
  raise exception 'recording reconciliation upgrade was not rejected';
exception
  when sqlstate '55000' then
    if sqlerrm is distinct from
      'LIVE_RECORDING_RECONCILIATION_UPGRADE_REQUIRES_OPERATOR_REMEDIATION' then
      raise;
    end if;
end;
$$;
do $$
begin
  if exists (
    select 1 from public.live_recordings
    where id in (
      '89200000-0000-4000-8000-000000000003',
      '89200000-0000-4000-8000-000000000004'
    ) and terminal_reconciliation_status is not null
  ) then
    raise exception 'upgrade preflight exposed a partial quarantine';
  end if;
end;
$$;
delete from public.audit_events
where action = 'live_recording.reconciliation_required'
  and subject_id = '89200000-0000-4000-8000-000000000003';

-- The same preflight rejects an audited failed binding and still writes nothing.
insert into public.live_recordings (
  id, live_request_id, egress_id, recording_status, provider_error
) values (
  '89200000-0000-4000-8000-000000000005',
  '89100000-0000-4000-8000-000000000005',
  'EG_verify_failed', 'failed', 'provider-egress-failed'
);
insert into public.audit_events (action, subject_type, subject_id, metadata)
values (
  'live_recording.reconciliation_required', 'live_recording',
  '89200000-0000-4000-8000-000000000005',
  '{"status":"reconciliation_required"}'::jsonb
);
do $$
begin
  perform private.quarantine_legacy_live_recording_reconciliations();
  raise exception 'failed reconciliation upgrade was not rejected';
exception
  when sqlstate '55000' then
    if sqlerrm is distinct from
      'LIVE_RECORDING_RECONCILIATION_UPGRADE_REQUIRES_OPERATOR_REMEDIATION' then
      raise;
    end if;
end;
$$;
do $$
begin
  if exists (
    select 1 from public.live_recordings
    where id in (
      '89200000-0000-4000-8000-000000000004',
      '89200000-0000-4000-8000-000000000005'
    ) and terminal_reconciliation_status is not null
  ) then
    raise exception 'upgrade preflight exposed a partial quarantine';
  end if;
end;
$$;

-- A known terminal conflict fails closed before stale processing; matching
-- terminal and delayed nonterminal retries are atomically processed as stale.
insert into public.live_recordings (
  id, live_request_id, egress_id, recording_status, storage_key,
  duration_seconds, bytes, terminal_reconciliation_status
) values (
  '89200000-0000-4000-8000-000000000006',
  '89100000-0000-4000-8000-000000000006',
  'EG_verify_terminal', 'completed',
  'reporter-live/89100000-0000-4000-8000-000000000006/89200000-0000-4000-8000-000000000006.mp4',
  12.345, 4096, 'completed'
);
insert into public.webhook_events (
  provider, provider_event_id, event_type, provider_subject_id,
  signature_verified_at, processing_status, attempt_count, processing_token
) values
  (
    'livekit', 'EV_verify_conflict', 'egress_ended', 'EG_verify_terminal',
    clock_timestamp(), 'pending', 1, '89300000-0000-4000-8000-000000000011'
  ),
  (
    'livekit', 'EV_verify_matching', 'egress_ended', 'EG_verify_terminal',
    clock_timestamp(), 'pending', 1, '89300000-0000-4000-8000-000000000012'
  ),
  (
    'livekit', 'EV_verify_nonterminal', 'egress_updated', 'EG_verify_terminal',
    clock_timestamp(), 'pending', 1, '89300000-0000-4000-8000-000000000013'
  );
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
begin
  perform public.complete_livekit_webhook_event(
    'EV_verify_conflict', '89300000-0000-4000-8000-000000000011',
    '89200000-0000-4000-8000-000000000006', 'failed',
    null, null, null, null, null, 'provider-egress-failed'
  );
  raise exception 'conflicting terminal webhook was accepted as stale';
exception
  when sqlstate '22023' then
    if sqlerrm is distinct from 'LIVEKIT_WEBHOOK_TERMINAL_MISMATCH' then
      raise;
    end if;
end;
$$;
do $$
declare
  matching_result jsonb;
  nonterminal_result jsonb;
begin
  if (select processing_status from public.webhook_events
      where provider = 'livekit' and provider_event_id = 'EV_verify_conflict')
      is distinct from 'pending' then
    raise exception 'conflicting terminal webhook did not fail closed';
  end if;

  select public.complete_livekit_webhook_event(
    'EV_verify_matching', '89300000-0000-4000-8000-000000000012',
    '89200000-0000-4000-8000-000000000006', 'completed',
    'reporter-live/89100000-0000-4000-8000-000000000006/89200000-0000-4000-8000-000000000006.mp4',
    12.345, 4096, '2026-08-23T00:00:00Z', '2026-08-23T00:00:12Z', null
  ) into matching_result;
  select public.complete_livekit_webhook_event(
    'EV_verify_nonterminal', '89300000-0000-4000-8000-000000000013',
    '89200000-0000-4000-8000-000000000006', 'recording',
    null, null, null, null, null, null
  ) into nonterminal_result;

  if matching_result ->> 'state' is distinct from 'stale'
    or nonterminal_result ->> 'state' is distinct from 'stale'
    or exists (
      select 1 from public.webhook_events
      where provider = 'livekit'
        and provider_event_id in ('EV_verify_matching', 'EV_verify_nonterminal')
        and processing_status <> 'processed'
    )
    or (select terminal_reconciliation_status from public.live_recordings
        where id = '89200000-0000-4000-8000-000000000006')
        is distinct from 'completed' then
    raise exception 'terminal webhook retry runtime contract failed';
  end if;
end;
$$;

rollback;
