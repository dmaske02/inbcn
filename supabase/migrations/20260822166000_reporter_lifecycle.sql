-- Daily reporter lifecycle transitions and provider-work leases.
-- Provider calls remain outside PostgreSQL; all money and deletion state is
-- claimed/completed here with exact tokens and database-owned time.

alter table public.reporter_applications
  add column completion_reminded_at timestamptz;

alter table public.reporter_profiles
  add column renewal_reminded_for timestamptz;

alter table public.story_locations
  alter column latitude drop not null,
  alter column longitude drop not null,
  alter column accuracy_meters drop not null,
  alter column captured_at drop not null,
  add column exact_coordinates_deleted_at timestamptz,
  add constraint story_locations_exact_coordinates_state_check check (
    (
      latitude is not null
      and longitude is not null
      and accuracy_meters is not null
      and captured_at is not null
      and exact_coordinates_deleted_at is null
    )
    or (
      latitude is null
      and longitude is null
      and accuracy_meters is null
      and captured_at is null
      and exact_coordinates_deleted_at is not null
    )
  );

alter table public.live_recordings
  add column storage_deleted_at timestamptz,
  add column deletion_lease_token uuid,
  add column deletion_lease_claimed_at timestamptz,
  add column deletion_attempt_count integer not null default 0,
  add column deletion_failure_detail text;

alter table public.live_recordings
  drop constraint live_recordings_output_check,
  add constraint live_recordings_output_check check (
    (recording_status = 'pending'
      and recording_started_at is null and recording_completed_at is null
      and storage_key is null and storage_deleted_at is null
      and duration_seconds is null and bytes is null)
    or (recording_status = 'recording'
      and recording_started_at is not null and recording_completed_at is null
      and storage_key is null and storage_deleted_at is null
      and duration_seconds is null and bytes is null)
    or (recording_status = 'completed'
      and recording_started_at is not null and recording_completed_at is not null
      and (
        (storage_key is not null and storage_deleted_at is null)
        or (storage_key is null and storage_deleted_at is not null)
      )
      and duration_seconds is not null and duration_seconds > 0
      and bytes is not null and bytes > 0)
    or (recording_status = 'failed'
      and recording_started_at is not null and recording_completed_at is not null
      and storage_deleted_at is null
      and provider_error is not null and length(btrim(provider_error)) between 1 and 4000)
  ),
  add constraint live_recordings_deletion_state_check check (
    deletion_attempt_count >= 0
    and (
      (deletion_lease_token is null and deletion_lease_claimed_at is null)
      or (
        deletion_lease_token is not null
        and deletion_lease_claimed_at is not null
        and storage_key is not null
        and storage_deleted_at is null
      )
    )
    and (deletion_failure_detail is null or deletion_lease_token is not null)
    and (
      storage_deleted_at is null
      or (
        recording_status = 'completed'
        and storage_key is null
        and deletion_lease_token is null
        and deletion_lease_claimed_at is null
        and deletion_failure_detail is null
      )
    )
  );

create index live_recordings_deletion_due_idx
  on public.live_recordings (retention_delete_at, id)
  where recording_status = 'completed'
    and replay_status in ('private', 'rejected')
    and retention_delete_at is not null
    and storage_deleted_at is null
    and not legal_hold;

create index story_locations_exact_retention_due_idx
  on public.story_locations (retention_due_at, id)
  where retention_due_at is not null
    and exact_coordinates_deleted_at is null
    and not legal_hold;

comment on column public.reporter_applications.completion_reminded_at is
  'Database-owned marker for the one incomplete-application reminder.';
comment on column public.reporter_profiles.renewal_reminded_for is
  'The exact membership expiry for which the 30-day reminder was committed.';
comment on column public.story_locations.exact_coordinates_deleted_at is
  'When exact coordinate evidence was removed; locality and receipt time remain.';
comment on column public.live_recordings.storage_deleted_at is
  'Provider-confirmed object deletion or not-found time; the canonical key is then cleared.';

