-- Admin reporter decisions and fail-closed signed-access synchronization.

alter table public.reporter_profiles
  add column access_sync_status text not null default 'succeeded'
    check (access_sync_status in ('pending', 'succeeded', 'failed')),
  add column access_sync_operation text
    check (access_sync_operation in ('approval', 'suspension', 'reinstatement')),
  add column access_sync_failure_detail text
    check (access_sync_failure_detail in ('auth-claim-update-failed')),
  add column access_sync_updated_at timestamptz not null default now(),
  add constraint reporter_profiles_access_sync_check check (
    (access_sync_status = 'succeeded' and access_sync_failure_detail is null)
    or (
      access_sync_status = 'pending'
      and access_sync_operation is not null
      and access_sync_failure_detail is null
    )
    or (
      access_sync_status = 'failed'
      and access_sync_operation is not null
      and access_sync_failure_detail is not null
    )
  );

revoke all on function public.approve_reporter_application(uuid)
from public, anon, authenticated, service_role;
drop function public.approve_reporter_application(uuid);

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
      'access_sync_status', 'pending'
    )
  );
  return current_application.profile_id;
end;
$$;

create or replace function public.reject_reporter_application(
  p_application_id uuid,
  p_decision_reason text
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
  rejection_time timestamptz := clock_timestamp();
begin
  if actor_id is null or actor_role <> 'admin'
    or not exists (
      select 1 from public.profiles
      where id = actor_id and role = 'admin' and is_active
    ) then
    raise exception using errcode = '42501', message = 'REPORTER_REJECTION_FORBIDDEN';
  end if;
  if p_decision_reason is null or length(btrim(p_decision_reason)) = 0 then
    raise exception using errcode = '22023', message = 'REPORTER_REJECTION_REASON_REQUIRED';
  end if;

  select * into current_application
  from public.reporter_applications
  where id = p_application_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'REPORTER_APPLICATION_NOT_FOUND';
  end if;

  select * into current_payment
  from public.reporter_payments
  where application_id = current_application.id
  for update;
  if not found or current_payment.payment_status <> 'captured'
    or current_payment.amount_paise <> 10000
    or current_payment.currency <> 'INR'
    or current_payment.razorpay_payment_id is null then
    raise exception using errcode = 'P0001', message = 'REPORTER_APPLICATION_PAYMENT_INVALID';
  end if;
  if current_application.status = 'rejected' then
    if current_payment.refund_status not in ('refund_pending', 'refund_failed', 'refunded') then
      raise exception using errcode = 'P0001', message = 'REPORTER_APPLICATION_REFUND_INVALID';
    end if;
    return current_payment.id;
  end if;
  if current_application.status <> 'under_review'
    or current_payment.refund_status <> 'not_eligible' then
    raise exception using errcode = 'P0001', message = 'REPORTER_APPLICATION_INVALID_STATE';
  end if;

  update public.reporter_applications
  set status = 'rejected',
      reviewed_by = actor_id,
      reviewed_at = rejection_time,
      decision_reason = btrim(p_decision_reason),
      rejected_at = rejection_time,
      refund_eligible_at = rejection_time,
      updated_at = rejection_time
  where id = current_application.id;
  update public.reporter_payments
  set refund_status = 'refund_pending',
      refund_eligible_at = rejection_time,
      updated_at = rejection_time
  where id = current_payment.id;
  insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata)
  values (
    actor_id,
    'reporter.application_rejected',
    'reporter_application',
    current_application.id,
    jsonb_build_object('payment_id', current_payment.id)
  );
  return current_payment.id;
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
  if current_reporter.public_status = 'suspended' then
    return p_profile_id;
  end if;

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
      access_sync_status = 'pending',
      access_sync_operation = 'suspension',
      access_sync_failure_detail = null,
      access_sync_updated_at = suspension_time,
      updated_at = suspension_time
  where profile_id = p_profile_id;
  update public.profiles
  set is_active = false, updated_at = suspension_time
  where id = p_profile_id;
  insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata)
  values (
    actor_id,
    'reporter.suspended',
    'reporter_profile',
    p_profile_id,
    jsonb_build_object(
      'reason', btrim(p_reason),
      'session_revocation', 'unsupported-user-id-api',
      'access_revocation', 'database-and-signed-claim'
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

  restored_status := case
    when current_reporter.membership_expires_at >= reinstatement_time then 'active'
    when current_reporter.membership_grace_ends_at >= reinstatement_time then 'grace'
    else 'expired'
  end;
  update public.reporter_profiles
  set public_status = restored_status,
      can_publish_directly = false,
      can_broadcast_live = false,
      suspended_by = null,
      suspended_at = null,
      suspension_reason = null,
      access_sync_status = 'pending',
      access_sync_operation = 'reinstatement',
      access_sync_failure_detail = null,
      access_sync_updated_at = reinstatement_time,
      updated_at = reinstatement_time
  where profile_id = p_profile_id;
  update public.profiles
  set is_active = true, updated_at = reinstatement_time
  where id = p_profile_id;
  insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata)
  values (
    actor_id,
    'reporter.reinstated',
    'reporter_profile',
    p_profile_id,
    jsonb_build_object('membership_status', restored_status, 'trust_flags_restored', false)
  );
  return p_profile_id;
end;
$$;

create or replace function public.complete_reporter_access_sync(
  p_profile_id uuid,
  p_operation text,
  p_succeeded boolean,
  p_failure_detail text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  current_reporter public.reporter_profiles%rowtype;
  completion_time timestamptz := clock_timestamp();
begin
  if actor_id is null or actor_role <> 'admin'
    or not exists (
      select 1 from public.profiles
      where id = actor_id and role = 'admin' and is_active
    ) then
    raise exception using errcode = '42501', message = 'REPORTER_ACCESS_SYNC_FORBIDDEN';
  end if;
  if p_operation not in ('approval', 'suspension', 'reinstatement')
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
  if current_reporter.access_sync_operation <> p_operation then
    raise exception using errcode = 'P0001', message = 'REPORTER_ACCESS_SYNC_OPERATION_MISMATCH';
  end if;
  if current_reporter.access_sync_status = 'succeeded' and p_succeeded then
    return true;
  end if;

  update public.reporter_profiles
  set access_sync_status = case when p_succeeded then 'succeeded' else 'failed' end,
      access_sync_failure_detail = p_failure_detail,
      access_sync_updated_at = completion_time,
      updated_at = completion_time
  where profile_id = p_profile_id;
  insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata)
  values (
    actor_id,
    case when p_succeeded
      then 'reporter.access_sync_succeeded'
      else 'reporter.access_sync_failed'
    end,
    'reporter_profile',
    p_profile_id,
    jsonb_build_object('operation', p_operation, 'failure_detail', p_failure_detail)
  );
  return true;
end;
$$;

drop policy "Applicants can create their own draft application"
on public.reporter_applications;
create policy "Applicants can create their own draft application"
on public.reporter_applications
for insert
to authenticated
with check (
  profile_id = (select auth.uid())
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'reader'
      and profiles.is_active
  )
  and status = 'draft'
  and kyc_status = 'not_started'
  and reviewed_by is null
  and reviewed_at is null
  and approved_at is null
  and rejected_at is null
  and refund_eligible_at is null
);

