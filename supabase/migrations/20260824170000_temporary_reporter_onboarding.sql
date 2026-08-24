-- Preview-only payment, KYC, approval, and Auth-claim synchronization.
-- Every shortcut carries explicit temporary provenance and remains service-only.

alter table public.reporter_payments
  add column payment_provider text not null default 'razorpay'
    constraint reporter_payments_payment_provider_check
    check (payment_provider in ('razorpay', 'temporary'));

alter table public.reporter_applications
  add column review_mode text not null default 'staff'
    constraint reporter_applications_review_mode_check
    check (review_mode in ('staff', 'temporary')),
  drop constraint reporter_applications_photo_verification_check,
  drop constraint reporter_applications_approval_check,
  add constraint reporter_applications_photo_verification_check check (
    (public_photo_verified_by is null and public_photo_verified_at is null)
    or (
      review_mode = 'staff'
      and public_photo_verified_by is not null
      and public_photo_verified_at is not null
    )
    or (
      review_mode = 'temporary'
      and public_photo_verified_by is null
      and public_photo_verified_at is not null
    )
  ),
  add constraint reporter_applications_approval_check check (
    status <> 'approved'
    or (
      approved_at is not null
      and reviewed_at is not null
      and rejected_at is null
      and verified_adult
      and (
        (review_mode = 'staff' and reviewed_by is not null)
        or (review_mode = 'temporary' and reviewed_by is null)
      )
    )
  );

alter table public.reporter_profiles
  alter column public_photo_verified_by drop not null,
  add column public_photo_verification_mode text not null default 'staff'
    constraint reporter_profiles_public_photo_verification_mode_check
    check (public_photo_verification_mode in ('staff', 'temporary')),
  add column live_broadcast_grant_mode text not null default 'staff'
    constraint reporter_profiles_live_broadcast_grant_mode_check
    check (live_broadcast_grant_mode in ('staff', 'temporary')),
  drop constraint reporter_profiles_live_grant_check,
  add constraint reporter_profiles_public_photo_verification_check check (
    (
      public_photo_verification_mode = 'staff'
      and public_photo_verified_by is not null
      and public_photo_verified_at is not null
    )
    or (
      public_photo_verification_mode = 'temporary'
      and public_photo_verified_by is null
      and public_photo_verified_at is not null
    )
  ),
  add constraint reporter_profiles_live_grant_check check (
    (
      live_broadcast_grant_mode = 'staff'
      and (
        (live_broadcast_granted_by is null and live_broadcast_granted_at is null)
        or (live_broadcast_granted_by is not null and live_broadcast_granted_at is not null)
      )
    )
    or (
      live_broadcast_grant_mode = 'temporary'
      and live_broadcast_granted_by is null
      and live_broadcast_granted_at is not null
    )
  );

alter table public.reporter_access_sync_attempts
  drop constraint reporter_access_sync_attempts_completion_status_check,
  drop constraint reporter_access_sync_attempts_completion_check,
  add constraint reporter_access_sync_attempts_completion_status_check check (
    completion_status in (
      'pending', 'succeeded', 'failed', 'stale_succeeded', 'stale_failed', 'expired'
    )
  ),
  add constraint reporter_access_sync_attempts_completion_check check (
    (
      completion_status = 'pending'
      and completed_at is null
      and failure_detail is null
    )
    or (
      completion_status in ('succeeded', 'stale_succeeded', 'expired')
      and completed_at is not null
      and failure_detail is null
    )
    or (
      completion_status in ('failed', 'stale_failed')
      and completed_at is not null
      and failure_detail = 'auth-claim-update-failed'
    )
  );

create or replace function private.normalize_reporter_live_grant_mode()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.live_broadcast_granted_by is not null then
    new.live_broadcast_grant_mode := 'staff';
  end if;
  return new;
end;
$$;

