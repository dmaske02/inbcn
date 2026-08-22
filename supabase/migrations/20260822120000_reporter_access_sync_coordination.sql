-- Serialize signed reporter-role synchronization without pretending that Auth and
-- Postgres share a transaction. Database authorization remains the fail-closed
-- source of truth until the current generation is confirmed.

alter table public.reporter_profiles
  add column access_sync_generation bigint not null default 0
    check (access_sync_generation >= 0),
  add column access_sync_desired_role text not null default 'reporter'
    check (access_sync_desired_role in ('none', 'reporter')),
  add column access_sync_claim_token uuid,
  add column access_sync_claimed_at timestamptz,
  add column access_sync_claim_generation bigint,
  add column access_sync_completed_token uuid,
  add column suspension_token uuid;

update public.reporter_profiles
set access_sync_generation = case
      when access_sync_operation is null then 0
      else 1
    end,
    access_sync_desired_role = case
      when access_sync_operation = 'suspension' then 'none'
      else 'reporter'
    end,
    suspension_token = case
      when public_status = 'suspended' then gen_random_uuid()
      else null
    end;

alter table public.reporter_profiles
  add constraint reporter_profiles_access_sync_claim_check check (
    (
      access_sync_claim_token is null
      and access_sync_claimed_at is null
      and access_sync_claim_generation is null
    )
    or (
      access_sync_claim_token is not null
      and access_sync_claimed_at is not null
      and access_sync_claim_generation is not null
      and access_sync_claim_generation <= access_sync_generation
    )
  ),
  add constraint reporter_profiles_access_sync_completion_check check (
    (access_sync_status <> 'succeeded' or access_sync_claim_token is null)
    and (
      access_sync_completed_token is null
      or (access_sync_status = 'succeeded' and access_sync_claim_token is null)
    )
  ),
  drop constraint reporter_profiles_suspension_check,
  add constraint reporter_profiles_suspension_check check (
    (
      public_status = 'suspended'
      and suspended_by is not null
      and suspended_at is not null
      and suspension_reason is not null
      and length(btrim(suspension_reason)) > 0
      and suspension_token is not null
    )
    or (
      public_status <> 'suspended'
      and suspended_by is null
      and suspended_at is null
      and suspension_reason is null
      and suspension_token is null
    )
  );

alter table public.profiles
  add column reporter_suspension_token uuid,
  add column reporter_suspension_reason text,
  add column reporter_suspended_by uuid references public.profiles (id) on delete restrict,
  add column reporter_suspended_at timestamptz;

update public.profiles
set reporter_suspension_token = reporter_profiles.suspension_token,
    reporter_suspension_reason = reporter_profiles.suspension_reason,
    reporter_suspended_by = reporter_profiles.suspended_by,
    reporter_suspended_at = reporter_profiles.suspended_at
from public.reporter_profiles
where reporter_profiles.profile_id = profiles.id
  and reporter_profiles.public_status = 'suspended';

alter table public.profiles
  add constraint profiles_reporter_suspension_check check (
    (
      reporter_suspension_token is null
      and reporter_suspension_reason is null
      and reporter_suspended_by is null
      and reporter_suspended_at is null
    )
    or (
      reporter_suspension_token is not null
      and reporter_suspension_reason is not null
      and length(btrim(reporter_suspension_reason)) > 0
      and reporter_suspended_by is not null
      and reporter_suspended_at is not null
      and not is_active
    )
  );

create table public.reporter_access_sync_attempts (
  claim_token uuid primary key,
  profile_id uuid not null references public.reporter_profiles (profile_id) on delete restrict,
  generation bigint not null check (generation >= 1),
  desired_role text not null check (desired_role in ('none', 'reporter')),
  operation text not null check (operation in ('approval', 'suspension', 'reinstatement')),
  claimed_at timestamptz not null,
  completion_status text not null default 'pending'
    check (completion_status in (
      'pending', 'succeeded', 'failed', 'stale_succeeded', 'stale_failed'
    )),
  completed_at timestamptz,
  failure_detail text check (failure_detail in ('auth-claim-update-failed')),

  constraint reporter_access_sync_attempts_completion_check check (
    (
      completion_status = 'pending'
      and completed_at is null
      and failure_detail is null
    )
    or (
      completion_status in ('succeeded', 'stale_succeeded')
      and completed_at is not null
      and failure_detail is null
    )
    or (
      completion_status in ('failed', 'stale_failed')
      and completed_at is not null
      and failure_detail = 'auth-claim-update-failed'
    )
  )
);