drop policy "Applicants can read their own applications"
on public.reporter_applications;
create policy "Applicants can read their own applications"
on public.reporter_applications
for select
to authenticated
using (
  profile_id = (select auth.uid())
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.is_active
      and (
        profiles.role = 'reader'
        or (
          profiles.role = 'reporter'
          and exists (
            select 1 from public.reporter_profiles
            where reporter_profiles.profile_id = profiles.id
              and reporter_profiles.access_sync_status = 'succeeded'
              and reporter_profiles.public_status <> 'suspended'
          )
        )
      )
  )
);

drop policy "Applicants can update only their own draft application"
on public.reporter_applications;
create policy "Applicants can update only their own draft application"
on public.reporter_applications
for update
to authenticated
using (
  profile_id = (select auth.uid())
  and status = 'draft'
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'reader'
      and profiles.is_active
  )
)
with check (
  profile_id = (select auth.uid())
  and status = 'draft'
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'reader'
      and profiles.is_active
  )
);

drop policy "Applicants can record consent on their own draft application"
on public.reporter_consents;
create policy "Applicants can record consent on their own draft application"
on public.reporter_consents
for insert
to authenticated
with check (
  profile_id = (select auth.uid())
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'reader'
      and profiles.is_active
  )
  and exists (
    select 1 from public.reporter_applications
    where reporter_applications.id = reporter_consents.application_id
      and reporter_applications.profile_id = (select auth.uid())
      and reporter_applications.status = 'draft'
  )
);

drop policy "Reporters can read their own reporter profile"
on public.reporter_profiles;
create policy "Reporters can read their own reporter profile"
on public.reporter_profiles
for select
to authenticated
using (
  reporter_profiles.profile_id = (select auth.uid())
  and reporter_profiles.access_sync_status = 'succeeded'
  and reporter_profiles.public_status <> 'suspended'
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'reporter'
      and profiles.is_active
  )
);

