-- Reporter onboarding, payment, consent, notification, and audit foundation.
-- Provider callbacks retain identifiers and safe processing detail only.

alter type public.profile_role add value if not exists 'reporter';

create table public.reporter_applications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft', 'payment_pending', 'kyc_pending', 'under_review', 'approved', 'rejected', 'cancelled')),
  legal_name text not null check (length(btrim(legal_name)) > 0),
  date_of_birth date not null,
  age_18_declared boolean not null default false,
  home_city text not null check (length(btrim(home_city)) > 0),
  home_district text not null check (length(btrim(home_district)) > 0),
  home_state text not null check (length(btrim(home_state)) > 0),
  bio text,
  beats text[] not null default '{}',
  public_photo_url text not null check (public_photo_url ~ '^https://'),
  public_photo_id text not null check (length(btrim(public_photo_id)) > 0),
  public_photo_verified_by uuid references public.profiles (id) on delete set null,
  public_photo_verified_at timestamptz,
  kyc_provider text,
  kyc_reference text,
  kyc_status text not null default 'not_started'
    check (kyc_status in ('not_started', 'pending', 'verified', 'failed')),
  kyc_started_at timestamptz,
  kyc_completed_at timestamptz,
  verified_legal_name text,
  verified_adult boolean,
  submitted_at timestamptz,
  completion_deadline timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  decision_reason text,
  approved_at timestamptz,
  rejected_at timestamptz,
  refund_eligible_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reporter_applications_kyc_reference_check check (
    (kyc_provider is null and kyc_reference is null)
    or (
      kyc_provider is not null
      and length(btrim(kyc_provider)) > 0
      and kyc_reference is not null
      and length(btrim(kyc_reference)) > 0
    )
  ),
  constraint reporter_applications_kyc_result_check check (
    kyc_status <> 'verified'
    or (
      kyc_completed_at is not null
      and verified_legal_name is not null
      and length(btrim(verified_legal_name)) > 0
      and verified_adult is not null
    )
  ),
  constraint reporter_applications_photo_verification_check check (
    (public_photo_verified_by is null and public_photo_verified_at is null)
    or (public_photo_verified_by is not null and public_photo_verified_at is not null)
  ),
  constraint reporter_applications_review_check check (
    status <> 'under_review'
    or (submitted_at is not null and kyc_status = 'verified')
  ),
  constraint reporter_applications_approval_check check (
    status <> 'approved'
    or (
      approved_at is not null
      and reviewed_by is not null
      and reviewed_at is not null
      and rejected_at is null
      and verified_adult
    )
  ),
  constraint reporter_applications_rejection_check check (
    status <> 'rejected'
    or (
      rejected_at is not null
      and reviewed_by is not null
      and reviewed_at is not null
      and decision_reason is not null
      and length(btrim(decision_reason)) > 0
      and refund_eligible_at is not null
      and approved_at is null
    )
  ),
  constraint reporter_applications_id_profile_id_key unique (id, profile_id)
);

create unique index reporter_applications_one_active_per_profile_idx
  on public.reporter_applications (profile_id)
  where status in ('draft', 'payment_pending', 'kyc_pending', 'under_review');

create index reporter_applications_admin_queue_idx
  on public.reporter_applications (status, submitted_at, id)
  where status = 'under_review';

create index reporter_applications_completion_due_idx
  on public.reporter_applications (completion_deadline, id)
  where status = 'kyc_pending' and completion_deadline is not null;