create index reporter_access_sync_attempts_profile_generation_idx
  on public.reporter_access_sync_attempts (profile_id, generation, claimed_at desc);

alter table public.reporter_access_sync_attempts enable row level security;
revoke all on table public.reporter_access_sync_attempts
from public, anon, authenticated, service_role;

-- These provenance fields are writable only through the security-definer
-- transition functions below. Existing profile capabilities remain subject to RLS.
revoke update on table public.profiles from authenticated;
grant update (
  avatar_url,
  bio,
  display_name,
  is_active,
  preferred_language_id,
  role,
  updated_at,
  username
) on table public.profiles to authenticated;

create or replace function public.approve_reporter_application(
  p_application_id uuid,
  p_public_photo_identity_match boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  current_application public.reporter_applications%rowtype;
  current_payment public.reporter_payments%rowtype;
  current_profile public.profiles%rowtype;
  approval_time timestamptz := clock_timestamp();
  expiry_time timestamptz := approval_time + interval '1 year';
begin
  if actor_id is null or actor_role <> 'admin'
    or not exists (
      select 1 from public.profiles
      where id = actor_id and role = 'admin' and is_active
    ) then
    raise exception using errcode = '42501', message = 'REPORTER_APPROVAL_FORBIDDEN';
  end if;
  if p_public_photo_identity_match is distinct from true then
    raise exception using errcode = '22023', message = 'REPORTER_PUBLIC_PHOTO_MATCH_REQUIRED';
  end if;

  select * into current_application
  from public.reporter_applications
  where id = p_application_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'REPORTER_APPLICATION_NOT_FOUND';
  end if;
  if current_application.status = 'approved' then
    return current_application.profile_id;
  end if;
  if current_application.status <> 'under_review' then
    raise exception using errcode = 'P0001', message = 'REPORTER_APPLICATION_INVALID_STATE';
  end if;
  if current_application.kyc_status <> 'verified'
    or current_application.verified_legal_name is null
    or length(btrim(current_application.verified_legal_name)) = 0
    or current_application.verified_adult is distinct from true then
    raise exception using errcode = '23514', message = 'REPORTER_APPLICATION_NOT_VERIFIED';
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
      where reporter_consents.application_id = current_application.id
        and reporter_consents.profile_id = current_application.profile_id
        and reporter_consents.notice_key = required.notice_key
        and reporter_consents.notice_version = required.notice_version
        and reporter_consents.withdrawn_at is null
    )
  ) then
    raise exception using errcode = '23514', message = 'REPORTER_APPLICATION_CONSENTS_INCOMPLETE';
  end if;

  select * into current_payment
  from public.reporter_payments
  where application_id = current_application.id
  for update;
  if not found or current_payment.payment_status <> 'captured'
    or current_payment.amount_paise <> 10000
    or current_payment.currency <> 'INR'
    or current_payment.razorpay_payment_id is null
    or current_payment.captured_at is null
    or current_payment.refund_status <> 'not_eligible' then
    raise exception using errcode = 'P0001', message = 'REPORTER_APPLICATION_PAYMENT_INVALID';
  end if;

  select * into current_profile
  from public.profiles
  where id = current_application.profile_id
  for update;
  if not found or not current_profile.is_active or current_profile.role <> 'reader' then
    raise exception using errcode = 'P0002', message = 'REPORTER_PROFILE_NOT_FOUND';
  end if;

  update public.reporter_applications
  set status = 'approved',
      public_photo_verified_by = actor_id,
      public_photo_verified_at = approval_time,
      reviewed_by = actor_id,
      reviewed_at = approval_time,
      decision_reason = null,
      approved_at = approval_time,
      updated_at = approval_time
  where id = current_application.id;

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
    public_photo_verified_by,
    public_photo_verified_at,
    access_sync_status,
    access_sync_operation,
    access_sync_generation,
    access_sync_desired_role,
    access_sync_claim_token,
    access_sync_claimed_at,
    access_sync_claim_generation,
    access_sync_completed_token,
    access_sync_updated_at
  ) values (
    current_application.profile_id,
    current_profile.username,
    current_application.verified_legal_name,
    current_application.public_photo_url,
    current_application.home_city,
    current_application.home_district,
    current_application.home_state,
    current_application.bio,
    current_application.beats,
    approval_time,
    expiry_time,
    expiry_time + interval '7 days',
    actor_id,
    approval_time,
    'pending',
    'approval',
    1,
    'reporter',
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
  where id = current_application.profile_id;

  insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata)
  values (
    actor_id,
    'reporter.application_approved',
    'reporter_application',
    current_application.id,
    jsonb_build_object(
      'reporter_profile_id', current_application.profile_id,
      'public_photo_identity_match', true,
      'access_sync_status', 'pending',
      'access_sync_generation', 1,
      'access_sync_desired_role', 'reporter'
    )
  );
  return current_application.profile_id;