create function public.prevent_live_recording_deletion_race()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (
    new.replay_status is distinct from old.replay_status
    or new.legal_hold is distinct from old.legal_hold
  ) then
    return new;
  end if;

  if old.storage_deleted_at is not null then
    raise exception using
      errcode = '55000',
      message = 'LIVE_RECORDING_DELETION_IN_PROGRESS';
  end if;

  if old.deletion_lease_token is not null then
    if old.deletion_failure_detail = 'provider-not-configured' then
      new.deletion_lease_token := null;
      new.deletion_lease_claimed_at := null;
      new.deletion_failure_detail := null;
    else
      raise exception using
        errcode = '55000',
        message = 'LIVE_RECORDING_DELETION_IN_PROGRESS';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_live_recording_deletion_race()
from public, anon, authenticated, service_role;

create trigger prevent_live_recording_deletion_race
before update of replay_status, legal_hold on public.live_recordings
for each row execute function public.prevent_live_recording_deletion_race();

create function public.notify_reporter_refund_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.refund_status is distinct from 'refunded'
    and new.refund_status = 'refunded' then
    insert into public.reporter_notifications (
      profile_id,
      notification_type,
      message
    ) values (
      new.profile_id,
      'refund_confirmed',
      'Your reporter fee refund has been confirmed.'
    );
  end if;
  return new;
end;
$$;

revoke all on function public.notify_reporter_refund_confirmation()
from public, anon, authenticated, service_role;

create trigger notify_reporter_refund_confirmation
after update of refund_status on public.reporter_payments
for each row execute function public.notify_reporter_refund_confirmation();