create table public.reporter_profiles (
  profile_id uuid primary key references public.profiles (id) on delete restrict,
  public_slug text not null unique
    check (public_slug ~ '^[a-z0-9_]{3,32}$'),
  legal_display_name text not null check (length(btrim(legal_display_name)) > 0),
  avatar_url text not null check (avatar_url ~ '^https://'),
  home_city text not null check (length(btrim(home_city)) > 0),
  home_district text not null check (length(btrim(home_district)) > 0),
  home_state text not null check (length(btrim(home_state)) > 0),
  bio text,
  beats text[] not null default '{}',
  public_status text not null default 'active'
    check (public_status in ('active', 'grace', 'expired', 'suspended')),
  membership_started_at timestamptz not null,
  membership_expires_at timestamptz not null,
  membership_grace_ends_at timestamptz not null,
  can_publish_directly boolean not null default false,
  direct_publish_granted_by uuid references public.profiles (id) on delete set null,
  direct_publish_granted_at timestamptz,
  direct_publish_revoked_by uuid references public.profiles (id) on delete set null,
  direct_publish_revoked_at timestamptz,
  can_broadcast_live boolean not null default false,
  live_broadcast_granted_by uuid references public.profiles (id) on delete set null,
  live_broadcast_granted_at timestamptz,
  live_broadcast_revoked_by uuid references public.profiles (id) on delete set null,
  live_broadcast_revoked_at timestamptz,
  public_photo_verified_by uuid not null references public.profiles (id) on delete restrict,
  public_photo_verified_at timestamptz not null,
  suspended_by uuid references public.profiles (id) on delete set null,
  suspended_at timestamptz,
  suspension_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reporter_profiles_membership_dates_check check (
    membership_started_at < membership_expires_at
    and membership_grace_ends_at = membership_expires_at + interval '7 days'
  ),
  constraint reporter_profiles_direct_grant_check check (
    (direct_publish_granted_by is null and direct_publish_granted_at is null)
    or (direct_publish_granted_by is not null and direct_publish_granted_at is not null)
  ),
  constraint reporter_profiles_direct_revoke_check check (
    (direct_publish_revoked_by is null and direct_publish_revoked_at is null)
    or (direct_publish_revoked_by is not null and direct_publish_revoked_at is not null)
  ),
  constraint reporter_profiles_live_grant_check check (
    (live_broadcast_granted_by is null and live_broadcast_granted_at is null)
    or (live_broadcast_granted_by is not null and live_broadcast_granted_at is not null)
  ),
  constraint reporter_profiles_live_revoke_check check (
    (live_broadcast_revoked_by is null and live_broadcast_revoked_at is null)
    or (live_broadcast_revoked_by is not null and live_broadcast_revoked_at is not null)
  ),
  constraint reporter_profiles_suspension_check check (
    public_status <> 'suspended'
    or (
      suspended_by is not null
      and suspended_at is not null
      and suspension_reason is not null
      and length(btrim(suspension_reason)) > 0
    )
  )
);

create index reporter_profiles_membership_due_idx
  on public.reporter_profiles (membership_expires_at, membership_grace_ends_at, profile_id)
  where public_status in ('active', 'grace');

create table public.reporter_payments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete restrict,
  application_id uuid,
  purpose text not null check (purpose in ('application', 'renewal')),
  amount_paise integer not null default 10000 check (amount_paise = 10000),
  currency text not null default 'INR' check (currency = 'INR'),
  payment_status text not null default 'order_created'
    check (payment_status in ('order_created', 'captured', 'failed')),
  refund_status text not null default 'not_eligible'
    check (refund_status in ('not_eligible', 'refund_pending', 'refunded', 'refund_failed')),
  razorpay_order_id text not null,
  razorpay_payment_id text unique,
  razorpay_refund_id text unique,
  captured_at timestamptz,
  refund_eligible_at timestamptz,
  refund_requested_at timestamptz,
  refunded_at timestamptz,
  refund_failure_detail text,
  credited_membership_started_at timestamptz,
  credited_membership_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reporter_payments_razorpay_order_id_key unique (razorpay_order_id),
  constraint reporter_payments_application_key unique (application_id),
  constraint reporter_payments_application_profile_fkey
    foreign key (application_id, profile_id)
    references public.reporter_applications (id, profile_id)
    on delete restrict,
  constraint reporter_payments_relationship_check check (
    (purpose = 'application' and application_id is not null)
    or (purpose = 'renewal' and application_id is null)
  ),
  constraint reporter_payments_capture_check check (
    payment_status <> 'captured'
    or (razorpay_payment_id is not null and captured_at is not null)
  ),
  constraint reporter_payments_refund_check check (
    refund_status = 'not_eligible'
    or (payment_status = 'captured' and refund_eligible_at is not null)
  ),
  constraint reporter_payments_refunded_check check (
    refund_status <> 'refunded'
    or (razorpay_refund_id is not null and refunded_at is not null)
  ),
  constraint reporter_payments_credit_dates_check check (
    (credited_membership_started_at is null and credited_membership_expires_at is null)
    or (
      credited_membership_started_at is not null
      and credited_membership_expires_at is not null
      and credited_membership_started_at < credited_membership_expires_at
    )
  )
);