end;
$$;

create or replace function public.suspend_reporter(
  p_profile_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  current_reporter public.reporter_profiles%rowtype;
  current_profile public.profiles%rowtype;
  suspension_time timestamptz := clock_timestamp();
  new_suspension_token uuid := gen_random_uuid();
  next_generation bigint;
begin
  if actor_id is null or actor_role <> 'admin'
    or not exists (
      select 1 from public.profiles
      where id = actor_id and role = 'admin' and is_active
    ) then
    raise exception using errcode = '42501', message = 'REPORTER_SUSPENSION_FORBIDDEN';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception using errcode = '22023', message = 'REPORTER_SUSPENSION_REASON_REQUIRED';
  end if;

  select * into current_reporter
  from public.reporter_profiles
  where profile_id = p_profile_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'REPORTER_PROFILE_NOT_FOUND';
  end if;
  select * into current_profile
  from public.profiles
  where id = p_profile_id
  for update;
  if not found or current_profile.role <> 'reporter' then
    raise exception using errcode = 'P0002', message = 'REPORTER_PROFILE_NOT_FOUND';
  end if;
  if not current_profile.is_active then
    raise exception using errcode = 'P0001', message = 'REPORTER_ALREADY_INACTIVE';
  end if;
  if current_reporter.public_status = 'suspended' then
    raise exception using errcode = 'P0001', message = 'REPORTER_ALREADY_SUSPENDED';
  end if;
  if current_reporter.suspension_token is not null
    or current_profile.reporter_suspension_token is not null then
    raise exception using errcode = 'P0001', message = 'REPORTER_SUSPENSION_PROVENANCE_INVALID';
  end if;

  next_generation := current_reporter.access_sync_generation + 1;
  update public.reporter_profiles
  set public_status = 'suspended',
      can_publish_directly = false,
      direct_publish_revoked_by = actor_id,
      direct_publish_revoked_at = suspension_time,
      can_broadcast_live = false,
      live_broadcast_revoked_by = actor_id,
      live_broadcast_revoked_at = suspension_time,
      suspended_by = actor_id,
      suspended_at = suspension_time,
      suspension_reason = btrim(p_reason),
      suspension_token = new_suspension_token,
      access_sync_generation = current_reporter.access_sync_generation + 1,
      access_sync_desired_role = 'none',
      access_sync_status = 'pending',
      access_sync_operation = 'suspension',
      access_sync_failure_detail = null,
      access_sync_completed_token = null,
      access_sync_updated_at = suspension_time,
      updated_at = suspension_time
  where profile_id = p_profile_id;
  update public.profiles
  set is_active = false,
      reporter_suspension_token = new_suspension_token,
      reporter_suspension_reason = btrim(p_reason),
      reporter_suspended_by = actor_id,
      reporter_suspended_at = suspension_time,
      updated_at = suspension_time
  where id = p_profile_id;
  insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata)
  values (
    actor_id,
    'reporter.suspended',
    'reporter_profile',
    p_profile_id,
    jsonb_build_object(
      'reason', btrim(p_reason),
      'suspension_token', new_suspension_token,
      'database_access', 'disabled',
      'trust_flags', 'disabled',
      'signed_claim_sync', 'pending',
      'access_sync_generation', next_generation,
      'access_sync_desired_role', 'none',
      'session_revocation', 'unsupported-user-id-api'
    )
  );
  return p_profile_id;
