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

rollback;