create index reporter_payments_profile_created_idx
  on public.reporter_payments (profile_id, created_at desc, id desc);

create index reporter_payments_refund_due_idx
  on public.reporter_payments (refund_eligible_at, id)
  where refund_status in ('refund_pending', 'refund_failed');

create table public.reporter_consents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  profile_id uuid not null references public.profiles (id) on delete restrict,
  notice_key text not null check (
    notice_key in ('payment_refund', 'kyc', 'public_identity', 'mandatory_location', 'recording', 'editorial_terms')
  ),
  notice_version text not null check (length(btrim(notice_version)) > 0),
  locale text not null check (locale in ('en', 'hi', 'mr')),
  consented_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),

  constraint reporter_consents_receipt_key
    unique (application_id, notice_key, notice_version),
  constraint reporter_consents_application_profile_fkey
    foreign key (application_id, profile_id)
    references public.reporter_applications (id, profile_id)
    on delete restrict,
  constraint reporter_consents_withdrawal_check
    check (withdrawn_at is null or withdrawn_at >= consented_at)
);

create index reporter_consents_profile_created_idx
  on public.reporter_consents (profile_id, created_at desc, id desc);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('razorpay', 'kyc', 'livekit')),
  provider_event_id text not null check (length(btrim(provider_event_id)) > 0),
  event_type text not null check (length(btrim(event_type)) > 0),
  signature_verified_at timestamptz not null,
  processing_status text not null default 'pending'
    check (processing_status in ('pending', 'processed', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  failure_detail text,
  subject_type text,
  subject_id uuid,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (provider, provider_event_id),
  constraint webhook_events_processed_check check (
    processing_status <> 'processed' or processed_at is not null
  )
);

create index webhook_events_processing_queue_idx
  on public.webhook_events (processing_status, created_at, id)
  where processing_status in ('pending', 'failed');

create table public.reporter_notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete restrict,
  notification_type text not null check (length(btrim(notification_type)) > 0),
  message text not null check (length(btrim(message)) > 0),
  destination text,
  delivery_channel text not null default 'in_app'
    check (delivery_channel in ('in_app', 'sms', 'push')),
  delivery_status text not null default 'not_applicable'
    check (delivery_status in ('not_applicable', 'not_configured', 'pending', 'sent', 'failed')),
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),

  constraint reporter_notifications_delivery_check check (
    delivery_status <> 'sent' or delivered_at is not null
  )
);

create index reporter_notifications_profile_created_idx
  on public.reporter_notifications (profile_id, created_at desc, id desc);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (length(btrim(action)) > 0),
  subject_type text not null check (length(btrim(subject_type)) > 0),
  subject_id uuid not null,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  request_correlation_id uuid,
  created_at timestamptz not null default now()
);

create index audit_events_subject_created_idx
  on public.audit_events (subject_type, subject_id, created_at desc, id desc);

create index audit_events_actor_created_idx
  on public.audit_events (actor_id, created_at desc, id desc)
  where actor_id is not null;

create view public.public_reporter_profiles
with (security_barrier = true)
as
select
  reporter_profiles.public_slug,
  reporter_profiles.legal_display_name,
  reporter_profiles.avatar_url,
  reporter_profiles.public_status,
  reporter_profiles.home_district,
  reporter_profiles.bio,
  reporter_profiles.beats,
  (
    select count(*)::integer
    from public.stories
    where stories.created_by = reporter_profiles.profile_id
      and stories.status = 'published'
  ) as published_story_count