end;
$$;

create or replace function public.reinstate_reporter(p_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  current_reporter public.reporter_profiles%rowtype;
  current_profile public.profiles%rowtype;
  reinstatement_time timestamptz := clock_timestamp();
  restored_status text;
  next_generation bigint;
begin
  if actor_id is null or actor_role <> 'admin'
    or not exists (
      select 1 from public.profiles
      where id = actor_id and role = 'admin' and is_active
    ) then
    raise exception using errcode = '42501', message = 'REPORTER_REINSTATEMENT_FORBIDDEN';
  end if;
  select * into current_reporter
  from public.reporter_profiles
  where profile_id = p_profile_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'REPORTER_PROFILE_NOT_FOUND';
  end if;
  select * into current_profile
  from public.profiles
  where id = p_profile_id
  for update;
  if not found or current_profile.role <> 'reporter' then
    raise exception using errcode = 'P0002', message = 'REPORTER_PROFILE_NOT_FOUND';
  end if;
  if current_reporter.public_status <> 'suspended' then
    if current_reporter.access_sync_operation = 'reinstatement' then
      return p_profile_id;
    end if;
    raise exception using errcode = 'P0001', message = 'REPORTER_NOT_SUSPENDED';
  end if;
  if current_profile.is_active then
    raise exception using errcode = 'P0001', message = 'REPORTER_SUSPENSION_PROVENANCE_INVALID';
  end if;
  if current_reporter.suspension_token is null
    or current_profile.reporter_suspension_token is distinct from current_reporter.suspension_token
    or current_profile.reporter_suspension_reason is null
    or current_profile.reporter_suspension_reason <> current_reporter.suspension_reason
    or current_profile.reporter_suspended_by is distinct from current_reporter.suspended_by
    or current_profile.reporter_suspended_at is distinct from current_reporter.suspended_at then
    raise exception using errcode = 'P0001', message = 'REPORTER_SUSPENSION_PROVENANCE_INVALID';
  end if;

  restored_status := case
    when current_reporter.membership_expires_at >= reinstatement_time then 'active'
    when current_reporter.membership_grace_ends_at >= reinstatement_time then 'grace'
    else 'expired'
  end;
  next_generation := current_reporter.access_sync_generation + 1;
  update public.reporter_profiles
  set public_status = restored_status,
      can_publish_directly = false,
      can_broadcast_live = false,
      suspended_by = null,
      suspended_at = null,
      suspension_reason = null,
      suspension_token = null,
      access_sync_generation = current_reporter.access_sync_generation + 1,
      access_sync_desired_role = 'reporter',
      access_sync_status = 'pending',
      access_sync_operation = 'reinstatement',
      access_sync_failure_detail = null,
      access_sync_completed_token = null,
      access_sync_updated_at = reinstatement_time,
      updated_at = reinstatement_time
  where profile_id = p_profile_id;
  update public.profiles
  set is_active = true,
      reporter_suspension_token = null,
      reporter_suspension_reason = null,
      reporter_suspended_by = null,
      reporter_suspended_at = null,
      updated_at = reinstatement_time
  where id = p_profile_id;
  insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata)
  values (
    actor_id,
    'reporter.reinstated',
    'reporter_profile',
    p_profile_id,
    jsonb_build_object(
      'membership_status', restored_status,
      'trust_flags_restored', false,
      'signed_claim_sync', 'pending',
      'access_sync_generation', next_generation,
      'access_sync_desired_role', 'reporter'
    )
  );
  return p_profile_id;
