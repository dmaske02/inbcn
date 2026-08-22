-- Atomic Razorpay order, webhook, and refund lifecycle.
-- Provider bodies and errors are never persisted; only opaque identifiers and safe status detail are retained.

alter table public.reporter_payments
  drop constraint reporter_payments_payment_status_check;
alter table public.reporter_payments
  add constraint reporter_payments_payment_status_check
  check (payment_status in ('order_creating', 'order_created', 'captured', 'failed'));

alter table public.reporter_payments
  alter column razorpay_order_id drop not null;
alter table public.reporter_payments
  add column order_creation_token uuid,
  add column order_creation_reserved_at timestamptz,
  add column refund_request_token uuid,
  add column refund_request_reserved_at timestamptz,
  add column refund_attempt_count integer not null default 0
    check (refund_attempt_count >= 0);

alter table public.reporter_payments
  add constraint reporter_payments_order_provider_state_check check (
    (payment_status = 'order_creating' and razorpay_order_id is null)
    or payment_status = 'failed'
    or (payment_status in ('order_created', 'captured') and razorpay_order_id is not null)
  ),
  add constraint reporter_payments_order_reservation_check check (
    (order_creation_token is null and order_creation_reserved_at is null)
    or (
      payment_status = 'order_creating'
      and order_creation_token is not null
      and order_creation_reserved_at is not null
    )
  ),
  add constraint reporter_payments_refund_reservation_check check (
    (refund_request_token is null and refund_request_reserved_at is null)
    or (
      refund_status = 'refund_pending'
      and refund_request_token is not null
      and refund_request_reserved_at is not null
    )
  );

create unique index reporter_payments_one_active_renewal_idx
  on public.reporter_payments (profile_id)
  where purpose = 'renewal' and payment_status in ('order_creating', 'order_created');