create or replace function public.complete_temporary_reporter_kyc_approval(
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
  current_payment public.reporter_payments%rowtype;
  current_profile public.profiles%rowtype;
  current_reporter public.reporter_profiles%rowtype;
  approval_time timestamptz := clock_timestamp();
  expiry_time timestamptz := approval_time + interval '1 year';
  expected_order_id text;
  expected_payment_id text;
begin
  if auth.jwt() ->> 'role' is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'TEMPORARY_REPORTER_APPROVAL_FORBIDDEN';
  end if;
  if p_profile_id is null or p_application_id is null then
    raise exception using errcode = '22023', message = 'TEMPORARY_REPORTER_APPROVAL_INVALID';
  end if;

  select * into current_application
  from public.reporter_applications
  where id = p_application_id and profile_id = p_profile_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'REPORTER_APPLICATION_NOT_FOUND';
  end if;

  select * into current_payment
  from public.reporter_payments
  where application_id = p_application_id and profile_id = p_profile_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'REPORTER_PAYMENT_NOT_FOUND';
  end if;

  select * into current_profile
  from public.profiles
  where id = p_profile_id
  for update;
  if not found or not current_profile.is_active then
    raise exception using errcode = 'P0002', message = 'REPORTER_PROFILE_NOT_FOUND';
  end if;

  select * into current_reporter
  from public.reporter_profiles
  where profile_id = p_profile_id
  for update;

  expected_order_id := 'temporary_order_' || replace(p_application_id::text, '-', '');
  expected_payment_id := 'temporary_payment_' || replace(p_application_id::text, '-', '');

  if current_application.status = 'approved'
    and current_application.review_mode = 'temporary'
    and current_application.kyc_provider = 'temporary'
    and current_reporter.profile_id = p_profile_id
    and current_reporter.public_photo_verification_mode = 'temporary'
    and current_reporter.access_sync_operation = 'approval'
    and current_reporter.access_sync_desired_role = 'reporter' then
    return jsonb_build_object(
      'state', 'completed',
      'profile_id', p_profile_id,
      'generation', current_reporter.access_sync_generation
    );
  end if;

  if current_application.status <> 'kyc_pending'
    or not current_application.age_18_declared
    or current_application.date_of_birth > (
      timezone('Asia/Kolkata', current_timestamp)::date - interval '18 years'
    )::date
    or length(btrim(current_application.legal_name)) not between 2 and 120 then
    raise exception using errcode = '23514', message = 'TEMPORARY_REPORTER_KYC_INVALID';
  end if;
  if current_payment.purpose <> 'application'
    or current_payment.amount_paise <> 10000
    or current_payment.currency <> 'INR'
    or current_payment.payment_provider <> 'temporary'
    or current_payment.payment_status <> 'captured'
    or current_payment.refund_status <> 'not_eligible'
    or current_payment.razorpay_order_id <> expected_order_id
    or current_payment.razorpay_payment_id <> expected_payment_id
    or current_payment.captured_at is null then
    raise exception using errcode = 'P0001', message = 'TEMPORARY_REPORTER_PAYMENT_INVALID';
  end if;
  if current_reporter.profile_id is not null
    or current_profile.role <> 'reader' then
    raise exception using errcode = 'P0001', message = 'TEMPORARY_REPORTER_PROFILE_INVALID_STATE';
  end if;

  update public.reporter_applications
  set status = 'approved',
      kyc_provider = 'temporary',
      kyc_reference = 'temporary_' || p_application_id::text,
      kyc_status = 'verified',
      kyc_started_at = approval_time,
      kyc_completed_at = approval_time,
      verified_legal_name = btrim(legal_name),
      verified_adult = true,
      submitted_at = coalesce(submitted_at, approval_time),
      review_mode = 'temporary',
      public_photo_verified_by = null,
      public_photo_verified_at = approval_time,
      reviewed_by = null,
      reviewed_at = approval_time,
      decision_reason = null,
      approved_at = approval_time,
      updated_at = approval_time
  where id = p_application_id;

  insert into public.reporter_profiles (
    profile_id,
    public_slug,
    legal_display_name,
    avatar_url,
    home_city,
    home_district,
    home_state,
    bio,
    beats,
    membership_started_at,
    membership_expires_at,
    membership_grace_ends_at,
    can_publish_directly,
    can_broadcast_live,
    live_broadcast_granted_by,
    live_broadcast_granted_at,
    live_broadcast_grant_mode,
    public_photo_verified_by,
    public_photo_verified_at,
    public_photo_verification_mode,
    access_sync_status,
    access_sync_operation,
    access_sync_generation,
    access_sync_desired_role,
    access_sync_claim_token,
    access_sync_claimed_at,
    access_sync_claim_generation,
    access_sync_completed_token,
    access_sync_failure_detail,
    access_sync_updated_at
  ) values (
    p_profile_id,
    current_profile.username,
    btrim(current_application.legal_name),
    current_application.public_photo_url,
    current_application.home_city,
    current_application.home_district,
    current_application.home_state,
    current_application.bio,
    current_application.beats,
    approval_time,
    expiry_time,
    expiry_time + interval '7 days',
    false,
    true,
    null,
    approval_time,
    'temporary',
    null,
    approval_time,
    'temporary',
    'pending',
    'approval',
    1,
    'reporter',
    null,
    null,
    null,
    null,
    null,
    approval_time
  );

  update public.reporter_payments
  set credited_membership_started_at = approval_time,
      credited_membership_expires_at = expiry_time,
      updated_at = approval_time
  where id = current_payment.id;

  update public.profiles
  set role = 'reporter', is_active = true, updated_at = approval_time
  where id = p_profile_id;

  insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata, created_at)
  values (
    null,
    'reporter.temporary_application_approved',
    'reporter_application',
    p_application_id,
    jsonb_build_object(
      'reporter_profile_id', p_profile_id,
      'review_mode', 'temporary',
      'access_sync_generation', 1
    ),
    approval_time
  );

  return jsonb_build_object('state', 'completed', 'profile_id', p_profile_id, 'generation', 1);