end;
$$;

create or replace function public.claim_reporter_access_sync(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  current_reporter public.reporter_profiles%rowtype;
  claim_time timestamptz := clock_timestamp();
  claim_token uuid := gen_random_uuid();
begin
  if actor_id is null or actor_role <> 'admin'
    or not exists (
      select 1 from public.profiles
      where id = actor_id and role = 'admin' and is_active
    ) then
    raise exception using errcode = '42501', message = 'REPORTER_ACCESS_SYNC_FORBIDDEN';
  end if;
  select * into current_reporter
  from public.reporter_profiles
  where profile_id = p_profile_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'REPORTER_PROFILE_NOT_FOUND';
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
    current_reporter.access_sync_desired_role,
    current_reporter.access_sync_operation,
    claim_time
  );
  insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata)
  values (
    actor_id,
    'reporter.access_sync_claimed',
    'reporter_profile',
    p_profile_id,
    jsonb_build_object(
      'generation', current_reporter.access_sync_generation,
      'desired_role', current_reporter.access_sync_desired_role,
      'operation', current_reporter.access_sync_operation,
      'lease_seconds', 300
    )
  );
  return jsonb_build_object(
    'state', 'claimed',
    'profile_id', p_profile_id,
    'operation', current_reporter.access_sync_operation,
    'desired_role', current_reporter.access_sync_desired_role,
    'generation', current_reporter.access_sync_generation,
    'claim_token', claim_token
  );
end;
$$;

revoke all on function public.complete_reporter_access_sync(uuid, text, boolean, text)
from public, anon, authenticated, service_role;
drop function public.complete_reporter_access_sync(uuid, text, boolean, text);