from public.reporter_profiles;

alter table public.reporter_applications enable row level security;
alter table public.reporter_profiles enable row level security;
alter table public.reporter_payments enable row level security;
alter table public.reporter_consents enable row level security;
alter table public.webhook_events enable row level security;
alter table public.reporter_notifications enable row level security;
alter table public.audit_events enable row level security;

revoke all on table
  public.reporter_applications,
  public.reporter_profiles,
  public.reporter_payments,
  public.reporter_consents,
  public.webhook_events,
  public.reporter_notifications,
  public.audit_events,
  public.public_reporter_profiles
from public, anon, authenticated;

grant select on table public.public_reporter_profiles to anon, authenticated;

grant select on table
  public.reporter_applications,
  public.reporter_profiles,
  public.reporter_payments,
  public.reporter_consents,
  public.reporter_notifications
to authenticated;

grant insert (
  profile_id, legal_name, date_of_birth, age_18_declared, home_city,
  home_district, home_state, bio, beats, public_photo_url, public_photo_id
) on table public.reporter_applications to authenticated;

grant update (
  legal_name, date_of_birth, age_18_declared, home_city, home_district,
  home_state, bio, beats, public_photo_url, public_photo_id
) on table public.reporter_applications to authenticated;

grant insert (
  application_id, profile_id, notice_key, notice_version, locale
) on table public.reporter_consents to authenticated;

grant update (read_at) on table public.reporter_notifications to authenticated;

grant select on table public.webhook_events, public.audit_events to authenticated;

grant select, insert, update, delete on table
  public.reporter_applications,
  public.reporter_profiles,
  public.reporter_payments,
  public.reporter_consents,
  public.webhook_events,
  public.reporter_notifications
to service_role;

grant select, insert on table public.audit_events to service_role;

create policy "Applicants can create their own draft application"
on public.reporter_applications
for insert
to authenticated
with check (
  profile_id = (select auth.uid())
  and status = 'draft'
  and kyc_status = 'not_started'
  and reviewed_by is null
  and reviewed_at is null
  and approved_at is null
  and rejected_at is null
  and refund_eligible_at is null
);

create policy "Applicants can read their own applications"
on public.reporter_applications
for select
to authenticated
using (profile_id = (select auth.uid()));

create policy "Applicants can update only their own draft application"
on public.reporter_applications
for update
to authenticated
using (profile_id = (select auth.uid()) and status = 'draft')
with check (profile_id = (select auth.uid()) and status = 'draft');

create policy "Admins can read reporter applications"
on public.reporter_applications
for select
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Reporters can read their own reporter profile"
on public.reporter_profiles
for select
to authenticated
using (profile_id = (select auth.uid()));

create policy "Admins can read reporter profiles"
on public.reporter_profiles
for select
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Applicants can read their own payments"
on public.reporter_payments
for select
to authenticated
using (profile_id = (select auth.uid()));

create policy "Admins can read reporter payments"
on public.reporter_payments
for select
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Applicants can read their own consent receipts"
on public.reporter_consents
for select
to authenticated
using (profile_id = (select auth.uid()));

create policy "Applicants can record consent on their own draft application"
on public.reporter_consents
for insert
to authenticated
with check (
  profile_id = (select auth.uid())
  and exists (
    select 1
    from public.reporter_applications
    where reporter_applications.id = reporter_consents.application_id
      and reporter_applications.profile_id = (select auth.uid())
      and reporter_applications.status = 'draft'
  )
);

create policy "Admins can read reporter consent receipts"
on public.reporter_consents
for select
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Admins can read webhook receipts"
on public.webhook_events
for select
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Reporters can read their own notifications"
on public.reporter_notifications
for select
to authenticated
using (profile_id = (select auth.uid()));

create policy "Reporters can mark their own notifications read"
on public.reporter_notifications
for update
to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