end;
$$;

create trigger normalize_reporter_live_grant_mode
before insert or update of live_broadcast_granted_by, live_broadcast_grant_mode
on public.reporter_profiles
for each row execute function private.normalize_reporter_live_grant_mode();

revoke all on function private.normalize_reporter_live_grant_mode()
from public, anon, authenticated, service_role;

create or replace function public.complete_temporary_reporter_payment(
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
  current_payment public.reporter_payments%rowtype;
  payment_found boolean := false;
  transition_time timestamptz := clock_timestamp();
  payment_id uuid;
  order_id text;
  provider_payment_id text;
begin
  if auth.jwt() ->> 'role' is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'TEMPORARY_REPORTER_PAYMENT_FORBIDDEN';
  end if;
  if p_profile_id is null or p_application_id is null then
    raise exception using errcode = '22023', message = 'TEMPORARY_REPORTER_PAYMENT_INVALID';
  end if;

  select * into current_application
  from public.reporter_applications
  where id = p_application_id and profile_id = p_profile_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'REPORTER_APPLICATION_NOT_FOUND';
  end if;

  select * into current_profile
  from public.profiles
  where id = p_profile_id
  for update;
  if not found or not current_profile.is_active or current_profile.role <> 'reader' then
    raise exception using errcode = 'P0002', message = 'REPORTER_PROFILE_NOT_FOUND';
  end if;

  select * into current_payment
  from public.reporter_payments
  where application_id = p_application_id
  for update;
  payment_found := found;

  order_id := 'temporary_order_' || replace(p_application_id::text, '-', '');
  provider_payment_id := 'temporary_payment_' || replace(p_application_id::text, '-', '');

  if payment_found
    and current_payment.profile_id = p_profile_id
    and current_payment.purpose = 'application'
    and current_payment.amount_paise = 10000
    and current_payment.currency = 'INR'
    and current_payment.payment_provider = 'temporary'
    and current_payment.payment_status = 'captured'
    and current_payment.razorpay_order_id = order_id
    and current_payment.razorpay_payment_id = provider_payment_id
    and current_payment.captured_at is not null then
    return jsonb_build_object('state', 'completed', 'payment_id', current_payment.id);
  end if;
  if payment_found or current_application.status not in ('draft', 'payment_pending') then
    raise exception using errcode = 'P0001', message = 'TEMPORARY_REPORTER_PAYMENT_INVALID_STATE';
  end if;

  if exists (
    select 1
    from (values
      ('payment_refund', '1.0'),
      ('kyc', '1.0'),
      ('public_identity', '1.0'),
      ('mandatory_location', '1.0'),
      ('recording', '1.0'),
      ('editorial_terms', '1.0')
    ) as required(notice_key, notice_version)
    where not exists (
      select 1
      from public.reporter_consents
      where reporter_consents.application_id = p_application_id
        and reporter_consents.profile_id = p_profile_id
        and reporter_consents.notice_key = required.notice_key
        and reporter_consents.notice_version = required.notice_version
        and reporter_consents.withdrawn_at is null
    )
  ) then
    raise exception using errcode = '23514', message = 'REPORTER_APPLICATION_CONSENTS_INCOMPLETE';
  end if;

  insert into public.reporter_payments (
    profile_id,
    application_id,
    purpose,
    amount_paise,
    currency,
    payment_provider,
    payment_status,
    refund_status,
    razorpay_order_id,
    razorpay_payment_id,
    captured_at,
    created_at,
    updated_at
  ) values (
    p_profile_id,
    p_application_id,
    'application',
    10000,
    'INR',
    'temporary',
    'captured',
    'not_eligible',
    order_id,
    provider_payment_id,
    transition_time,
    transition_time,
    transition_time
  ) returning id into payment_id;

  update public.reporter_applications
  set status = 'kyc_pending',
      completion_deadline = transition_time + interval '30 days',
      updated_at = transition_time
  where id = p_application_id;

  insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata, created_at)
  values (
    null,
    'reporter.temporary_payment_completed',
    'reporter_application',
    p_application_id,
    jsonb_build_object('payment_id', payment_id, 'amount_paise', 10000, 'currency', 'INR'),
    transition_time
  );

  return jsonb_build_object('state', 'completed', 'payment_id', payment_id);
