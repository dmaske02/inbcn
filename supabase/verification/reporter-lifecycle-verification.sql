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
    'public.reconcile_reporter_refund(uuid,uuid,text,text,text,integer,text,text)',
    'public.record_reporter_refund_request(uuid,uuid,text,text,integer,text)',
    'public.fail_reporter_refund_request(uuid,uuid)',
    'public.complete_razorpay_refund_webhook(text,uuid,text,text,integer,text)',
    'public.complete_razorpay_refund_failure_webhook(text,uuid,text,text,integer,text)',
    'public.complete_reporter_recording_deletion(uuid,uuid,text,text)',
    'public.fail_reporter_recording_deletion(uuid,uuid,text,text)',
    'public.complete_temporary_reporter_payment(uuid,uuid)',
    'public.complete_temporary_reporter_kyc_approval(uuid,uuid)',
    'public.claim_temporary_reporter_access_sync(uuid)',
    'public.complete_temporary_reporter_access_sync(uuid,bigint,uuid,boolean,text)'
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
  function_oid regprocedure := to_regprocedure(
    'public.publish_live_recording(uuid,text,text,uuid,uuid)'
  );
  function_definition text;
begin
  if function_oid is null then
    raise exception 'missing publication function';
  end if;
  if not (
    select prosecdef and coalesce(proconfig @> array['search_path=""'], false)
    from pg_proc where oid = function_oid
  ) then
    raise exception 'unsafe publication function configuration';
  end if;
  if has_function_privilege('anon', function_oid, 'execute')
    or not has_function_privilege('authenticated', function_oid, 'execute')
    or has_function_privilege('service_role', function_oid, 'execute') then
    raise exception 'incorrect publication function privileges';
  end if;
  select regexp_replace(pg_get_functiondef(function_oid), '\s+', ' ', 'g')
  into function_definition;
  if position(
      'from public.reporter_live_requests where id = target_request_id for update'
      in function_definition
    ) = 0
    or position(
      'from public.live_recordings where id = p_recording_id for update'
      in function_definition
    ) = 0
    or position(
      'from public.reporter_live_requests where id = target_request_id for update'
      in function_definition
    ) > position(
      'from public.live_recordings where id = p_recording_id for update'
      in function_definition
    ) then
    raise exception 'publication lock order is not request then recording';
  end if;
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
      or (table_name = 'reporter_payments' and column_name = 'refund_retry_ready_at')
      or (table_name = 'story_locations' and column_name = 'exact_coordinates_deleted_at')
      or (table_name = 'live_recordings' and column_name in (
        'storage_deleted_at', 'deletion_lease_token',
        'deletion_lease_claimed_at', 'deletion_attempt_count',
        'deletion_failure_detail', 'deletion_retry_ready_at'
      ))
    );
  if required_lifecycle_columns <> 10 then
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

insert into auth.users (id, email) values
  ('85000000-0000-4000-8000-000000000001', 'temporary-reporter@example.test');

insert into public.profiles (id, username, display_name, role) values (
  '85000000-0000-4000-8000-000000000001',
  'reporter_8500000000004000',
  'Reporter applicant',
  'reader'
);

insert into public.reporter_applications (
  id,
  profile_id,
  legal_name,
  date_of_birth,
  age_18_declared,
  home_city,
  home_district,
  home_state,
  beats,
  public_photo_url,
  public_photo_id
) values (
  '85000000-0000-4000-8000-000000000010',
  '85000000-0000-4000-8000-000000000001',
  'Temporary Reporter',
  '1990-01-01',
  true,
  'Mumbai',
  'Mumbai City',
  'Maharashtra',
  array['civic'],
  'https://res.cloudinary.com/demo/image/upload/v1/inbcn/reporter/portrait/85000000-0000-4000-8000-000000000011.jpg',
  'inbcn/reporter/portrait/85000000-0000-4000-8000-000000000011'
);

insert into public.reporter_consents (
  application_id, profile_id, notice_key, notice_version, locale
)
select
  '85000000-0000-4000-8000-000000000010',
  '85000000-0000-4000-8000-000000000001',
  notice_key,
  '1.0',
  'en'
from unnest(array[
  'payment_refund', 'kyc', 'public_identity',
  'mandatory_location', 'recording', 'editorial_terms'
]) as notice_key;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select public.complete_temporary_reporter_payment(
  '85000000-0000-4000-8000-000000000001',
  '85000000-0000-4000-8000-000000000010'
);
select public.complete_temporary_reporter_payment(
  '85000000-0000-4000-8000-000000000001',
  '85000000-0000-4000-8000-000000000010'
);
select public.complete_temporary_reporter_kyc_approval(
  '85000000-0000-4000-8000-000000000001',
  '85000000-0000-4000-8000-000000000010'
);
select public.complete_temporary_reporter_kyc_approval(
  '85000000-0000-4000-8000-000000000001',
  '85000000-0000-4000-8000-000000000010'
);

do $$
declare
  reporter public.reporter_profiles%rowtype;
begin
  if (select count(*) from public.reporter_payments
      where application_id = '85000000-0000-4000-8000-000000000010') <> 1
    or (select count(*) from public.audit_events
      where subject_id = '85000000-0000-4000-8000-000000000010'
        and action = 'reporter.temporary_payment_completed') <> 1
    or (select count(*) from public.audit_events
      where subject_id = '85000000-0000-4000-8000-000000000010'
        and action = 'reporter.temporary_application_approved') <> 1 then
    raise exception 'temporary onboarding retries duplicated evidence';
  end if;

  select * into reporter
  from public.reporter_profiles
  where profile_id = '85000000-0000-4000-8000-000000000001';
  if not found
    or reporter.can_publish_directly
    or not reporter.can_broadcast_live
    or reporter.live_broadcast_grant_mode <> 'temporary'
    or reporter.public_photo_verification_mode <> 'temporary'
    or reporter.membership_expires_at <> reporter.membership_started_at + interval '1 year'
    or reporter.membership_grace_ends_at <> reporter.membership_expires_at + interval '7 days'
    or reporter.access_sync_status <> 'pending'
    or reporter.access_sync_operation <> 'approval'
    or reporter.access_sync_generation <> 1 then
    raise exception 'temporary reporter approval evidence is incorrect';
  end if;
end;
$$;

reset role;

rollback;
