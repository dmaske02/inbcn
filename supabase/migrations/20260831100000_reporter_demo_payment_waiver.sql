create table public.reporter_demo_payment_waivers (
  application_id uuid primary key,
  profile_id uuid not null,
  waived_at timestamptz not null default now(),
  constraint reporter_demo_payment_waivers_application_profile_fkey
    foreign key (application_id, profile_id) references public.reporter_applications (id, profile_id) on delete cascade
);

alter table public.reporter_demo_payment_waivers enable row level security;
revoke all on table public.reporter_demo_payment_waivers from public, anon, authenticated;
grant select, insert on table public.reporter_demo_payment_waivers to service_role;

create or replace function public.waive_demo_reporter_application_payment(
  p_profile_id uuid,
  p_application_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_application public.reporter_applications%rowtype;
  current_profile public.profiles%rowtype;
  current_auth_user auth.users%rowtype;
  existing_waiver public.reporter_demo_payment_waivers%rowtype;
  existing_audit_count integer;
  transition_time timestamptz := statement_timestamp();
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into current_application
  from public.reporter_applications
  where id = p_application_id and profile_id = p_profile_id
  for update;
  if not found then raise exception 'application not found' using errcode = 'P0002'; end if;

  select * into current_profile from public.profiles as candidate where candidate.id = p_profile_id for update;
  if not found or current_profile.role <> 'reader' or not current_profile.is_active then
    raise exception 'profile ineligible' using errcode = '42501';
  end if;

  select * into current_auth_user from auth.users where id = p_profile_id;
  if not found
    or replace(coalesce(current_auth_user.phone, ''), '+', '') <> '919000000829'
    or coalesce((current_auth_user.raw_app_meta_data ->> 'reporter_demo_identity')::boolean, false) is not true then
    raise exception 'demo identity required' using errcode = '42501';
  end if;

  if exists (select 1 from public.reporter_profiles where profile_id = p_profile_id) then
    raise exception 'reporter already exists' using errcode = '42501';
  end if;
  if exists (select 1 from public.reporter_payments where application_id = p_application_id) then
    raise exception 'payment already exists' using errcode = '23505';
  end if;
  if not exists (
    select 1 from public.reporter_consents
    where application_id = p_application_id and profile_id = p_profile_id and withdrawn_at is null
    group by application_id
    having count(*) filter (where notice_key = 'payment_refund' and notice_version = '1.0') > 0
       and count(*) filter (where notice_key = 'kyc' and notice_version = '1.0') > 0
       and count(*) filter (where notice_key = 'public_identity' and notice_version = '1.0') > 0
       and count(*) filter (where notice_key = 'mandatory_location' and notice_version = '1.0') > 0
       and count(*) filter (where notice_key = 'recording' and notice_version = '1.0') > 0
       and count(*) filter (where notice_key = 'editorial_terms' and notice_version = '1.0') > 0
  ) then raise exception 'consents incomplete' using errcode = '42501'; end if;

  select * into existing_waiver from public.reporter_demo_payment_waivers
  where application_id = p_application_id;
  if found then
    select count(*) into existing_audit_count from public.audit_events
    where subject_type = 'reporter_application' and subject_id = p_application_id
      and action = 'reporter.demo_payment_waived';
    if existing_waiver.profile_id <> p_profile_id or current_application.status <> 'kyc_pending'
      or current_application.completion_deadline is null or existing_audit_count <> 1 then
      raise exception 'inconsistent waiver state' using errcode = '55000';
    end if;
    return jsonb_build_object('state', 'waived', 'application_id', p_application_id,
      'status', current_application.status, 'waived_at', existing_waiver.waived_at);
  end if;

  if current_application.status not in ('draft', 'payment_pending') then
    raise exception 'invalid application state' using errcode = '55000';
  end if;

  insert into public.reporter_demo_payment_waivers (application_id, profile_id, waived_at)
  values (p_application_id, p_profile_id, transition_time);
  update public.reporter_applications
  set status = 'kyc_pending', completion_deadline = transition_time + interval '30 days', updated_at = transition_time
  where id = p_application_id and profile_id = p_profile_id;
  insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata)
  values (p_profile_id, 'reporter.demo_payment_waived', 'reporter_application', p_application_id,
    jsonb_build_object('demo_only', true, 'from_status', current_application.status,
      'to_status', 'kyc_pending', 'profile_id', p_profile_id, 'payment_record_created', false));
  return jsonb_build_object('state', 'waived', 'application_id', p_application_id,
    'status', 'kyc_pending', 'waived_at', transition_time);
end;
$$;

revoke all on function public.waive_demo_reporter_application_payment(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.waive_demo_reporter_application_payment(uuid, uuid) to service_role;