end;
$$;

create or replace function public.claim_temporary_reporter_access_sync(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_reporter public.reporter_profiles%rowtype;
  claim_time timestamptz := clock_timestamp();
  claim_token uuid := gen_random_uuid();
begin
  if auth.jwt() ->> 'role' is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'TEMPORARY_ACCESS_SYNC_FORBIDDEN';
  end if;
  if p_profile_id is null then
    raise exception using errcode = '22023', message = 'TEMPORARY_ACCESS_SYNC_INVALID';
  end if;

  select * into current_reporter
  from public.reporter_profiles
  where profile_id = p_profile_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'REPORTER_PROFILE_NOT_FOUND';
  end if;
  if current_reporter.access_sync_operation is distinct from 'approval'
    or current_reporter.access_sync_desired_role is distinct from 'reporter' then
    raise exception using errcode = 'P0001', message = 'TEMPORARY_ACCESS_SYNC_INVALID_STATE';
  end if;
  if current_reporter.access_sync_status = 'succeeded' then
    return jsonb_build_object(
      'state', 'succeeded',
      'generation', current_reporter.access_sync_generation
    );
  end if;
  if current_reporter.access_sync_claim_token is not null
    and current_reporter.access_sync_claimed_at > claim_time - interval '5 minutes' then
    return jsonb_build_object(
      'state', 'busy',
      'generation', current_reporter.access_sync_generation
    );
  end if;

  update public.reporter_profiles
  set access_sync_status = 'pending',
      access_sync_failure_detail = null,
      access_sync_claim_token = claim_token,
      access_sync_claimed_at = claim_time,
      access_sync_claim_generation = current_reporter.access_sync_generation,
      access_sync_completed_token = null,
      access_sync_updated_at = claim_time,
      updated_at = claim_time
  where profile_id = p_profile_id;

  insert into public.reporter_access_sync_attempts (
    claim_token,
    profile_id,
    generation,
    desired_role,
    operation,
    claimed_at
  ) values (
    claim_token,
    p_profile_id,
    current_reporter.access_sync_generation,
    'reporter',
    'approval',
    claim_time
  );

  insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata, created_at)
  values (
    null,
    'reporter.temporary_access_sync_claimed',
    'reporter_profile',
    p_profile_id,
    jsonb_build_object(
      'generation', current_reporter.access_sync_generation,
      'desired_role', 'reporter',
      'operation', 'approval',
      'lease_seconds', 300
    ),
    claim_time
  );

  return jsonb_build_object(
    'state', 'claimed',
    'profile_id', p_profile_id,
    'generation', current_reporter.access_sync_generation,
    'claim_token', claim_token
  );
end;
$$;

