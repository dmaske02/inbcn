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
    'service_role', 'private.guard_live_recording_terminal_reconciliation()', 'EXECUTE'
  ) or has_function_privilege(
    'anon', 'private.guard_live_recording_terminal_reconciliation()', 'EXECUTE'
  ) or has_function_privilege(
    'authenticated', 'private.guard_live_recording_terminal_reconciliation()', 'EXECUTE'
  ) then
    raise exception 'live terminal reconciliation trigger privilege contract failed';
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
    where legacy_recording.recording_status = 'pending'
      and legacy_recording.egress_id is not null
      and legacy_recording.recording_claim_token is not null
      and legacy_recording.terminal_reconciliation_status is null
      and exists (
        select 1
        from public.audit_events as reconciliation_audit
        where reconciliation_audit.action = 'live_recording.reconciliation_required'
          and reconciliation_audit.subject_type = 'live_recording'
          and reconciliation_audit.subject_id = legacy_recording.id
      )
  ) then
    raise exception 'live terminal reconciliation legacy quarantine failed';
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
    or position('terminal_reconciliation_status = ''unknown''' in reconciliation_definition) = 0
    or position('old.terminal_reconciliation_status = ''unknown''' in reconciliation_guard_definition) = 0
    or position('new.terminal_reconciliation_status is null' in reconciliation_guard_definition) = 0 then
    raise exception 'live terminal reconciliation marker function contract failed';
  end if;
end;
$$;

rollback;
