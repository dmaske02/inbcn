-- Run after the complete reporter migration chain against a disposable database.
\set ON_ERROR_STOP on

begin;

do $$
declare
  editor_policy_count integer;
  editor_policy_command text;
  editor_policy_roles name[];
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
    or to_regprocedure('public.complete_livekit_webhook_event(text,uuid,uuid,text,text,numeric,bigint,timestamptz,timestamptz,text)') is null
    or to_regprocedure('public.fail_livekit_webhook_event(text,uuid,text)') is null
    or to_regprocedure('public.report_reporter_live_recording_reconciliation(uuid,uuid,text,text)') is null
    or to_regprocedure('public.claim_livekit_webhook_event(uuid,text,text)') is not null
    or to_regprocedure('public.complete_livekit_webhook_event(uuid,uuid,uuid,text,text,numeric,bigint,timestamptz,timestamptz,text)') is not null
    or to_regprocedure('public.fail_livekit_webhook_event(uuid,uuid,text)') is not null then
    raise exception 'live recording RPC identity contract failed';
  end if;
end;
$$;

do $$
declare
  complete_start_definition text;
  authorize_definition text;
  webhook_definition text;
  reconciliation_definition text;
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
      and pg_get_constraintdef(oid) like '%completed%failed%'
  ) then
    raise exception 'live terminal reconciliation marker schema contract failed';
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
      and column_name = 'terminal_reconciliation_status'
      and grantee = 'service_role'
      and privilege_type in ('INSERT', 'UPDATE')
  ) then
    raise exception 'live terminal reconciliation marker privilege contract failed';
  end if;

  complete_start_definition := lower(pg_get_functiondef(
    'public.complete_reporter_live_recording_start(uuid,uuid,text)'::regprocedure
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
  if position('terminal_reconciliation_status is null' in complete_start_definition) = 0
    or position('terminal_reconciliation_status is not null' in authorize_definition) = 0
    or position('terminal_reconciliation_status is not null' in webhook_definition) = 0
    or position('terminal_reconciliation_status = coalesce' in reconciliation_definition) = 0 then
    raise exception 'live terminal reconciliation marker function contract failed';
  end if;
end;
$$;

rollback;