create policy "Admins can read reporter notifications"
on public.reporter_notifications
for select
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Admins can read audit events"
on public.audit_events
for select
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create or replace function public.apply_reporter_payment(
  p_razorpay_order_id text,
  p_razorpay_payment_id text,
  p_amount_paise integer,
  p_currency text,
  p_captured_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_payment public.reporter_payments%rowtype;
  current_application public.reporter_applications%rowtype;
  current_reporter public.reporter_profiles%rowtype;
  credited_start timestamptz;
  credited_expiry timestamptz;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'REPORTER_PAYMENT_FORBIDDEN';
  end if;
  if p_amount_paise <> 10000 or p_currency <> 'INR' then
    raise exception using errcode = '22023', message = 'REPORTER_PAYMENT_AMOUNT_MISMATCH';
  end if;
  if p_razorpay_payment_id is null or length(btrim(p_razorpay_payment_id)) = 0 then
    raise exception using errcode = '22023', message = 'REPORTER_PAYMENT_ID_REQUIRED';
  end if;
  if p_razorpay_order_id is null or length(btrim(p_razorpay_order_id)) = 0
    or p_captured_at is null then
    raise exception using errcode = '22023', message = 'REPORTER_PAYMENT_RECEIPT_REQUIRED';
  end if;

  select * into current_payment
  from public.reporter_payments
  where razorpay_order_id = p_razorpay_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'REPORTER_PAYMENT_NOT_FOUND';
  end if;
  if current_payment.amount_paise <> p_amount_paise
    or current_payment.currency <> p_currency then
    raise exception using errcode = '22023', message = 'REPORTER_PAYMENT_AMOUNT_MISMATCH';
  end if;
  if current_payment.payment_status = 'captured'
    and current_payment.razorpay_payment_id = p_razorpay_payment_id then
    return current_payment.id;
  end if;
  if current_payment.payment_status <> 'order_created' then
    raise exception using errcode = 'P0001', message = 'REPORTER_PAYMENT_INVALID_STATE';
  end if;

  if current_payment.purpose = 'application' then
    select * into current_application
    from public.reporter_applications
    where id = current_payment.application_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'REPORTER_APPLICATION_NOT_FOUND';
    end if;
    if current_application.profile_id <> current_payment.profile_id
      or current_application.status <> 'payment_pending' then
      raise exception using errcode = 'P0001', message = 'REPORTER_APPLICATION_INVALID_STATE';
    end if;

    update public.reporter_payments
    set payment_status = 'captured',
        razorpay_payment_id = p_razorpay_payment_id,
        captured_at = p_captured_at,
        updated_at = p_captured_at
    where id = current_payment.id;

    update public.reporter_applications
    set status = 'kyc_pending',
        completion_deadline = p_captured_at + interval '30 days',
        updated_at = p_captured_at
    where id = current_application.id;
  else
    select * into current_reporter
    from public.reporter_profiles
    where profile_id = current_payment.profile_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'REPORTER_PROFILE_NOT_FOUND';
    end if;
    if current_reporter.public_status = 'suspended' then
      raise exception using errcode = 'P0001', message = 'REPORTER_RENEWAL_SUSPENDED';
    end if;

    credited_start := case
      when p_captured_at <= current_reporter.membership_grace_ends_at
        then current_reporter.membership_expires_at
      else p_captured_at
    end;
    credited_expiry := credited_start + interval '1 year';

    update public.reporter_payments
    set payment_status = 'captured',
        razorpay_payment_id = p_razorpay_payment_id,
        captured_at = p_captured_at,
        credited_membership_started_at = credited_start,
        credited_membership_expires_at = credited_expiry,
        updated_at = p_captured_at
    where id = current_payment.id;

    update public.reporter_profiles
    set public_status = 'active',
        membership_started_at = case
          when p_captured_at > current_reporter.membership_grace_ends_at
            then p_captured_at
          else current_reporter.membership_started_at
        end,
        membership_expires_at = credited_expiry,
        membership_grace_ends_at = credited_expiry + interval '7 days',
        updated_at = p_captured_at
    where profile_id = current_reporter.profile_id;
  end if;

  insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata)
  values (
    null,
    'reporter.payment_captured',
    'reporter_payment',
    current_payment.id,
    jsonb_build_object('purpose', current_payment.purpose)
  );

  return current_payment.id;