-- Keep the foundation transition authoritative while removing the internal
-- payment identifier from its generic audit metadata.
create or replace function public.mark_overdue_reporter_application(
  p_application_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_application public.reporter_applications%rowtype;
  current_payment public.reporter_payments%rowtype;
  transition_time timestamptz := clock_timestamp();
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'REPORTER_OVERDUE_FORBIDDEN';
  end if;
  select * into current_application
  from public.reporter_applications
  where id = p_application_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'REPORTER_APPLICATION_NOT_FOUND';
  end if;
  if current_application.status <> 'kyc_pending'
    or current_application.completion_deadline is null
    or current_application.completion_deadline > transition_time then
    raise exception using errcode = 'P0001', message = 'REPORTER_APPLICATION_NOT_OVERDUE';
  end if;
  select * into current_payment
  from public.reporter_payments
  where application_id = current_application.id
  for update;
  if not found
    or current_payment.purpose <> 'application'
    or current_payment.payment_status <> 'captured'
    or current_payment.refund_status <> 'not_eligible' then
    raise exception using errcode = 'P0001', message = 'REPORTER_APPLICATION_PAYMENT_INVALID';
  end if;

  update public.reporter_applications
  set status = 'cancelled',
      refund_eligible_at = transition_time,
      updated_at = transition_time
  where id = current_application.id;
  update public.reporter_payments
  set refund_status = 'refund_pending',
      refund_eligible_at = transition_time,
      updated_at = transition_time
  where id = current_payment.id;
  insert into public.audit_events (
    actor_id, action, subject_type, subject_id, metadata, created_at
  ) values (
    null,
    'reporter.application_overdue_refund_queued',
    'reporter_application',
    current_application.id,
    '{}'::jsonb,
    transition_time
  );
  return current_payment.id;
end;
$$;

-- Make the existing refund-request completion return true after a committed
-- exact retry (for example when the Data API response was lost).
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
  if p_refund_request_token is null
    or p_razorpay_refund_id is null or length(btrim(p_razorpay_refund_id)) = 0
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
  if current_payment.refund_status in (
      'refund_pending', 'refund_failed', 'refunded'
    )
    and current_payment.razorpay_refund_id = btrim(p_razorpay_refund_id)
    and current_payment.refund_request_token is null then
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
  insert into public.audit_events (
    actor_id, action, subject_type, subject_id, metadata, created_at
  ) values (
    null,
    'reporter.refund_requested',
    'reporter_payment',
    current_payment.id,
    jsonb_build_object('attempt', current_payment.refund_attempt_count),
    requested_at
  );
  return true;
end;
$$;

create function public.claim_reporter_lifecycle(p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  lifecycle_time timestamptz := clock_timestamp();
  work record;
  current_application public.reporter_applications%rowtype;
  current_payment public.reporter_payments%rowtype;
  current_reporter public.reporter_profiles%rowtype;
  current_recording public.live_recordings%rowtype;
  current_request public.reporter_live_requests%rowtype;
  current_location public.story_locations%rowtype;
  current_story public.stories%rowtype;
  target_request_id uuid;
  target_story_id uuid;
  lease_token uuid;
  next_attempt integer;
  work_items jsonb := '[]'::jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'REPORTER_LIFECYCLE_FORBIDDEN';
  end if;
  if p_limit is null or p_limit not between 1 and 25 then
    raise exception using errcode = '22023', message = 'REPORTER_LIFECYCLE_LIMIT_INVALID';
  end if;

  for work in
    with due_work as (
      select
        reporter_applications.completion_deadline - interval '7 days' as due_at,
        reporter_applications.id,
        'application_reminder'::text as kind
      from public.reporter_applications
      where reporter_applications.status = 'kyc_pending'
        and reporter_applications.completion_deadline is not null
        and reporter_applications.completion_reminded_at is null
        and reporter_applications.completion_deadline > lifecycle_time
        and reporter_applications.completion_deadline - interval '7 days' <= lifecycle_time

      union all
      select
        reporter_applications.completion_deadline,
        reporter_applications.id,
        'application_cancelled'::text
      from public.reporter_applications
      where reporter_applications.status = 'kyc_pending'
        and reporter_applications.completion_deadline is not null
        and reporter_applications.completion_deadline <= lifecycle_time
        and exists (
          select 1
          from public.reporter_payments
          where reporter_payments.application_id = reporter_applications.id
            and reporter_payments.purpose = 'application'
            and reporter_payments.payment_status = 'captured'
            and reporter_payments.refund_status = 'not_eligible'
        )

      union all
      select
        reporter_profiles.membership_expires_at - interval '30 days',
        reporter_profiles.profile_id,
        'membership_reminder'::text
      from public.reporter_profiles
      where reporter_profiles.public_status = 'active'
        and reporter_profiles.membership_expires_at > lifecycle_time
        and reporter_profiles.membership_expires_at - interval '30 days' <= lifecycle_time
        and reporter_profiles.renewal_reminded_for
          is distinct from reporter_profiles.membership_expires_at

      union all
      select
        reporter_profiles.membership_expires_at,
        reporter_profiles.profile_id,
        'membership_grace'::text
      from public.reporter_profiles
      where reporter_profiles.public_status = 'active'
        and reporter_profiles.membership_expires_at < lifecycle_time
        and reporter_profiles.membership_grace_ends_at >= lifecycle_time

      union all
      select
        reporter_profiles.membership_grace_ends_at,
        reporter_profiles.profile_id,
        'membership_expired'::text
      from public.reporter_profiles
      where reporter_profiles.public_status in ('active', 'grace')
        and reporter_profiles.membership_grace_ends_at < lifecycle_time

      union all
      select
        greatest(
          reporter_payments.refund_eligible_at,
          case
            when reporter_payments.refund_status = 'refund_failed'
              then reporter_payments.updated_at + interval '5 minutes'
            else reporter_payments.refund_eligible_at
          end
        ),
        reporter_payments.id,
        'refund'::text
      from public.reporter_payments
      where reporter_payments.purpose = 'application'
        and reporter_payments.payment_status = 'captured'
        and reporter_payments.amount_paise = 10000
        and reporter_payments.currency = 'INR'
        and reporter_payments.refund_eligible_at is not null
        and reporter_payments.refund_eligible_at <= lifecycle_time
        and reporter_payments.razorpay_payment_id is not null
        and reporter_payments.refund_status in ('refund_pending', 'refund_failed')
        and (
          reporter_payments.refund_status = 'refund_failed'
          or reporter_payments.razorpay_refund_id is null
        )
        and (
          reporter_payments.refund_request_token is null
          or reporter_payments.refund_request_reserved_at
            <= lifecycle_time - interval '5 minutes'
        )
        and (
          reporter_payments.refund_status <> 'refund_failed'
          or reporter_payments.updated_at <= lifecycle_time - interval '5 minutes'
        )

      union all
      select
        live_recordings.retention_delete_at,
        live_recordings.id,
        'recording_delete'::text
      from public.live_recordings
      where live_recordings.recording_status = 'completed'
        and live_recordings.replay_status in ('private', 'rejected')
        and live_recordings.retention_delete_at is not null
        and live_recordings.retention_delete_at <= lifecycle_time
        and live_recordings.storage_key is not null
        and live_recordings.storage_deleted_at is null
        and not live_recordings.legal_hold
        and live_recordings.terminal_reconciliation_status is distinct from 'unknown'
        and live_recordings.storage_key = 'reporter-live/'
          || live_recordings.live_request_id::text
          || '/' || live_recordings.id::text || '.mp4'
        and not exists (
          select 1 from public.public_live_replays
          where public_live_replays.id = live_recordings.id
        )
        and (
          live_recordings.deletion_lease_token is null
          or live_recordings.deletion_lease_claimed_at
            <= lifecycle_time - interval '5 minutes'
        )

      union all
      select
        story_locations.retention_due_at,
        story_locations.id,
        'coordinate_delete'::text
      from public.story_locations
      where story_locations.retention_due_at is not null
        and story_locations.retention_due_at <= lifecycle_time
        and story_locations.exact_coordinates_deleted_at is null
        and not story_locations.legal_hold
        and exists (
          select 1
          from public.stories
          where stories.id = story_locations.story_id
            and stories.status in ('published', 'rejected', 'archived')
        )
    )
    select due_at, id, kind
    from due_work
    order by due_at, id, kind
    limit p_limit
  loop
    if work.kind = 'application_reminder' then
      select * into current_application
      from public.reporter_applications
      where id = work.id
      for update;
      if not found
        or current_application.status <> 'kyc_pending'
        or current_application.completion_deadline is null
        or current_application.completion_deadline <= lifecycle_time
        or current_application.completion_deadline - interval '7 days' > lifecycle_time
        or current_application.completion_reminded_at is not null then
        continue;
      end if;
      update public.reporter_applications
      set completion_reminded_at = lifecycle_time,
          updated_at = lifecycle_time
      where id = current_application.id;
      insert into public.reporter_notifications (
        profile_id, notification_type, message
      ) values (
        current_application.profile_id,
        'application_completion_reminder',
        'Please complete your reporter verification before the deadline.'
      );
      insert into public.audit_events (
        actor_id, action, subject_type, subject_id, metadata, created_at
      ) values (
        null,
        'reporter.application_completion_reminded',
        'reporter_application',
        current_application.id,
        '{}'::jsonb,
        lifecycle_time
      );
      work_items := work_items || jsonb_build_array(
        jsonb_build_object('kind', 'application_reminder')
      );

    elsif work.kind = 'application_cancelled' then
      select * into current_application
      from public.reporter_applications
      where id = work.id
      for update;
      if not found
        or current_application.status <> 'kyc_pending'
        or current_application.completion_deadline is null
        or current_application.completion_deadline > lifecycle_time then
        continue;
      end if;
      select * into current_payment
      from public.reporter_payments
      where application_id = current_application.id
      for update;
      if not found
        or current_payment.purpose <> 'application'
        or current_payment.payment_status <> 'captured'
        or current_payment.refund_status <> 'not_eligible' then
        continue;
      end if;
      perform public.mark_overdue_reporter_application(work.id);
      insert into public.reporter_notifications (
        profile_id, notification_type, message
      ) values (
        current_application.profile_id,
        'application_cancelled',
        'Your incomplete reporter application was cancelled and its refund was queued.'
      );
      work_items := work_items || jsonb_build_array(
        jsonb_build_object('kind', 'application_cancelled')
      );

    elsif work.kind in (
      'membership_reminder', 'membership_grace', 'membership_expired'
    ) then
      select * into current_reporter
      from public.reporter_profiles
      where profile_id = work.id
      for update;
      if not found or current_reporter.public_status = 'suspended' then
        continue;
      end if;

      if work.kind = 'membership_reminder' then
        if current_reporter.public_status <> 'active'
          or current_reporter.membership_expires_at <= lifecycle_time
          or current_reporter.membership_expires_at - interval '30 days' > lifecycle_time
          or current_reporter.renewal_reminded_for
            is not distinct from current_reporter.membership_expires_at then
          continue;
        end if;
        update public.reporter_profiles
        set renewal_reminded_for = current_reporter.membership_expires_at,
            updated_at = lifecycle_time
        where profile_id = current_reporter.profile_id;
        insert into public.reporter_notifications (
          profile_id, notification_type, message
        ) values (
          current_reporter.profile_id,
          'membership_renewal_reminder',
          'Your reporter membership is due for renewal in 30 days.'
        );
        insert into public.audit_events (
          actor_id, action, subject_type, subject_id, metadata, created_at
        ) values (
          null,
          'reporter.membership_renewal_reminded',
          'reporter_profile',
          current_reporter.profile_id,
          '{}'::jsonb,
          lifecycle_time
        );
        work_items := work_items || jsonb_build_array(
          jsonb_build_object('kind', 'membership_reminder')
        );

      elsif work.kind = 'membership_grace' then
        if current_reporter.membership_expires_at > lifecycle_time then
          continue;
        end if;
        if current_reporter.public_status <> 'active'
          or current_reporter.membership_expires_at >= lifecycle_time
          or current_reporter.membership_grace_ends_at < lifecycle_time then
          continue;
        end if;
        update public.reporter_profiles
        set public_status = 'grace', updated_at = lifecycle_time
        where profile_id = current_reporter.profile_id;
        insert into public.reporter_notifications (
          profile_id, notification_type, message
        ) values (
          current_reporter.profile_id,
          'membership_grace_started',
          'Your reporter membership is in its seven-day renewal grace period.'
        );
        insert into public.audit_events (
          actor_id, action, subject_type, subject_id, metadata, created_at
        ) values (
          null,
          'reporter.membership_grace_started',
          'reporter_profile',
          current_reporter.profile_id,
          '{}'::jsonb,
          lifecycle_time
        );
        work_items := work_items || jsonb_build_array(
          jsonb_build_object('kind', 'membership_grace')
        );

      else
        if current_reporter.membership_expires_at > lifecycle_time
          or current_reporter.membership_grace_ends_at >= lifecycle_time then
          continue;
        end if;
        if current_reporter.public_status not in ('active', 'grace') then
          continue;
        end if;
        update public.reporter_profiles
        set public_status = 'expired', updated_at = lifecycle_time
        where profile_id = current_reporter.profile_id;
        insert into public.reporter_notifications (
          profile_id, notification_type, message
        ) values (
          current_reporter.profile_id,
          'membership_expired',
          'Your reporter membership has expired.'
        );
        insert into public.audit_events (
          actor_id, action, subject_type, subject_id, metadata, created_at
        ) values (
          null,
          'reporter.membership_expired',
          'reporter_profile',
          current_reporter.profile_id,
          '{}'::jsonb,
          lifecycle_time
        );
        work_items := work_items || jsonb_build_array(
          jsonb_build_object('kind', 'membership_expired')
        );
      end if;

    elsif work.kind = 'refund' then
      select * into current_payment
      from public.reporter_payments
      where id = work.id
      for update;
      if not found then
        continue;
      end if;
      if current_payment.refund_status = 'refunded' then
        continue;
      end if;
      if current_payment.purpose <> 'application'
        or current_payment.payment_status <> 'captured'
        or current_payment.amount_paise <> 10000
        or current_payment.currency <> 'INR'
        or current_payment.refund_eligible_at is null
        or current_payment.refund_eligible_at > lifecycle_time
        or current_payment.razorpay_payment_id is null
        or current_payment.refund_status not in ('refund_pending', 'refund_failed')
        or (
          current_payment.refund_status = 'refund_pending'
          and current_payment.razorpay_refund_id is not null
        )
        or (
          current_payment.refund_request_token is not null
          and current_payment.refund_request_reserved_at
            > lifecycle_time - interval '5 minutes'
        )
        or (
          current_payment.refund_status = 'refund_failed'
          and current_payment.updated_at > lifecycle_time - interval '5 minutes'
        ) then
        continue;
      end if;
      next_attempt := case
        when current_payment.refund_status = 'refund_pending'
          and current_payment.refund_attempt_count > 0
          then current_payment.refund_attempt_count
        else current_payment.refund_attempt_count + 1
      end;
      lease_token := gen_random_uuid();
      update public.reporter_payments
      set refund_status = 'refund_pending',
          razorpay_refund_id = case
            when current_payment.refund_status = 'refund_failed' then null
            else current_payment.razorpay_refund_id
          end,
          refund_request_token = lease_token,
          refund_request_reserved_at = lifecycle_time,
          refund_attempt_count = next_attempt,
          refund_failure_detail = null,
          updated_at = lifecycle_time
      where id = current_payment.id;
      work_items := work_items || jsonb_build_array(jsonb_build_object(
        'kind', 'refund',
        'id', current_payment.id,
        'lease_token', lease_token,
        'attempt', next_attempt,
        'provider_payment_id', current_payment.razorpay_payment_id,
        'amount_paise', current_payment.amount_paise,
        'currency', current_payment.currency
      ));

    elsif work.kind = 'recording_delete' then
      select live_request_id into target_request_id
      from public.live_recordings
      where id = work.id;
      if not found then
        continue;
      end if;
      select * into current_request
      from public.reporter_live_requests
      where id = target_request_id
      for update;
      if not found then
        continue;
      end if;
      select * into current_recording
      from public.live_recordings
      where id = work.id
      for update;
      if not found
        or current_recording.live_request_id <> current_request.id
        or current_recording.recording_status <> 'completed'
        or current_recording.replay_status not in ('private', 'rejected')
        or current_recording.retention_delete_at is null
        or current_recording.retention_delete_at > lifecycle_time
        or current_recording.storage_key is null
        or current_recording.storage_deleted_at is not null
        or current_recording.legal_hold
        or current_recording.terminal_reconciliation_status is not distinct from 'unknown'
        or current_recording.storage_key <> 'reporter-live/'
          || current_recording.live_request_id::text
          || '/' || current_recording.id::text || '.mp4'
        or exists (
          select 1 from public.public_live_replays
          where public_live_replays.id = current_recording.id
        )
        or (
          current_recording.deletion_lease_token is not null
          and current_recording.deletion_lease_claimed_at
            > lifecycle_time - interval '5 minutes'
        ) then
        continue;
      end if;
      lease_token := gen_random_uuid();
      next_attempt := current_recording.deletion_attempt_count + 1;
      update public.live_recordings
      set deletion_lease_token = lease_token,
          deletion_lease_claimed_at = lifecycle_time,
          deletion_attempt_count = next_attempt,
          deletion_failure_detail = null,
          updated_at = lifecycle_time
      where id = current_recording.id;
      work_items := work_items || jsonb_build_array(jsonb_build_object(
        'kind', 'recording_delete',
        'id', current_recording.id,
        'lease_token', lease_token,
        'attempt', next_attempt,
        'object_key', current_recording.storage_key
      ));

    elsif work.kind = 'coordinate_delete' then
      select story_id into target_story_id
      from public.story_locations
      where id = work.id;
      if not found then
        continue;
      end if;
      select * into current_story
      from public.stories
      where id = target_story_id
      for update;
      if not found then
        continue;
      end if;
      select * into current_location
      from public.story_locations
      where id = work.id
      for update;
      if not found
        or current_location.story_id <> current_story.id
        or current_story.status not in ('published', 'rejected', 'archived')
        or current_location.retention_due_at is null
        or current_location.retention_due_at > lifecycle_time
        or current_location.legal_hold
        or current_location.exact_coordinates_deleted_at is not null then
        continue;
      end if;
      update public.story_locations
      set latitude = null,
          longitude = null,
          accuracy_meters = null,
          captured_at = null,
          exact_coordinates_deleted_at = lifecycle_time
      where id = current_location.id;
      insert into public.audit_events (
        actor_id, action, subject_type, subject_id, metadata, created_at
      ) values (
        null,
        'reporter.story_coordinates_deleted',
        'story',
        current_story.id,
        jsonb_build_object('exact_coordinates_deleted', true),
        lifecycle_time
      );
      work_items := work_items || jsonb_build_array(
        jsonb_build_object('kind', 'coordinate_delete')
      );
    end if;
  end loop;

  return work_items;
end;
$$;

create function public.fail_reporter_lifecycle_refund(
  p_payment_id uuid,
  p_lease_token uuid,
  p_failure_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_payment public.reporter_payments%rowtype;
  failure_time timestamptz := clock_timestamp();
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'REPORTER_LIFECYCLE_FORBIDDEN';
  end if;
  if p_payment_id is null or p_lease_token is null
    or p_failure_code not in (
      'provider-not-configured',
      'provider-request-failed',
      'provider-response-mismatch'
    ) then
    raise exception using errcode = '22023', message = 'REPORTER_LIFECYCLE_FAILURE_INVALID';
  end if;
  select * into current_payment
  from public.reporter_payments
  where id = p_payment_id
  for update;
  if not found
    or current_payment.refund_status <> 'refund_pending'
    or current_payment.razorpay_refund_id is not null
    or current_payment.refund_request_token is distinct from p_lease_token then
    return false;
  end if;
  if current_payment.refund_failure_detail is not distinct from p_failure_code then
    return true;
  end if;

  update public.reporter_payments
  set refund_failure_detail = p_failure_code,
      updated_at = failure_time
  where id = current_payment.id;
  insert into public.audit_events (
    actor_id, action, subject_type, subject_id, metadata, created_at
  ) values (
    null,
    'reporter.refund_attempt_failed',
    'reporter_payment',
    current_payment.id,
    jsonb_build_object('failure_code', p_failure_code),
    failure_time
  );
  return true;
end;
$$;

create function public.complete_reporter_recording_deletion(
  p_recording_id uuid,
  p_lease_token uuid,
  p_object_key text,
  p_result text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_request public.reporter_live_requests%rowtype;
  current_recording public.live_recordings%rowtype;
  target_request_id uuid;
  completion_time timestamptz := clock_timestamp();
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'REPORTER_LIFECYCLE_FORBIDDEN';
  end if;
  if p_recording_id is null or p_lease_token is null
    or p_object_key is null
    or p_result not in ('deleted', 'not_found') then
    raise exception using errcode = '22023', message = 'REPORTER_RECORDING_DELETION_INVALID';
  end if;
  select live_request_id into target_request_id
  from public.live_recordings
  where id = p_recording_id;
  if not found then
    return false;
  end if;
  select * into current_request
  from public.reporter_live_requests
  where id = target_request_id
  for update;
  if not found then
    return false;
  end if;
  select * into current_recording
  from public.live_recordings
  where id = p_recording_id
  for update;
  if found
    and current_recording.live_request_id = current_request.id
    and current_recording.storage_deleted_at is not null
    and current_recording.storage_key is null
    and p_object_key = 'reporter-live/'
      || current_recording.live_request_id::text
      || '/' || current_recording.id::text || '.mp4' then
    return true;
  end if;
  if not found
    or current_recording.live_request_id <> current_request.id
    or current_recording.deletion_lease_token is distinct from p_lease_token
    or current_recording.storage_key is distinct from p_object_key
    or p_object_key <> 'reporter-live/'
      || current_recording.live_request_id::text
      || '/' || current_recording.id::text || '.mp4'
    or current_recording.recording_status <> 'completed'
    or current_recording.replay_status not in ('private', 'rejected')
    or current_recording.retention_delete_at is null
    or current_recording.retention_delete_at > completion_time
    or current_recording.legal_hold
    or current_recording.terminal_reconciliation_status is not distinct from 'unknown'
    or exists (
      select 1 from public.public_live_replays
      where public_live_replays.id = current_recording.id
    ) then
    return false;
  end if;
  update public.live_recordings
  set storage_key = null,
      storage_deleted_at = completion_time,
      deletion_lease_token = null,
      deletion_lease_claimed_at = null,
      deletion_failure_detail = null,
      updated_at = completion_time
  where id = current_recording.id;
  insert into public.audit_events (
    actor_id, action, subject_type, subject_id, metadata, created_at
  ) values (
    null,
    'reporter.live_recording_deleted',
    'live_recording',
    current_recording.id,
    jsonb_build_object('result', p_result),
    completion_time
  );
  insert into public.reporter_notifications (
    profile_id, notification_type, message
  ) values (
    current_request.profile_id,
    'recording_deleted',
    'A retained private live recording reached its deletion date and was removed.'
  );
  return true;
end;
$$;

create function public.fail_reporter_recording_deletion(
  p_recording_id uuid,
  p_lease_token uuid,
  p_object_key text,
  p_failure_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_request public.reporter_live_requests%rowtype;
  current_recording public.live_recordings%rowtype;
  target_request_id uuid;
  failure_time timestamptz := clock_timestamp();
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'REPORTER_LIFECYCLE_FORBIDDEN';
  end if;
  if p_recording_id is null or p_lease_token is null
    or p_object_key is null
    or p_failure_code not in (
      'provider-not-configured', 'provider-request-failed'
    ) then
    raise exception using errcode = '22023', message = 'REPORTER_RECORDING_DELETION_INVALID';
  end if;
  select live_request_id into target_request_id
  from public.live_recordings
  where id = p_recording_id;
  if not found then
    return false;
  end if;
  select * into current_request
  from public.reporter_live_requests
  where id = target_request_id
  for update;
  if not found then
    return false;
  end if;
  select * into current_recording
  from public.live_recordings
  where id = p_recording_id
  for update;
  if not found
    or current_recording.live_request_id <> current_request.id
    or current_recording.deletion_lease_token is distinct from p_lease_token
    or current_recording.storage_key is distinct from p_object_key
    or p_object_key <> 'reporter-live/'
      || current_recording.live_request_id::text
      || '/' || current_recording.id::text || '.mp4'
    or current_recording.recording_status <> 'completed'
    or current_recording.replay_status not in ('private', 'rejected')
    or current_recording.retention_delete_at is null
    or current_recording.retention_delete_at > failure_time
    or current_recording.legal_hold
    or current_recording.terminal_reconciliation_status is not distinct from 'unknown'
    or exists (
      select 1 from public.public_live_replays
      where public_live_replays.id = current_recording.id
    ) then
    return false;
  end if;
  if current_recording.deletion_failure_detail is not distinct from p_failure_code then
    return true;
  end if;
  update public.live_recordings
  set deletion_lease_token = p_lease_token,
      deletion_failure_detail = p_failure_code,
      updated_at = failure_time
  where id = current_recording.id;
  insert into public.audit_events (
    actor_id, action, subject_type, subject_id, metadata, created_at
  ) values (
    null,
    'reporter.live_recording_deletion_failed',
    'live_recording',
    current_recording.id,
    jsonb_build_object('failure_code', p_failure_code),
    failure_time
  );
  return true;
end;
$$;

revoke all on function public.claim_reporter_lifecycle(integer)
from public, anon, authenticated, service_role;
revoke all on function public.fail_reporter_lifecycle_refund(uuid, uuid, text)
from public, anon, authenticated, service_role;
revoke all on function public.complete_reporter_recording_deletion(uuid, uuid, text, text)
from public, anon, authenticated, service_role;
revoke all on function public.fail_reporter_recording_deletion(uuid, uuid, text, text)
from public, anon, authenticated, service_role;

grant execute on function public.claim_reporter_lifecycle(integer)
to service_role;
grant execute on function public.fail_reporter_lifecycle_refund(uuid, uuid, text)
to service_role;
grant execute on function public.complete_reporter_recording_deletion(uuid, uuid, text, text)
to service_role;
grant execute on function public.fail_reporter_recording_deletion(uuid, uuid, text, text)
to service_role;
