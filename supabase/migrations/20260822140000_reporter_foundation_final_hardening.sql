-- Final reporter-foundation security and money-owner hardening.
-- Applicant writes enter through authenticated server boundaries and service-role persistence only.

revoke insert, update on table public.reporter_applications from authenticated;
revoke insert on table public.reporter_consents from authenticated;
revoke insert (
  profile_id, legal_name, date_of_birth, age_18_declared, home_city,
  home_district, home_state, bio, beats, public_photo_url, public_photo_id
) on table public.reporter_applications from authenticated;
revoke update (
  legal_name, date_of_birth, age_18_declared, home_city, home_district,
  home_state, bio, beats, public_photo_url, public_photo_id
) on table public.reporter_applications from authenticated;
revoke insert (
  application_id, profile_id, notice_key, notice_version, locale
) on table public.reporter_consents from authenticated;

drop policy "Applicants can create their own draft application"
on public.reporter_applications;
drop policy "Applicants can update only their own draft application"
on public.reporter_applications;
drop policy "Applicants can record consent on their own draft application"
on public.reporter_consents;

alter table public.reporter_applications
  add constraint reporter_applications_legal_name_length_check
    check (length(btrim(legal_name)) between 2 and 120),
  add constraint reporter_applications_adult_date_check
    check (
      age_18_declared
      and date_of_birth <= (
        timezone('Asia/Kolkata', current_timestamp)::date - interval '18 years'
      )::date
    ),
  add constraint reporter_applications_home_city_length_check
    check (length(btrim(home_city)) between 2 and 100),
  add constraint reporter_applications_home_district_length_check
    check (length(btrim(home_district)) between 2 and 100),
  add constraint reporter_applications_home_state_length_check
    check (length(btrim(home_state)) between 2 and 100),
  add constraint reporter_applications_bio_length_check
    check (bio is null or length(btrim(bio)) <= 500),
  add constraint reporter_applications_beats_check
    check (
      cardinality(beats) between 1 and 8
      and beats <@ array['civic', 'crime', 'education', 'environment', 'health', 'business', 'culture', 'sports']::text[]
    ),
  add constraint reporter_applications_public_photo_id_provenance_check
    check (
      length(public_photo_id) <= 100
      and public_photo_id ~ '^inbcn/reporter/portrait/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ),
  add constraint reporter_applications_public_photo_url_provenance_check
    check (
      length(public_photo_url) <= 2048
      and public_photo_url ~ '^https://res[.]cloudinary[.]com/[A-Za-z0-9_-]+/image/upload/(.*[/])?inbcn/reporter/portrait/[0-9a-f-]+([.][A-Za-z0-9]+)?$'
      and public_photo_url ~ ('/' || public_photo_id || '[.][A-Za-z0-9]+$')
    ),
  add constraint reporter_applications_kyc_provider_length_check
    check (kyc_provider is null or length(btrim(kyc_provider)) between 1 and 64),
  add constraint reporter_applications_kyc_reference_length_check
    check (kyc_reference is null or length(btrim(kyc_reference)) between 1 and 512),
  add constraint reporter_applications_verified_name_length_check
    check (verified_legal_name is null or length(btrim(verified_legal_name)) between 1 and 120),
  add constraint reporter_applications_decision_reason_length_check
    check (decision_reason is null or length(btrim(decision_reason)) between 1 and 2000),
  add constraint reporter_applications_public_photo_id_key unique (public_photo_id);

alter table public.reporter_consents
  add constraint reporter_consents_notice_version_length_check
    check (length(btrim(notice_version)) between 1 and 32);

revoke all on function public.complete_razorpay_payment_webhook(text, uuid, text, text, integer, text)
from public, anon, authenticated, service_role;
drop function public.complete_razorpay_payment_webhook(text, uuid, text, text, integer, text);

-- The signed event timestamp is the capture time for webhook processing. API
-- reconciliation supplies the verified payment entity's created_at fallback.
create or replace function public.complete_razorpay_payment_webhook(
  p_event_id text,
  p_processing_token uuid,
  p_razorpay_order_id text,
  p_razorpay_payment_id text,
  p_amount_paise integer,
  p_currency text,
  p_captured_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_event public.webhook_events%rowtype;
  processing_time timestamptz := clock_timestamp();
  internal_payment_id uuid;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'RAZORPAY_WEBHOOK_FORBIDDEN';
  end if;
  select * into current_event
  from public.webhook_events
  where provider = 'razorpay' and provider_event_id = btrim(p_event_id)
  for update;
  if not found or current_event.processing_status <> 'pending'
    or current_event.processing_token <> p_processing_token
    or current_event.event_type not in ('payment.captured', 'order.paid') then
    return false;
  end if;

  internal_payment_id := public.apply_reporter_payment(
    p_razorpay_order_id,
    p_razorpay_payment_id,
    p_amount_paise,
    p_currency,
    p_captured_at
  );

  update public.webhook_events
  set processing_status = 'processed',
      processing_token = null,
      failure_detail = null,
      subject_type = 'reporter_payment',
      subject_id = internal_payment_id,
      processed_at = processing_time,
      updated_at = processing_time
  where id = current_event.id;
  return true;
end;
$$;

-- The first verified capture wins. Exact retries return before timestamp
-- reconciliation so a later webhook cannot move a legitimate recorded time.
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
  capture_recorded_at timestamptz := clock_timestamp();
  credited_start timestamptz;
  credited_expiry timestamptz;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'REPORTER_PAYMENT_FORBIDDEN';
  end if;
  if p_amount_paise <> 10000 or p_currency <> 'INR' then
    raise exception using errcode = '22023', message = 'REPORTER_PAYMENT_AMOUNT_MISMATCH';
  end if;
  if p_razorpay_order_id is null or length(btrim(p_razorpay_order_id)) not between 1 and 100
    or p_razorpay_payment_id is null or length(btrim(p_razorpay_payment_id)) not between 1 and 100
    or p_captured_at is null then
    raise exception using errcode = '22023', message = 'REPORTER_PAYMENT_RECEIPT_REQUIRED';
  end if;

  select * into current_payment
  from public.reporter_payments
  where razorpay_order_id = btrim(p_razorpay_order_id)
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'REPORTER_PAYMENT_NOT_FOUND';
  end if;
  if current_payment.amount_paise <> p_amount_paise
    or current_payment.currency <> p_currency then
    raise exception using errcode = '22023', message = 'REPORTER_PAYMENT_AMOUNT_MISMATCH';
  end if;
  if current_payment.payment_status = 'captured'
    and current_payment.razorpay_payment_id = btrim(p_razorpay_payment_id) then
    return current_payment.id;
  end if;
  if current_payment.payment_status <> 'order_created' then
    raise exception using errcode = 'P0001', message = 'REPORTER_PAYMENT_INVALID_STATE';
  end if;
  if p_captured_at < current_payment.created_at - interval '15 minutes'
    or p_captured_at < current_payment.updated_at - interval '15 minutes'
    or p_captured_at > capture_recorded_at + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'REPORTER_PAYMENT_TIMESTAMP_INVALID';
  end if;

  if current_payment.purpose = 'application' then
    select * into current_application
    from public.reporter_applications
    where id = current_payment.application_id
    for update;
    if not found or current_application.profile_id <> current_payment.profile_id
      or current_application.status <> 'payment_pending' then
      raise exception using errcode = 'P0001', message = 'REPORTER_APPLICATION_INVALID_STATE';
    end if;
    update public.reporter_payments
    set payment_status = 'captured',
        razorpay_payment_id = btrim(p_razorpay_payment_id),
        captured_at = p_captured_at,
        updated_at = capture_recorded_at
    where id = current_payment.id;
    update public.reporter_applications
    set status = 'kyc_pending',
        completion_deadline = p_captured_at + interval '30 days',
        updated_at = capture_recorded_at
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
        razorpay_payment_id = btrim(p_razorpay_payment_id),
        captured_at = p_captured_at,
        credited_membership_started_at = credited_start,
        credited_membership_expires_at = credited_expiry,
        updated_at = capture_recorded_at
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
        updated_at = capture_recorded_at
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

revoke all on function public.complete_razorpay_payment_webhook(text, uuid, text, text, integer, text, timestamptz)
from public, anon, authenticated, service_role;
revoke all on function public.apply_reporter_payment(text, text, integer, text, timestamptz)
from public, anon, authenticated, service_role;
grant execute on function public.complete_razorpay_payment_webhook(text, uuid, text, text, integer, text, timestamptz)
to service_role;
grant execute on function public.apply_reporter_payment(text, text, integer, text, timestamptz)
to service_role;
