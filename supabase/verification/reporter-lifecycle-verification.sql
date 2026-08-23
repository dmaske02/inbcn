-- Run only against a disposable database after all reporter migrations.
-- Introspection and any claimed lifecycle work are rolled back.
\set ON_ERROR_STOP on

begin;

do $$
declare
  function_signature text;
  function_oid regprocedure;
begin
  foreach function_signature in array array[
    'public.claim_reporter_lifecycle(integer)',
    'public.fail_reporter_lifecycle_refund(uuid,uuid,text)',
    'public.complete_reporter_recording_deletion(uuid,uuid,text,text)',
    'public.fail_reporter_recording_deletion(uuid,uuid,text,text)'
  ] loop
    function_oid := to_regprocedure(function_signature);
    if function_oid is null then
      raise exception 'missing lifecycle function %', function_signature;
    end if;
    if not (
      select prosecdef and coalesce(proconfig @> array['search_path=""'], false)
      from pg_proc where oid = function_oid
    ) then
      raise exception 'unsafe lifecycle function configuration %', function_signature;
    end if;
    if exists (
      select 1
      from pg_proc
      cross join lateral aclexplode(
        coalesce(pg_proc.proacl, acldefault('f', pg_proc.proowner))
      ) as privilege
      where pg_proc.oid = function_oid
        and privilege.grantee = 0
        and privilege.privilege_type = 'EXECUTE'
    ) or has_function_privilege('anon', function_oid, 'execute')
      or has_function_privilege('authenticated', function_oid, 'execute')
      or not has_function_privilege('service_role', function_oid, 'execute') then
      raise exception 'incorrect lifecycle function privileges %', function_signature;
    end if;
  end loop;
end;
$$;

do $$
declare
  nullable_exact_columns integer;
  required_lifecycle_columns integer;
begin
  select count(*) into nullable_exact_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'story_locations'
    and column_name in ('latitude', 'longitude', 'accuracy_meters', 'captured_at')
    and is_nullable = 'YES';
  if nullable_exact_columns <> 4 then
    raise exception 'exact coordinate columns are not all nullable';
  end if;

  select count(*) into required_lifecycle_columns
  from information_schema.columns
  where table_schema = 'public'
    and (
      (table_name = 'reporter_applications' and column_name = 'completion_reminded_at')
      or (table_name = 'reporter_profiles' and column_name = 'renewal_reminded_for')
      or (table_name = 'story_locations' and column_name = 'exact_coordinates_deleted_at')
      or (table_name = 'live_recordings' and column_name in (
        'storage_deleted_at', 'deletion_lease_token',
        'deletion_lease_claimed_at', 'deletion_attempt_count',
        'deletion_failure_detail'
      ))
    );
  if required_lifecycle_columns <> 8 then
    raise exception 'lifecycle evidence columns are incomplete';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.story_locations'::regclass
      and conname = 'story_locations_exact_coordinates_state_check'
  ) or not exists (
    select 1 from pg_constraint
    where conrelid = 'public.live_recordings'::regclass
      and conname = 'live_recordings_deletion_state_check'
  ) then
    raise exception 'lifecycle evidence constraints are missing';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.live_recordings'::regclass
      and tgname = 'prevent_live_recording_deletion_race'
      and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.reporter_payments'::regclass
      and tgname = 'notify_reporter_refund_confirmation'
      and not tgisinternal
  ) then
    raise exception 'lifecycle safety triggers are missing';
  end if;
end;
$$;

select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
set local role service_role;

do $$
begin
  begin
    perform public.claim_reporter_lifecycle(0);
    raise exception 'unbounded lifecycle claim unexpectedly accepted';
  exception when invalid_parameter_value then
    if sqlerrm is distinct from 'REPORTER_LIFECYCLE_LIMIT_INVALID' then
      raise;
    end if;
  end;
end;
$$;

reset role;

rollback;