end;
$$;

create or replace function public.approve_reporter_application(p_application_id uuid)
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
  if actor_id is null or actor_role <> 'admin' then
    raise exception using errcode = '42501', message = 'REPORTER_APPROVAL_FORBIDDEN';
  end if;

  select * into current_application
  from public.reporter_applications
  where id = p_application_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'REPORTER_APPLICATION_NOT_FOUND';
  end if;
  if current_application.status <> 'under_review' then
    raise exception using errcode = 'P0001', message = 'REPORTER_APPLICATION_INVALID_STATE';
  end if;
  if current_application.kyc_status <> 'verified'
    or current_application.verified_legal_name is null
    or current_application.verified_adult is distinct from true
    or current_application.public_photo_verified_by is null
    or current_application.public_photo_verified_at is null then
    raise exception using errcode = '23514', message = 'REPORTER_APPLICATION_NOT_VERIFIED';
  end if;

  select * into current_payment
  from public.reporter_payments
  where application_id = current_application.id
  for update;

  if not found or current_payment.payment_status <> 'captured'
    or current_payment.refund_status <> 'not_eligible' then
    raise exception using errcode = 'P0001', message = 'REPORTER_APPLICATION_PAYMENT_INVALID';
  end if;

  select * into current_profile
  from public.profiles
  where id = current_application.profile_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'REPORTER_PROFILE_NOT_FOUND';
  end if;

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
    public_photo_verified_at
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
    current_application.public_photo_verified_by,
    current_application.public_photo_verified_at
  );

  update public.reporter_applications
  set status = 'approved',
      reviewed_by = actor_id,
      reviewed_at = approval_time,
      decision_reason = null,
      approved_at = approval_time,
      updated_at = approval_time
  where id = current_application.id;

  update public.reporter_payments
  set credited_membership_started_at = approval_time,
      credited_membership_expires_at = expiry_time,
      updated_at = approval_time
  where id = current_payment.id;

  update public.profiles
  set role = 'reporter', updated_at = approval_time
  where id = current_application.profile_id;

  insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata)
  values (
    actor_id,
    'reporter.application_approved',
    'reporter_application',
    current_application.id,
    jsonb_build_object('reporter_profile_id', current_application.profile_id)
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
  if actor_id is null or actor_role <> 'admin' then
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
  if current_application.status <> 'under_review' then
    raise exception using errcode = 'P0001', message = 'REPORTER_APPLICATION_INVALID_STATE';
  end if;

  select * into current_payment
  from public.reporter_payments
  where application_id = current_application.id
  for update;

  if not found or current_payment.payment_status <> 'captured'
    or current_payment.refund_status <> 'not_eligible' then
    raise exception using errcode = 'P0001', message = 'REPORTER_APPLICATION_PAYMENT_INVALID';
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

  return current_application.profile_id;
end;
$$;

revoke all on function public.apply_reporter_payment(text, text, integer, text, timestamptz)
from public, anon, authenticated;
revoke all on function public.approve_reporter_application(uuid)
from public, anon, authenticated;
revoke all on function public.reject_reporter_application(uuid, text)
from public, anon, authenticated;

grant execute on function public.apply_reporter_payment(text, text, integer, text, timestamptz)
to service_role;
grant execute on function public.approve_reporter_application(uuid)
to authenticated;
grant execute on function public.reject_reporter_application(uuid, text)
to authenticated;

comment on view public.public_reporter_profiles is
  'Public reporter projection: no date of birth, KYC, payment, consent, or review data.';
comment on table public.webhook_events is
  'Idempotency receipts only; full provider callback payloads are not retained.';
comment on table public.audit_events is
  'Append-only safe audit metadata; secrets and identity/payment artifacts are prohibited.';