create or replace function public.reserve_reporter_order(
  p_profile_id uuid,
  p_application_id uuid,
  p_purpose text,
  p_required_consents jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_application public.reporter_applications%rowtype;
  current_payment public.reporter_payments%rowtype;
  current_reporter public.reporter_profiles%rowtype;
  reservation_time timestamptz := clock_timestamp();
  reservation_token uuid := gen_random_uuid();
  payment_id uuid;
  payment_found boolean := false;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'REPORTER_ORDER_FORBIDDEN';
  end if;
  if p_profile_id is null or p_purpose not in ('application', 'renewal')
    or (p_purpose = 'application' and p_application_id is null)
    or (p_purpose = 'renewal' and p_application_id is not null) then
    raise exception using errcode = '22023', message = 'REPORTER_ORDER_INVALID';
  end if;

  if p_purpose = 'application' then
    if jsonb_typeof(p_required_consents) <> 'array'
      or jsonb_array_length(p_required_consents) <> 6
      or (
        select count(distinct required ->> 'key')
        from jsonb_array_elements(p_required_consents) required
        where jsonb_typeof(required) = 'object'
          and required ->> 'key' in (
            'payment_refund', 'kyc', 'public_identity',
            'mandatory_location', 'recording', 'editorial_terms'
          )
          and length(btrim(coalesce(required ->> 'version', ''))) > 0
      ) <> 6 then
      raise exception using errcode = '22023', message = 'REPORTER_ORDER_CONSENTS_INVALID';
    end if;

    select * into current_application
    from public.reporter_applications
    where id = p_application_id and profile_id = p_profile_id
    for update;

    if not found then
      return jsonb_build_object('state', 'invalid');
    end if;

    select * into current_payment
    from public.reporter_payments
    where application_id = current_application.id
    for update;
    payment_found := found;

    if payment_found and current_payment.payment_status = 'captured' then
      return jsonb_build_object('state', 'paid');
    end if;
    if current_application.status not in ('draft', 'payment_pending') then
      return jsonb_build_object('state', 'invalid');
    end if;
    if exists (
      select 1
      from jsonb_array_elements(p_required_consents) required
      where not exists (
        select 1
        from public.reporter_consents
        where reporter_consents.application_id = current_application.id
          and reporter_consents.profile_id = p_profile_id
          and reporter_consents.notice_key = required ->> 'key'
          and reporter_consents.notice_version = required ->> 'version'
          and reporter_consents.withdrawn_at is null
      )
    ) then
      return jsonb_build_object('state', 'invalid');
    end if;

    if payment_found and current_payment.payment_status = 'order_created' then
      return jsonb_build_object(
        'state', 'existing', 'order_id', current_payment.razorpay_order_id
      );
    end if;
    if payment_found and current_payment.payment_status = 'order_creating'
      and current_payment.order_creation_token is not null
      and current_payment.order_creation_reserved_at > reservation_time - interval '5 minutes' then
      return jsonb_build_object('state', 'busy');
    end if;

    if payment_found then
      payment_id := current_payment.id;
      update public.reporter_payments
      set payment_status = 'order_creating',
          razorpay_order_id = null,
          razorpay_payment_id = null,
          captured_at = null,
          order_creation_token = reservation_token,
          order_creation_reserved_at = reservation_time,
          updated_at = reservation_time
      where id = payment_id;
    else
      insert into public.reporter_payments (
        profile_id,
        application_id,
        purpose,
        amount_paise,
        currency,
        payment_status,
        razorpay_order_id,
        order_creation_token,
        order_creation_reserved_at,
        created_at,
        updated_at
      ) values (
        p_profile_id,
        p_application_id,
        'application',
        10000,
        'INR',
        'order_creating',
        null,
        reservation_token,
        reservation_time,
        reservation_time,
        reservation_time
      ) returning id into payment_id;
    end if;

    update public.reporter_applications
    set status = 'payment_pending', updated_at = reservation_time
    where id = current_application.id;
  else
    select * into current_reporter
    from public.reporter_profiles
    where profile_id = p_profile_id
    for update;

    if not found or current_reporter.public_status = 'suspended' then
      return jsonb_build_object('state', 'invalid');
    end if;

    select * into current_payment
    from public.reporter_payments
    where profile_id = p_profile_id
      and purpose = 'renewal'
      and payment_status in ('order_creating', 'order_created')
    order by created_at desc, id desc
    limit 1
    for update;
    payment_found := found;

    if payment_found and current_payment.payment_status = 'order_created' then
      return jsonb_build_object(
        'state', 'existing', 'order_id', current_payment.razorpay_order_id
      );
    end if;
    if payment_found and current_payment.order_creation_token is not null
      and current_payment.order_creation_reserved_at > reservation_time - interval '5 minutes' then
      return jsonb_build_object('state', 'busy');
    end if;
    if payment_found then
      payment_id := current_payment.id;
      update public.reporter_payments
      set order_creation_token = reservation_token,
          order_creation_reserved_at = reservation_time,
          updated_at = reservation_time
      where id = payment_id;
    else
      insert into public.reporter_payments (
        profile_id,
        application_id,
        purpose,
        amount_paise,
        currency,
        payment_status,
        razorpay_order_id,
        order_creation_token,
        order_creation_reserved_at,
        created_at,
        updated_at
      ) values (
        p_profile_id,
        null,
        'renewal',
        10000,
        'INR',
        'order_creating',
        null,
        reservation_token,
        reservation_time,
        reservation_time,
        reservation_time
      ) returning id into payment_id;
    end if;
  end if;

  return jsonb_build_object(
    'state', 'claimed', 'payment_id', payment_id, 'token', reservation_token
  );
end;
$$;

create or replace function public.complete_reporter_order(
  p_payment_id uuid,
  p_order_creation_token uuid,
  p_razorpay_order_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  completed_at timestamptz := clock_timestamp();
  current_payment public.reporter_payments%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'REPORTER_ORDER_FORBIDDEN';
  end if;
  if p_payment_id is null or p_order_creation_token is null
    or p_razorpay_order_id is null or length(btrim(p_razorpay_order_id)) = 0
    or length(btrim(p_razorpay_order_id)) > 100 then
    raise exception using errcode = '22023', message = 'REPORTER_ORDER_INVALID';
  end if;

  select * into current_payment
  from public.reporter_payments
  where id = p_payment_id
  for update;
  if not found or current_payment.payment_status <> 'order_creating'
    or current_payment.order_creation_token <> p_order_creation_token then
    return false;
  end if;

  update public.reporter_payments
  set payment_status = 'order_created',
      razorpay_order_id = btrim(p_razorpay_order_id),
      order_creation_token = null,
      order_creation_reserved_at = null,
      updated_at = completed_at
  where id = current_payment.id;

  insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata)
  values (
    current_payment.profile_id,
    'reporter.payment_order_created',
    'reporter_payment',
    current_payment.id,
    jsonb_build_object('purpose', current_payment.purpose)
  );
  return true;
end;
$$;

create or replace function public.fail_reporter_order(
  p_payment_id uuid,
  p_order_creation_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  failed_at timestamptz := clock_timestamp();
  current_payment public.reporter_payments%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'REPORTER_ORDER_FORBIDDEN';
  end if;
  select * into current_payment
  from public.reporter_payments
  where id = p_payment_id
  for update;
  if not found or current_payment.payment_status <> 'order_creating'
    or current_payment.order_creation_token <> p_order_creation_token then
    return false;
  end if;

  update public.reporter_payments
  set payment_status = 'failed',
      order_creation_token = null,
      order_creation_reserved_at = null,
      updated_at = failed_at
  where id = current_payment.id;
  if current_payment.purpose = 'application' then
    update public.reporter_applications
    set status = 'draft', updated_at = failed_at
    where id = current_payment.application_id and status = 'payment_pending';
  end if;
  return true;
end;
$$;

create or replace function public.claim_razorpay_webhook_event(
  p_event_id text,
  p_event_type text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_event public.webhook_events%rowtype;
  claim_time timestamptz := clock_timestamp();
  claim_token uuid := gen_random_uuid();
  inserted_count integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'RAZORPAY_WEBHOOK_FORBIDDEN';
  end if;
  if p_event_id is null or length(btrim(p_event_id)) = 0 or length(btrim(p_event_id)) > 256
    or p_event_type not in (
      'payment.captured', 'order.paid', 'refund.processed', 'refund.failed'
    ) then
    raise exception using errcode = '22023', message = 'RAZORPAY_WEBHOOK_INVALID';
  end if;

  insert into public.webhook_events (
    provider,
    provider_event_id,
    event_type,
    signature_verified_at,
    processing_status,
    attempt_count,
    processing_token,
    created_at,
    updated_at
  ) values (
    'razorpay',
    btrim(p_event_id),
    p_event_type,
    claim_time,
    'pending',
    1,
    claim_token,
    claim_time,
    claim_time
  ) on conflict (provider, provider_event_id) do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 1 then
    return jsonb_build_object('state', 'claimed', 'token', claim_token);
  end if;

  select * into current_event
  from public.webhook_events
  where provider = 'razorpay' and provider_event_id = btrim(p_event_id)
  for update;
  if current_event.event_type <> p_event_type then
    raise exception using errcode = '22023', message = 'RAZORPAY_WEBHOOK_EVENT_MISMATCH';
  end if;
  if current_event.processing_status = 'processed' then
    return jsonb_build_object('state', 'processed');
  end if;
  if current_event.processing_status = 'pending'
    and current_event.processing_token is not null
    and current_event.updated_at > claim_time - interval '5 minutes' then
    return jsonb_build_object('state', 'busy');
  end if;

  update public.webhook_events
  set processing_status = 'pending',
      attempt_count = current_event.attempt_count + 1,
      processing_token = claim_token,
      signature_verified_at = claim_time,
      failure_detail = null,
      subject_type = null,
      subject_id = null,
      processed_at = null,
      updated_at = claim_time
  where id = current_event.id;
  return jsonb_build_object('state', 'claimed', 'token', claim_token);
end;
$$;

create or replace function public.complete_razorpay_payment_webhook(
  p_event_id text,
  p_processing_token uuid,
  p_razorpay_order_id text,
  p_razorpay_payment_id text,
  p_amount_paise integer,
  p_currency text
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
    processing_time
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

create or replace function public.complete_razorpay_refund_webhook(
  p_event_id text,
  p_processing_token uuid,
  p_razorpay_refund_id text,
  p_razorpay_payment_id text,
  p_amount_paise integer,
  p_currency text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_event public.webhook_events%rowtype;
  current_payment public.reporter_payments%rowtype;
  processing_time timestamptz := clock_timestamp();
  was_refunded boolean;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'RAZORPAY_WEBHOOK_FORBIDDEN';
  end if;
  if p_amount_paise <> 10000 or p_currency <> 'INR'
    or p_razorpay_refund_id is null or length(btrim(p_razorpay_refund_id)) = 0
    or length(btrim(p_razorpay_refund_id)) > 100
    or p_razorpay_payment_id is null or length(btrim(p_razorpay_payment_id)) = 0
    or length(btrim(p_razorpay_payment_id)) > 100 then
    raise exception using errcode = '22023', message = 'RAZORPAY_REFUND_MISMATCH';
  end if;

  select * into current_event
  from public.webhook_events
  where provider = 'razorpay' and provider_event_id = btrim(p_event_id)
  for update;
  if not found or current_event.processing_status <> 'pending'
    or current_event.processing_token <> p_processing_token
    or current_event.event_type <> 'refund.processed' then
    return false;
  end if;

  select * into current_payment
  from public.reporter_payments
  where razorpay_payment_id = btrim(p_razorpay_payment_id)
  for update;
  if not found or current_payment.payment_status <> 'captured'
    or current_payment.amount_paise <> p_amount_paise
    or current_payment.currency <> p_currency
    or current_payment.refund_status not in ('refund_pending', 'refund_failed', 'refunded')
    or (
      current_payment.razorpay_refund_id is not null
      and current_payment.razorpay_refund_id <> btrim(p_razorpay_refund_id)
    ) then
    raise exception using errcode = '22023', message = 'RAZORPAY_REFUND_MISMATCH';
  end if;
  was_refunded := current_payment.refund_status = 'refunded';

  update public.reporter_payments
  set refund_status = 'refunded',
      razorpay_refund_id = btrim(p_razorpay_refund_id),
      refund_requested_at = coalesce(refund_requested_at, processing_time),
      refunded_at = coalesce(refunded_at, processing_time),
      refund_request_token = null,
      refund_request_reserved_at = null,
      refund_failure_detail = null,
      updated_at = processing_time
  where id = current_payment.id;

  update public.webhook_events
  set processing_status = 'processed',
      processing_token = null,
      failure_detail = null,
      subject_type = 'reporter_payment',
      subject_id = current_payment.id,
      processed_at = processing_time,
      updated_at = processing_time
  where id = current_event.id;

  if not was_refunded then
    insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata)
    values (
      null,
      'reporter.refund_confirmed',
      'reporter_payment',
      current_payment.id,
      jsonb_build_object('purpose', current_payment.purpose)
    );
  end if;
  return true;
end;
$$;

create or replace function public.complete_razorpay_refund_failure_webhook(
  p_event_id text,
  p_processing_token uuid,
  p_razorpay_refund_id text,
  p_razorpay_payment_id text,
  p_amount_paise integer,
  p_currency text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_event public.webhook_events%rowtype;
  current_payment public.reporter_payments%rowtype;
  processing_time timestamptz := clock_timestamp();
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'RAZORPAY_WEBHOOK_FORBIDDEN';
  end if;
  if p_amount_paise <> 10000 or p_currency <> 'INR'
    or p_razorpay_refund_id is null or length(btrim(p_razorpay_refund_id)) = 0
    or length(btrim(p_razorpay_refund_id)) > 100
    or p_razorpay_payment_id is null or length(btrim(p_razorpay_payment_id)) = 0
    or length(btrim(p_razorpay_payment_id)) > 100 then
    raise exception using errcode = '22023', message = 'RAZORPAY_REFUND_MISMATCH';
  end if;
  select * into current_event
  from public.webhook_events
  where provider = 'razorpay' and provider_event_id = btrim(p_event_id)
  for update;
  if not found or current_event.processing_status <> 'pending'
    or current_event.processing_token <> p_processing_token
    or current_event.event_type <> 'refund.failed' then
    return false;
  end if;
  select * into current_payment
  from public.reporter_payments
  where razorpay_payment_id = btrim(p_razorpay_payment_id)
  for update;
  if not found or current_payment.payment_status <> 'captured'
    or current_payment.amount_paise <> p_amount_paise
    or current_payment.currency <> p_currency
    or current_payment.refund_status <> 'refund_pending'
    or (
      current_payment.razorpay_refund_id is not null
      and current_payment.razorpay_refund_id <> btrim(p_razorpay_refund_id)
    ) then
    raise exception using errcode = '22023', message = 'RAZORPAY_REFUND_MISMATCH';
  end if;

  update public.reporter_payments
  set refund_status = 'refund_failed',
      razorpay_refund_id = btrim(p_razorpay_refund_id),
      refund_request_token = null,
      refund_request_reserved_at = null,
      refund_failure_detail = 'provider-confirmed-failure',
      updated_at = processing_time
  where id = current_payment.id;
  update public.webhook_events
  set processing_status = 'processed',
      processing_token = null,
      failure_detail = null,
      subject_type = 'reporter_payment',
      subject_id = current_payment.id,
      processed_at = processing_time,
      updated_at = processing_time
  where id = current_event.id;
  return true;
end;
$$;

create or replace function public.fail_razorpay_webhook_event(
  p_event_id text,
  p_processing_token uuid,
  p_failure_detail text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'RAZORPAY_WEBHOOK_FORBIDDEN';
  end if;
  if p_processing_token is null or p_failure_detail not in (
    'payload-mismatch', 'processing-failed'
  ) then
    raise exception using errcode = '22023', message = 'RAZORPAY_WEBHOOK_FAILURE_INVALID';
  end if;
  update public.webhook_events
  set processing_status = 'failed',
      processing_token = null,
      failure_detail = p_failure_detail,
      updated_at = clock_timestamp()
  where provider = 'razorpay'
    and provider_event_id = btrim(p_event_id)
    and processing_token = p_processing_token
    and processing_status = 'pending';
  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

create or replace function public.reserve_reporter_refund(
  p_payment_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_payment public.reporter_payments%rowtype;
  reservation_time timestamptz := clock_timestamp();
  reservation_token uuid := gen_random_uuid();
  next_attempt integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
    or not exists (
      select 1 from public.profiles
      where id = p_actor_id and role = 'admin' and is_active
    ) then
    raise exception using errcode = '42501', message = 'REPORTER_REFUND_FORBIDDEN';
  end if;
  select * into current_payment
  from public.reporter_payments
  where id = p_payment_id
  for update;
  if not found then
    return jsonb_build_object('state', 'invalid');
  end if;
  if current_payment.refund_status = 'refunded' then
    return jsonb_build_object('state', 'processed');
  end if;
  if current_payment.payment_status <> 'captured'
    or current_payment.purpose <> 'application'
    or current_payment.refund_eligible_at is null
    or current_payment.refund_eligible_at > reservation_time
    or current_payment.razorpay_payment_id is null
    or current_payment.refund_status not in ('refund_pending', 'refund_failed') then
    return jsonb_build_object('state', 'invalid');
  end if;
  if current_payment.refund_status = 'refund_pending'
    and current_payment.razorpay_refund_id is not null then
    return jsonb_build_object('state', 'pending');
  end if;
  if current_payment.refund_request_token is not null
    and current_payment.refund_request_reserved_at > reservation_time - interval '5 minutes' then
    return jsonb_build_object('state', 'busy');
  end if;

  next_attempt := case
    when current_payment.refund_attempt_count = 0
      or current_payment.refund_status = 'refund_failed'
      then current_payment.refund_attempt_count + 1
    else current_payment.refund_attempt_count
  end;
  update public.reporter_payments
  set refund_status = 'refund_pending',
      razorpay_refund_id = null,
      refund_request_token = reservation_token,
      refund_request_reserved_at = reservation_time,
      refund_attempt_count = next_attempt,
      refund_failure_detail = null,
      updated_at = reservation_time
  where id = current_payment.id;

  return jsonb_build_object(
    'state', 'claimed',
    'token', reservation_token,
    'attempt', next_attempt,
    'provider_payment_id', current_payment.razorpay_payment_id,
    'amount_paise', current_payment.amount_paise,
    'currency', current_payment.currency
  );
end;
$$;

create or replace function public.record_reporter_refund_request(
  p_payment_id uuid,
  p_refund_request_token uuid,
  p_razorpay_refund_id text,
  p_razorpay_payment_id text,
  p_amount_paise integer,
  p_currency text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_payment public.reporter_payments%rowtype;
  requested_at timestamptz := clock_timestamp();
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'REPORTER_REFUND_FORBIDDEN';
  end if;
  if p_razorpay_refund_id is null or length(btrim(p_razorpay_refund_id)) = 0
    or length(btrim(p_razorpay_refund_id)) > 100
    or p_razorpay_payment_id is null or length(btrim(p_razorpay_payment_id)) = 0
    or length(btrim(p_razorpay_payment_id)) > 100
    or p_amount_paise <> 10000 or p_currency <> 'INR' then
    raise exception using errcode = '22023', message = 'REPORTER_REFUND_MISMATCH';
  end if;
  select * into current_payment
  from public.reporter_payments
  where id = p_payment_id
  for update;
  if not found
    or current_payment.payment_status <> 'captured'
    or current_payment.razorpay_payment_id <> btrim(p_razorpay_payment_id)
    or current_payment.amount_paise <> p_amount_paise
    or current_payment.currency <> p_currency then
    raise exception using errcode = '22023', message = 'REPORTER_REFUND_MISMATCH';
  end if;
  if current_payment.refund_status = 'refunded'
    and current_payment.razorpay_refund_id = btrim(p_razorpay_refund_id) then
    return true;
  end if;
  if current_payment.refund_status <> 'refund_pending'
    or current_payment.refund_request_token <> p_refund_request_token
    or current_payment.razorpay_refund_id is not null then
    return false;
  end if;

  update public.reporter_payments
  set razorpay_refund_id = btrim(p_razorpay_refund_id),
      refund_requested_at = requested_at,
      refund_request_token = null,
      refund_request_reserved_at = null,
      updated_at = requested_at
  where id = current_payment.id;
  insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata)
  values (
    null,
    'reporter.refund_requested',
    'reporter_payment',
    current_payment.id,
    jsonb_build_object('attempt', current_payment.refund_attempt_count)
  );
  return true;
end;
$$;

create or replace function public.fail_reporter_refund_request(
  p_payment_id uuid,
  p_refund_request_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'REPORTER_REFUND_FORBIDDEN';
  end if;
  update public.reporter_payments
  set refund_status = 'refund_failed',
      refund_request_token = null,
      refund_request_reserved_at = null,
      refund_failure_detail = 'provider-request-rejected',
      updated_at = clock_timestamp()
  where id = p_payment_id
    and refund_status = 'refund_pending'
    and razorpay_refund_id is null
    and refund_request_token = p_refund_request_token;
  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

-- Renewal credit is one calendar year from the later of current expiry and captured server time.
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
  if p_razorpay_order_id is null or length(btrim(p_razorpay_order_id)) = 0
    or p_razorpay_payment_id is null or length(btrim(p_razorpay_payment_id)) = 0
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
    if not found or current_application.profile_id <> current_payment.profile_id
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

    credited_start := greatest(current_reporter.membership_expires_at, p_captured_at);
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
          when p_captured_at > current_reporter.membership_expires_at
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

revoke all on function public.reserve_reporter_order(uuid, uuid, text, jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.complete_reporter_order(uuid, uuid, text)
from public, anon, authenticated, service_role;
revoke all on function public.fail_reporter_order(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.claim_razorpay_webhook_event(text, text)
from public, anon, authenticated, service_role;
revoke all on function public.complete_razorpay_payment_webhook(text, uuid, text, text, integer, text)
from public, anon, authenticated, service_role;
revoke all on function public.complete_razorpay_refund_webhook(text, uuid, text, text, integer, text)
from public, anon, authenticated, service_role;
revoke all on function public.complete_razorpay_refund_failure_webhook(text, uuid, text, text, integer, text)
from public, anon, authenticated, service_role;
revoke all on function public.fail_razorpay_webhook_event(text, uuid, text)
from public, anon, authenticated, service_role;
revoke all on function public.reserve_reporter_refund(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.record_reporter_refund_request(uuid, uuid, text, text, integer, text)
from public, anon, authenticated, service_role;
revoke all on function public.fail_reporter_refund_request(uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function public.reserve_reporter_order(uuid, uuid, text, jsonb)
to service_role;
grant execute on function public.complete_reporter_order(uuid, uuid, text)
to service_role;
grant execute on function public.fail_reporter_order(uuid, uuid)
to service_role;
grant execute on function public.claim_razorpay_webhook_event(text, text)
to service_role;
grant execute on function public.complete_razorpay_payment_webhook(text, uuid, text, text, integer, text)
to service_role;
grant execute on function public.complete_razorpay_refund_webhook(text, uuid, text, text, integer, text)
to service_role;
grant execute on function public.complete_razorpay_refund_failure_webhook(text, uuid, text, text, integer, text)
to service_role;
grant execute on function public.fail_razorpay_webhook_event(text, uuid, text)
to service_role;
grant execute on function public.reserve_reporter_refund(uuid, uuid)
to service_role;
grant execute on function public.record_reporter_refund_request(uuid, uuid, text, text, integer, text)
to service_role;
grant execute on function public.fail_reporter_refund_request(uuid, uuid)
to service_role;