create or replace function public.complete_reporter_access_sync(
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
  actor_id uuid := auth.uid();
  actor_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  current_reporter public.reporter_profiles%rowtype;
  current_attempt public.reporter_access_sync_attempts%rowtype;
  completion_time timestamptz := clock_timestamp();
  completion_state text;
  owns_active_lease boolean;
  repair_generation bigint;
begin
  if actor_id is null or actor_role <> 'admin'
    or not exists (
      select 1 from public.profiles
      where id = actor_id and role = 'admin' and is_active
    ) then
    raise exception using errcode = '42501', message = 'REPORTER_ACCESS_SYNC_FORBIDDEN';
  end if;
  if p_generation is null or p_generation < 1
    or p_claim_token is null
    or p_succeeded is null
    or (p_succeeded and p_failure_detail is not null)
    or (not p_succeeded and p_failure_detail is distinct from 'auth-claim-update-failed') then
    raise exception using errcode = '22023', message = 'REPORTER_ACCESS_SYNC_INVALID';
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
    return jsonb_build_object(
      'state', 'stale',
      'generation', current_reporter.access_sync_generation
    );
  end if;

  -- Attempt success is monotonic. A same-generation duplicate failure from the
  -- completing holder can observe success but can never downgrade it.
  if current_attempt.completion_status = 'succeeded' then
    if current_reporter.access_sync_generation = p_generation
      and current_reporter.access_sync_status = 'succeeded'
      and current_reporter.access_sync_completed_token = p_claim_token then
      return jsonb_build_object('state', 'succeeded', 'generation', p_generation);
    end if;
    return jsonb_build_object(
      'state', 'stale',
      'generation', current_reporter.access_sync_generation
    );
  end if;
  if current_attempt.completion_status <> 'pending' then
    return jsonb_build_object(
      'state', case
        when current_attempt.completion_status = 'failed' then 'failed'
        else 'stale'
      end,
      'generation', current_reporter.access_sync_generation
    );
  end if;

  owns_active_lease := current_reporter.access_sync_claim_token is not distinct from p_claim_token
    and current_reporter.access_sync_claim_generation is not distinct from p_generation;
  if not owns_active_lease
    or current_reporter.access_sync_generation <> p_generation then
    update public.reporter_access_sync_attempts
    set completion_status = case when p_succeeded
          then 'stale_succeeded'
          else 'stale_failed'
        end,
        completed_at = completion_time,
        failure_detail = p_failure_detail
    where claim_token = p_claim_token
      and completion_status = 'pending';

    if owns_active_lease then
      update public.reporter_profiles
      set access_sync_claim_token = null,
          access_sync_claimed_at = null,
          access_sync_claim_generation = null,
          access_sync_updated_at = completion_time,
          updated_at = completion_time
      where profile_id = p_profile_id
        and access_sync_claim_token = p_claim_token
        and access_sync_claim_generation = p_generation;
    end if;

    -- A successful late Auth write can have landed after the current generation's
    -- write. Queue a new generation with the same DB-owned desired role so the
    -- database remains fail closed until that ordering is repaired.
    if p_succeeded then
      repair_generation := current_reporter.access_sync_generation + 1;
      update public.reporter_profiles
      set access_sync_generation = access_sync_generation + 1,
          access_sync_status = 'pending',
          access_sync_failure_detail = null,
          access_sync_completed_token = null,
          access_sync_updated_at = completion_time,
          updated_at = completion_time
      where profile_id = p_profile_id;
    else
      repair_generation := current_reporter.access_sync_generation;
    end if;

    insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata)
    values (
      actor_id,
      case when p_succeeded
        then 'reporter.access_sync_stale_succeeded'
        else 'reporter.access_sync_stale_failed'
      end,
      'reporter_profile',
      p_profile_id,
      jsonb_build_object(
        'claimed_generation', p_generation,
        'claimed_desired_role', current_attempt.desired_role,
        'current_generation', current_reporter.access_sync_generation,
        'repair_generation', repair_generation,
        'current_desired_role', current_reporter.access_sync_desired_role,
        'failure_detail', p_failure_detail
      )
    );
    return jsonb_build_object('state', 'stale', 'generation', repair_generation);
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
    raise exception using errcode = 'P0001', message = 'REPORTER_ACCESS_SYNC_CAS_FAILED';
  end if;
  update public.reporter_access_sync_attempts
  set completion_status = completion_state,
      completed_at = completion_time,
      failure_detail = p_failure_detail
  where claim_token = p_claim_token
    and completion_status = 'pending';
  if not found then
    raise exception using errcode = 'P0001', message = 'REPORTER_ACCESS_SYNC_CAS_FAILED';
  end if;
  insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata)
  values (
    actor_id,
    case when p_succeeded
      then 'reporter.access_sync_succeeded'
      else 'reporter.access_sync_failed'
    end,
    'reporter_profile',
    p_profile_id,
    jsonb_build_object(
      'generation', p_generation,
      'desired_role', current_attempt.desired_role,
      'operation', current_attempt.operation,
      'failure_detail', p_failure_detail
    )
  );
  return jsonb_build_object('state', completion_state, 'generation', p_generation);
end;
$$;

revoke all on function public.approve_reporter_application(uuid, boolean)
from public, anon, authenticated, service_role;
revoke all on function public.suspend_reporter(uuid, text)
from public, anon, authenticated, service_role;
revoke all on function public.reinstate_reporter(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.claim_reporter_access_sync(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.complete_reporter_access_sync(uuid, bigint, uuid, boolean, text)
from public, anon, authenticated, service_role;

grant execute on function public.approve_reporter_application(uuid, boolean)
to authenticated;
grant execute on function public.suspend_reporter(uuid, text)
to authenticated;
grant execute on function public.reinstate_reporter(uuid)
to authenticated;
grant execute on function public.claim_reporter_access_sync(uuid)
to authenticated;
grant execute on function public.complete_reporter_access_sync(uuid, bigint, uuid, boolean, text)
to authenticated;