create or replace function public.complete_temporary_reporter_access_sync(
  p_profile_id uuid,
  p_generation bigint,
  p_claim_token uuid,
  p_succeeded boolean,
  p_failure_detail text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_reporter public.reporter_profiles%rowtype;
  current_attempt public.reporter_access_sync_attempts%rowtype;
  current_metadata jsonb;
  completion_time timestamptz := clock_timestamp();
  completion_state text;
  metadata_matches boolean := false;
begin
  if auth.jwt() ->> 'role' is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'TEMPORARY_ACCESS_SYNC_FORBIDDEN';
  end if;
  if p_profile_id is null
    or p_generation is null or p_generation < 1
    or p_claim_token is null
    or p_succeeded is null
    or (p_succeeded and p_failure_detail is not null)
    or (not p_succeeded and p_failure_detail is distinct from 'auth-claim-update-failed') then
    raise exception using errcode = '22023', message = 'TEMPORARY_ACCESS_SYNC_INVALID';
  end if;

  select * into current_reporter
  from public.reporter_profiles
  where profile_id = p_profile_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'REPORTER_PROFILE_NOT_FOUND';
  end if;

  select * into current_attempt
  from public.reporter_access_sync_attempts
  where profile_id = p_profile_id
    and generation = p_generation
    and claim_token = p_claim_token
  for update;
  if not found then
    return jsonb_build_object('state', 'stale', 'generation', current_reporter.access_sync_generation);
  end if;
  if current_attempt.completion_status <> 'pending' then
    return jsonb_build_object(
      'state', case
        when current_attempt.completion_status = 'succeeded' then 'succeeded'
        when current_attempt.completion_status = 'failed' then 'failed'
        when current_attempt.completion_status = 'expired' then 'expired'
        else 'stale'
      end,
      'generation', current_reporter.access_sync_generation
    );
  end if;
  if current_reporter.access_sync_operation is distinct from 'approval'
    or current_reporter.access_sync_desired_role is distinct from 'reporter'
    or current_reporter.access_sync_generation <> p_generation
    or current_reporter.access_sync_claim_generation is distinct from p_generation
    or current_reporter.access_sync_claim_token is distinct from p_claim_token then
    return jsonb_build_object('state', 'stale', 'generation', current_reporter.access_sync_generation);
  end if;
  if current_reporter.access_sync_claimed_at <= completion_time - interval '5 minutes' then
    update public.reporter_access_sync_attempts
    set completion_status = 'expired', completed_at = completion_time
    where claim_token = p_claim_token and completion_status = 'pending';
    update public.reporter_profiles
    set access_sync_claim_token = null,
        access_sync_claimed_at = null,
        access_sync_claim_generation = null,
        access_sync_updated_at = completion_time,
        updated_at = completion_time
    where profile_id = p_profile_id
      and access_sync_claim_token = p_claim_token
      and access_sync_claim_generation = p_generation;
    return jsonb_build_object('state', 'expired', 'generation', p_generation);
  end if;

  if p_succeeded then
    select raw_app_meta_data into current_metadata
    from auth.users
    where id = p_profile_id;
    metadata_matches := current_metadata is not null
      and current_metadata ->> 'role' = 'reporter'
      and current_metadata -> 'reporter_access_generation' = to_jsonb(p_generation);
    if not metadata_matches then
      p_succeeded := false;
      p_failure_detail := 'auth-claim-update-failed';
    end if;
  end if;

  completion_state := case when p_succeeded then 'succeeded' else 'failed' end;
  update public.reporter_profiles
  set access_sync_status = completion_state,
      access_sync_failure_detail = p_failure_detail,
      access_sync_claim_token = null,
      access_sync_claimed_at = null,
      access_sync_claim_generation = null,
      access_sync_completed_token = case when p_succeeded then p_claim_token else null end,
      access_sync_updated_at = completion_time,
      updated_at = completion_time
  where profile_id = p_profile_id
    and access_sync_generation = p_generation
    and access_sync_claim_token = p_claim_token
    and access_sync_claim_generation = p_generation;
  if not found then
    raise exception using errcode = 'P0001', message = 'TEMPORARY_ACCESS_SYNC_CAS_FAILED';
  end if;

  update public.reporter_access_sync_attempts
  set completion_status = completion_state,
      completed_at = completion_time,
      failure_detail = p_failure_detail
  where claim_token = p_claim_token and completion_status = 'pending';
  if not found then
    raise exception using errcode = 'P0001', message = 'TEMPORARY_ACCESS_SYNC_CAS_FAILED';
  end if;

  insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata, created_at)
  values (
    null,
    case when p_succeeded
      then 'reporter.temporary_access_sync_succeeded'
      else 'reporter.temporary_access_sync_failed'
    end,
    'reporter_profile',
    p_profile_id,
    jsonb_build_object('generation', p_generation, 'failure_detail', p_failure_detail),
    completion_time
  );

  return jsonb_build_object('state', completion_state, 'generation', p_generation);
end;
$$;

revoke all on function public.complete_temporary_reporter_payment(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.complete_temporary_reporter_kyc_approval(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.claim_temporary_reporter_access_sync(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.complete_temporary_reporter_access_sync(uuid, bigint, uuid, boolean, text)
from public, anon, authenticated, service_role;

grant execute on function public.complete_temporary_reporter_payment(uuid, uuid)
to service_role;
grant execute on function public.complete_temporary_reporter_kyc_approval(uuid, uuid)
to service_role;
grant execute on function public.claim_temporary_reporter_access_sync(uuid)
to service_role;
grant execute on function public.complete_temporary_reporter_access_sync(uuid, bigint, uuid, boolean, text)
to service_role;