drop policy "Applicants can read their own payments"
on public.reporter_payments;
create policy "Applicants can read their own payments"
on public.reporter_payments
for select
to authenticated
using (
  profile_id = (select auth.uid())
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.is_active
      and (
        profiles.role = 'reader'
        or (
          profiles.role = 'reporter'
          and exists (
            select 1 from public.reporter_profiles
            where reporter_profiles.profile_id = profiles.id
              and reporter_profiles.access_sync_status = 'succeeded'
              and reporter_profiles.public_status <> 'suspended'
          )
        )
      )
  )
);

drop policy "Applicants can read their own consent receipts"
on public.reporter_consents;
create policy "Applicants can read their own consent receipts"
on public.reporter_consents
for select
to authenticated
using (
  profile_id = (select auth.uid())
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.is_active
      and (
        profiles.role = 'reader'
        or (
          profiles.role = 'reporter'
          and exists (
            select 1 from public.reporter_profiles
            where reporter_profiles.profile_id = profiles.id
              and reporter_profiles.access_sync_status = 'succeeded'
              and reporter_profiles.public_status <> 'suspended'
          )
        )
      )
  )
);

drop policy "Reporters can read their own notifications"
on public.reporter_notifications;
create policy "Reporters can read their own notifications"
on public.reporter_notifications
for select
to authenticated
using (
  profile_id = (select auth.uid())
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.is_active
      and (
        profiles.role <> 'reporter'
        or exists (
          select 1 from public.reporter_profiles
          where reporter_profiles.profile_id = profiles.id
            and reporter_profiles.access_sync_status = 'succeeded'
            and reporter_profiles.public_status <> 'suspended'
        )
      )
  )
);

drop policy "Reporters can mark their own notifications read"
on public.reporter_notifications;
create policy "Reporters can mark their own notifications read"
on public.reporter_notifications
for update
to authenticated
using (
  profile_id = (select auth.uid())
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.is_active
      and (
        profiles.role <> 'reporter'
        or exists (
          select 1 from public.reporter_profiles
          where reporter_profiles.profile_id = profiles.id
            and reporter_profiles.access_sync_status = 'succeeded'
            and reporter_profiles.public_status <> 'suspended'
        )
      )
  )
)
with check (
  profile_id = (select auth.uid())
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.is_active
      and (
        profiles.role <> 'reporter'
        or exists (
          select 1 from public.reporter_profiles
          where reporter_profiles.profile_id = profiles.id
            and reporter_profiles.access_sync_status = 'succeeded'
            and reporter_profiles.public_status <> 'suspended'
        )
      )
  )
);

drop policy "Admins can read reporter applications"
on public.reporter_applications;
create policy "Admins can read reporter applications"
on public.reporter_applications
for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
      and profiles.is_active
  )
);

drop policy "Admins can read reporter profiles"
on public.reporter_profiles;
create policy "Admins can read reporter profiles"
on public.reporter_profiles
for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
      and profiles.is_active
  )
);

drop policy "Admins can read reporter payments"
on public.reporter_payments;
create policy "Admins can read reporter payments"
on public.reporter_payments
for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
      and profiles.is_active
  )
);

drop policy "Admins can read reporter consent receipts"
on public.reporter_consents;
create policy "Admins can read reporter consent receipts"
on public.reporter_consents
for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
      and profiles.is_active
  )
);

drop policy "Admins can read reporter notifications"
on public.reporter_notifications;
create policy "Admins can read reporter notifications"
on public.reporter_notifications
for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
      and profiles.is_active
  )
);

drop policy "Admins can read audit events"
on public.audit_events;
create policy "Admins can read audit events"
on public.audit_events
for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
      and profiles.is_active
  )
);

revoke all on function public.approve_reporter_application(uuid, boolean)
from public, anon, authenticated, service_role;
revoke all on function public.reject_reporter_application(uuid, text)
from public, anon, authenticated, service_role;
revoke all on function public.suspend_reporter(uuid, text)
from public, anon, authenticated, service_role;
revoke all on function public.reinstate_reporter(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.complete_reporter_access_sync(uuid, text, boolean, text)
from public, anon, authenticated, service_role;

grant execute on function public.approve_reporter_application(uuid, boolean)
to authenticated;
grant execute on function public.reject_reporter_application(uuid, text)
to authenticated;
grant execute on function public.suspend_reporter(uuid, text)
to authenticated;
grant execute on function public.reinstate_reporter(uuid)
to authenticated;
grant execute on function public.complete_reporter_access_sync(uuid, text, boolean, text)
to authenticated;
