-- Verified LiveKit receipt processing and private recording editorial review.

alter table public.webhook_events
  add column provider_subject_id text,
  add constraint webhook_events_provider_subject_id_check check (
    provider_subject_id is null or (
      length(provider_subject_id) between 1 and 255
      and provider_subject_id ~ '^[A-Za-z0-9_-]+$'
    )
  );

comment on column public.webhook_events.provider_subject_id is
  'Bound provider object identifier. LiveKit uses the exact Egress ID; no provider body or location is retained.';

create table public.live_recording_editorial_private (
  recording_id uuid primary key references public.live_recordings (id) on delete restrict,
  rejection_reason text not null check (
    length(btrim(rejection_reason)) between 1 and 2000
  ),
  created_at timestamptz not null default clock_timestamp()
);

create table public.live_recording_legal_hold_events (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references public.live_recordings (id) on delete restrict,
  actor_id uuid not null references public.profiles (id) on delete restrict,
  legal_hold boolean not null,
  reason text not null check (length(btrim(reason)) between 1 and 2000),
  created_at timestamptz not null default clock_timestamp()
);

create table public.public_live_replays (
  id uuid primary key references public.live_recordings (id) on delete restrict,
  live_request_id uuid not null references public.reporter_live_requests (id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 240),
  description text not null check (length(btrim(description)) between 1 and 4000),
  category_id uuid not null references public.categories (id) on delete restrict,
  thumbnail_media_id uuid not null references public.media (id) on delete restrict,
  duration_seconds numeric(12, 3) not null check (duration_seconds > 0),
  recording_started_at timestamptz not null,
  recording_ended_at timestamptz not null,
  published_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint public_live_replays_recording_window_check
    check (recording_ended_at >= recording_started_at)
);

create index public_live_replays_published_idx
  on public.public_live_replays (published_at desc, id desc);
create index live_recording_legal_hold_events_recording_created_idx
  on public.live_recording_legal_hold_events (recording_id, created_at desc, id desc);
create index live_recording_legal_hold_events_actor_idx
  on public.live_recording_legal_hold_events (actor_id);

comment on table public.live_recording_editorial_private is
  'Private immutable rejection reasons. Reasons must never enter generic audits or public projections.';
comment on table public.live_recording_legal_hold_events is
  'Append-only private legal-hold state changes. Actor and reason must never enter generic audits or public projections.';
comment on table public.public_live_replays is
  'Closed-by-default replay projection. Task 6 owns any anonymous policy or grant.';

alter table public.live_recording_editorial_private enable row level security;
alter table public.live_recording_legal_hold_events enable row level security;
alter table public.public_live_replays enable row level security;

revoke all on table public.live_recording_editorial_private
from public, anon, authenticated, service_role;
revoke all on table public.live_recording_legal_hold_events
from public, anon, authenticated, service_role;
revoke all on table public.public_live_replays
from public, anon, authenticated, service_role;

grant select (recording_id, rejection_reason, created_at)
on table public.live_recording_editorial_private to authenticated;
grant select (id, recording_id, legal_hold, reason, created_at)
on table public.live_recording_legal_hold_events to authenticated;

create policy "Active staff can read private recording decisions"
on public.live_recording_editorial_private
for select to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') in ('editor', 'admin')
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role::text = (select auth.jwt() -> 'app_metadata' ->> 'role')
      and profiles.role in ('editor', 'admin') and profiles.is_active
  )
);

create policy "Active staff can read private recording legal hold events"
on public.live_recording_legal_hold_events
for select to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') in ('editor', 'admin')
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role::text = (select auth.jwt() -> 'app_metadata' ->> 'role')
      and profiles.role in ('editor', 'admin') and profiles.is_active
  )
);

create function public.prevent_live_recording_private_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'LIVE_RECORDING_PRIVATE_EVENT_IMMUTABLE';
end;
$$;

revoke all on function public.prevent_live_recording_private_mutation()
from public, anon, authenticated, service_role;

create trigger prevent_live_recording_editorial_private_mutation
before update or delete on public.live_recording_editorial_private
for each row execute function public.prevent_live_recording_private_mutation();

create trigger prevent_live_recording_legal_hold_event_mutation
before update or delete on public.live_recording_legal_hold_events
for each row execute function public.prevent_live_recording_private_mutation();

-- Remove provider and storage columns from browser-visible table privileges.
revoke select on table public.live_recordings from authenticated;
grant select (
  id, live_request_id, recording_status, duration_seconds, bytes,
  recording_started_at, recording_completed_at, replay_status,
  replay_title, replay_description, replay_category_id,
  replay_thumbnail_media_id, replay_published_at, replay_rejected_at,
  retention_delete_at, legal_hold, created_at, updated_at
) on table public.live_recordings to authenticated;

create function public.claim_livekit_webhook_event(
  p_event_id text,
  p_event_type text,
  p_egress_id text
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
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'LIVEKIT_WEBHOOK_FORBIDDEN';
  end if;
  if p_event_id is null
    or length(p_event_id) not between 1 and 255
    or p_event_id !~ '^[A-Za-z0-9_-]+$'
    or p_event_type is null
    or p_event_type not in ('egress_started', 'egress_updated', 'egress_ended')
    or p_egress_id is null
    or length(p_egress_id) not between 1 and 255
    or p_egress_id !~ '^[A-Za-z0-9_-]+$' then
    raise exception using errcode = '22023', message = 'LIVEKIT_WEBHOOK_INVALID';
  end if;

  insert into public.webhook_events (
    provider, provider_event_id, event_type, provider_subject_id,
    signature_verified_at, processing_status, attempt_count,
    processing_token, created_at, updated_at
  ) values (
    'livekit', p_event_id, p_event_type, p_egress_id,
    claim_time, 'pending', 1, claim_token, claim_time, claim_time
  ) on conflict (provider, provider_event_id) do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 1 then
    return jsonb_build_object('state', 'claimed', 'token', claim_token);
  end if;

  select * into current_event
  from public.webhook_events
  where provider = 'livekit' and provider_event_id = p_event_id
  for update;

  if current_event.event_type is distinct from p_event_type
    or current_event.provider_subject_id is distinct from p_egress_id then
    raise exception using errcode = '22023', message = 'LIVEKIT_WEBHOOK_EVENT_MISMATCH';
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

create function public.complete_livekit_webhook_event(
  p_event_id text,
  p_processing_token uuid,
  p_recording_id uuid,
  p_recording_status text,
  p_storage_key text,
  p_duration_seconds numeric,
  p_bytes bigint,
  p_provider_started_at timestamptz,
  p_provider_ended_at timestamptz,
  p_failure_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_event public.webhook_events%rowtype;
  current_recording public.live_recordings%rowtype;
  current_request public.reporter_live_requests%rowtype;
  target_request_id uuid;
  processing_time timestamptz := clock_timestamp();
  canonical_key text;
  updated_count integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'LIVEKIT_WEBHOOK_FORBIDDEN';
  end if;
  if p_event_id is null or length(p_event_id) not between 1 and 255
    or p_event_id !~ '^[A-Za-z0-9_-]+$'
    or p_processing_token is null or p_recording_id is null
    or p_recording_status is null
    or p_recording_status not in ('recording', 'completed', 'failed')
    or (p_provider_ended_at is not null and p_provider_ended_at < p_provider_started_at)
    or (p_recording_status = 'recording' and (
      p_storage_key is not null or p_duration_seconds is not null or p_bytes is not null
      or p_provider_started_at is not null or p_provider_ended_at is not null
      or p_failure_code is not null
    ))
    or (p_recording_status = 'completed' and (
      p_storage_key is null or p_duration_seconds is null or p_duration_seconds <= 0
      or p_duration_seconds > 86400 or p_bytes is null or p_bytes <= 0
      or p_bytes > 1099511627776 or p_provider_started_at is null
      or p_provider_ended_at is null or p_provider_ended_at <= p_provider_started_at
      or p_failure_code is not null
    ))
    or (p_recording_status = 'failed' and (
      p_storage_key is not null or p_duration_seconds is not null or p_bytes is not null
      or p_provider_started_at is not null or p_provider_ended_at is not null
      or p_failure_code is null
      or p_failure_code not in (
        'provider-egress-failed',
        'provider-egress-aborted',
        'provider-egress-limit-reached'
      )
    )) then
    raise exception using errcode = '22023', message = 'LIVEKIT_WEBHOOK_RESULT_INVALID';
  end if;

  select * into current_event
  from public.webhook_events
  where provider = 'livekit' and provider_event_id = p_event_id
  for update;
  if not found or current_event.processing_status <> 'pending'
    or current_event.processing_token <> p_processing_token then
    return jsonb_build_object('state', 'lease-lost');
  end if;

  -- Resolve the parent without locking so every live flow can acquire the
  -- canonical request row before its recording row.
  select live_request_id into target_request_id
  from public.live_recordings
  where id = p_recording_id;
  if not found then
    raise exception using errcode = '22023', message = 'LIVEKIT_WEBHOOK_TARGET_MISMATCH';
  end if;

  select * into current_request
  from public.reporter_live_requests
  where id = target_request_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'LIVEKIT_WEBHOOK_TARGET_MISMATCH';
  end if;

  select * into current_recording
  from public.live_recordings
  where id = p_recording_id
  for update;
  if not found
    or current_recording.live_request_id is distinct from current_request.id
    or current_recording.egress_id is distinct from current_event.provider_subject_id
    or current_request.livekit_room_name is null
    or current_request.livekit_room_name is distinct from
      'reporter-live-' || replace(current_request.id::text, '-', '') then
    raise exception using errcode = '22023', message = 'LIVEKIT_WEBHOOK_TARGET_MISMATCH';
  end if;

  if current_recording.recording_status in ('completed', 'failed') then
    update public.webhook_events
    set processing_status = 'processed', processing_token = null,
        failure_detail = null, subject_type = 'live_recording',
        subject_id = current_recording.id, processed_at = processing_time,
        updated_at = processing_time
    where id = current_event.id and processing_token = p_processing_token
      and processing_status = 'pending';
    get diagnostics updated_count = row_count;
    if updated_count <> 1 then
      raise exception using errcode = '40001', message = 'LIVEKIT_WEBHOOK_LEASE_LOST';
    end if;
    return jsonb_build_object('state', 'stale');
  end if;

  canonical_key := 'reporter-live/' || current_request.id::text || '/'
    || current_recording.id::text || '.mp4';
  if p_recording_status = 'completed' and p_storage_key is distinct from canonical_key then
    raise exception using errcode = '22023', message = 'LIVEKIT_WEBHOOK_KEY_MISMATCH';
  end if;

  if p_recording_status = 'recording' then
    if current_recording.recording_status = 'pending' then
      update public.live_recordings
      set recording_status = 'recording', recording_claim_token = null,
          recording_claimed_at = null
      where id = current_recording.id;
    end if;
  elsif p_recording_status = 'completed' then
    update public.live_recordings
    set recording_status = 'completed', storage_key = canonical_key,
        duration_seconds = p_duration_seconds, bytes = p_bytes,
        provider_error = null, recording_claim_token = null,
        recording_claimed_at = null
    where id = current_recording.id;
  else
    update public.live_recordings
    set recording_status = 'failed', provider_error = p_failure_code,
        storage_key = null, duration_seconds = null, bytes = null,
        recording_claim_token = null, recording_claimed_at = null
    where id = current_recording.id;

    insert into public.audit_events (
      actor_id, action, subject_type, subject_id, metadata, created_at
    ) values (
      null, 'live_recording.failed', 'live_recording', current_recording.id,
      '{"status":"failed","failure_code":"recording-failed"}'::jsonb,
      processing_time
    );
    insert into public.reporter_notifications (
      profile_id, notification_type, message, delivery_channel,
      delivery_status, created_at
    )
    select profiles.id, 'live_recording_failure',
      'A reporter live recording requires editorial attention.',
      'in_app', 'not_applicable', processing_time
    from public.profiles
    where profiles.role in ('editor', 'admin') and profiles.is_active;
  end if;

  update public.webhook_events
  set processing_status = 'processed', processing_token = null,
      failure_detail = null, subject_type = 'live_recording',
      subject_id = current_recording.id, processed_at = processing_time,
      updated_at = processing_time
  where id = current_event.id and processing_token = p_processing_token
    and processing_status = 'pending';
  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception using errcode = '40001', message = 'LIVEKIT_WEBHOOK_LEASE_LOST';
  end if;

  return jsonb_build_object('state', 'updated');
end;
$$;

create function public.fail_livekit_webhook_event(
  p_event_id text,
  p_processing_token uuid,
  p_failure_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'LIVEKIT_WEBHOOK_FORBIDDEN';
  end if;
  if p_event_id is null or length(p_event_id) not between 1 and 255
    or p_event_id !~ '^[A-Za-z0-9_-]+$'
    or p_processing_token is null or p_failure_code is null
    or p_failure_code not in ('payload-mismatch', 'target-mismatch', 'processing-failed') then
    raise exception using errcode = '22023', message = 'LIVEKIT_WEBHOOK_FAILURE_INVALID';
  end if;

  update public.webhook_events
  set processing_status = 'failed', processing_token = null,
      failure_detail = p_failure_code, updated_at = clock_timestamp()
  where provider = 'livekit' and provider_event_id = p_event_id
    and processing_status = 'pending' and processing_token = p_processing_token;
  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

create function public.report_reporter_live_recording_reconciliation(
  p_recording_id uuid,
  p_claim_token uuid,
  p_egress_id text,
  p_provider_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_request_id uuid;
  current_request public.reporter_live_requests%rowtype;
  current_recording public.live_recordings%rowtype;
  alert_time timestamptz := clock_timestamp();
  alert_required boolean;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'REPORTER_LIVE_RECONCILIATION_FORBIDDEN';
  end if;
  if p_recording_id is null or p_claim_token is null
    or p_egress_id is null
    or length(p_egress_id) not between 1 and 255
    or p_egress_id !~ '^[A-Za-z0-9_-]+$'
    or p_provider_status is null
    or p_provider_status not in ('completed', 'failed') then
    raise exception using errcode = '22023', message = 'REPORTER_LIVE_RECONCILIATION_INVALID';
  end if;

  -- Resolve the parent without locking, then use the shared request -> recording order.
  select live_request_id into target_request_id
  from public.live_recordings
  where id = p_recording_id;
  if not found then return false; end if;

  select * into current_request
  from public.reporter_live_requests
  where id = target_request_id
  for update;
  if not found then return false; end if;

  select * into current_recording
  from public.live_recordings
  where id = p_recording_id
  for update;
  if not found
    or current_recording.live_request_id is distinct from current_request.id
    or current_recording.recording_status <> 'pending'
    or current_recording.recording_claim_token is distinct from p_claim_token
    or current_request.livekit_room_name is null
    or current_request.livekit_room_name is distinct from
      'reporter-live-' || replace(current_request.id::text, '-', '')
    or (current_recording.egress_id is not null
      and current_recording.egress_id is distinct from p_egress_id) then
    return false;
  end if;

  select not exists (
    select 1 from public.audit_events
    where action = 'live_recording.reconciliation_required'
      and subject_type = 'live_recording'
      and subject_id = current_recording.id
  ) into alert_required;

  update public.live_recordings
  set egress_id = p_egress_id
  where id = current_recording.id
    and recording_status = 'pending'
    and recording_claim_token = p_claim_token
    and (egress_id is null or egress_id = p_egress_id);
  if not found then return false; end if;

  if alert_required then
    insert into public.audit_events (
      actor_id, action, subject_type, subject_id, metadata, created_at
    ) values (
      null, 'live_recording.reconciliation_required',
      'live_recording', current_recording.id,
      '{"status":"reconciliation_required"}'::jsonb, alert_time
    );
    insert into public.reporter_notifications (
      profile_id, notification_type, message, delivery_channel,
      delivery_status, created_at
    )
    select profiles.id, 'live_recording_failure',
      'A reporter live recording requires provider reconciliation.',
      'in_app', 'not_applicable', alert_time
    from public.profiles
    where profiles.role in ('editor', 'admin') and profiles.is_active;
  end if;
  return true;
end;
$$;

-- Replace the reasonless legal-hold RPC with the reviewed private-reason form.
revoke all on function public.set_live_recording_legal_hold(uuid, boolean)
from public, anon, authenticated, service_role;
drop function public.set_live_recording_legal_hold(uuid, boolean);

create function public.publish_live_recording(
  p_recording_id uuid,
  p_title text,
  p_description text,
  p_category_id uuid,
  p_thumbnail_media_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  current_recording public.live_recordings%rowtype;
  publication_time timestamptz := clock_timestamp();
  normalized_title text := btrim(p_title);
  normalized_description text := btrim(p_description);
begin
  if actor_id is null or actor_role not in ('editor', 'admin')
    or not exists (
      select 1 from public.profiles where profiles.id = actor_id
        and profiles.role::text = actor_role
        and profiles.role in ('editor', 'admin') and profiles.is_active
    ) then
    raise exception using errcode = '42501', message = 'LIVE_RECORDING_REVIEW_FORBIDDEN';
  end if;
  if p_recording_id is null or p_title is null or length(normalized_title) not between 1 and 240
    or p_description is null or length(normalized_description) not between 1 and 4000
    or p_category_id is null or p_thumbnail_media_id is null then
    raise exception using errcode = '22023', message = 'LIVE_RECORDING_PUBLICATION_INVALID';
  end if;

  select * into current_recording from public.live_recordings
  where id = p_recording_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'LIVE_RECORDING_NOT_FOUND';
  end if;
  if current_recording.replay_status = 'published' then
    if current_recording.replay_title is distinct from normalized_title
      or current_recording.replay_description is distinct from normalized_description
      or current_recording.replay_category_id is distinct from p_category_id
      or current_recording.replay_thumbnail_media_id is distinct from p_thumbnail_media_id then
      raise exception using errcode = '23505', message = 'LIVE_RECORDING_DECISION_CONFLICT';
    end if;
    return current_recording.id;
  end if;
  if current_recording.recording_status <> 'completed'
    or current_recording.replay_status <> 'private' then
    raise exception using errcode = '55000', message = 'LIVE_RECORDING_DECISION_CONFLICT';
  end if;
  perform 1 from public.categories
  where categories.id = p_category_id and categories.is_active
  for share;
  if not found then
    raise exception using errcode = '22023', message = 'LIVE_RECORDING_PUBLICATION_INVALID';
  end if;
  perform 1 from public.media
  where media.id = p_thumbnail_media_id
    and media.media_type = 'image' and media.deleted_at is null
  for share;
  if not found then
    raise exception using errcode = '22023', message = 'LIVE_RECORDING_PUBLICATION_INVALID';
  end if;

  update public.live_recordings
  set replay_status = 'published', replay_title = normalized_title,
      replay_description = normalized_description,
      replay_category_id = p_category_id,
      replay_thumbnail_media_id = p_thumbnail_media_id,
      replay_published_at = publication_time
  where id = current_recording.id;

  insert into public.public_live_replays (
    id, live_request_id, title, description, category_id, thumbnail_media_id,
    duration_seconds, recording_started_at, recording_ended_at,
    published_at, created_at, updated_at
  ) values (
    current_recording.id, current_recording.live_request_id,
    normalized_title, normalized_description, p_category_id, p_thumbnail_media_id,
    current_recording.duration_seconds, current_recording.recording_started_at,
    current_recording.recording_completed_at, publication_time,
    publication_time, publication_time
  );
  insert into public.audit_events (
    actor_id, action, subject_type, subject_id, metadata, created_at
  ) values (
    actor_id, 'live_recording.published', 'live_recording', current_recording.id,
    '{"status":"published","changed_fields":["title","description","category","thumbnail"]}'::jsonb,
    publication_time
  );
  return current_recording.id;
end;
$$;

create function public.reject_live_recording(
  p_recording_id uuid,
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
  current_recording public.live_recordings%rowtype;
  current_private public.live_recording_editorial_private%rowtype;
  normalized_reason text := btrim(p_reason);
  decision_time timestamptz := clock_timestamp();
begin
  if actor_id is null or actor_role not in ('editor', 'admin')
    or not exists (
      select 1 from public.profiles where profiles.id = actor_id
        and profiles.role::text = actor_role
        and profiles.role in ('editor', 'admin') and profiles.is_active
    ) then
    raise exception using errcode = '42501', message = 'LIVE_RECORDING_REVIEW_FORBIDDEN';
  end if;
  if p_recording_id is null or p_reason is null
    or length(normalized_reason) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'LIVE_RECORDING_REJECTION_INVALID';
  end if;

  select * into current_recording from public.live_recordings
  where id = p_recording_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'LIVE_RECORDING_NOT_FOUND';
  end if;
  select * into current_private from public.live_recording_editorial_private
  where recording_id = current_recording.id for update;

  if current_recording.replay_status = 'rejected' then
    if current_private.rejection_reason is distinct from normalized_reason then
      raise exception using errcode = '23505', message = 'LIVE_RECORDING_DECISION_CONFLICT';
    end if;
    return current_recording.id;
  end if;
  if current_recording.recording_status not in ('completed', 'failed')
    or current_recording.replay_status <> 'private' then
    raise exception using errcode = '55000', message = 'LIVE_RECORDING_DECISION_CONFLICT';
  end if;

  insert into public.live_recording_editorial_private (
    recording_id, rejection_reason, created_at
  ) values (current_recording.id, normalized_reason, decision_time);
  update public.live_recordings
  set replay_status = 'rejected', replay_rejected_at = decision_time
  where id = current_recording.id;
  insert into public.audit_events (
    actor_id, action, subject_type, subject_id, metadata, created_at
  ) values (
    actor_id, 'live_recording.rejected', 'live_recording', current_recording.id,
    '{"status":"rejected","changed_fields":["replay_status"]}'::jsonb,
    decision_time
  );
  return current_recording.id;
end;
$$;

create function public.set_live_recording_legal_hold(
  p_recording_id uuid,
  p_legal_hold boolean,
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
  current_recording public.live_recordings%rowtype;
  latest_hold_event public.live_recording_legal_hold_events%rowtype;
  normalized_reason text := btrim(p_reason);
  change_time timestamptz := clock_timestamp();
begin
  if actor_id is null or actor_role is distinct from 'admin'
    or not exists (
      select 1 from public.profiles where profiles.id = actor_id
        and profiles.role = 'admin' and profiles.is_active
    ) then
    raise exception using errcode = '42501', message = 'LIVE_RECORDING_LEGAL_HOLD_FORBIDDEN';
  end if;
  if p_recording_id is null or p_legal_hold is null or p_reason is null
    or length(normalized_reason) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'LIVE_RECORDING_LEGAL_HOLD_INVALID';
  end if;

  select * into current_recording from public.live_recordings
  where id = p_recording_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'LIVE_RECORDING_NOT_FOUND';
  end if;
  if current_recording.recording_status not in ('completed', 'failed') then
    raise exception using errcode = '55000', message = 'LIVE_RECORDING_LEGAL_HOLD_INVALID_STATE';
  end if;
  select * into latest_hold_event
  from public.live_recording_legal_hold_events
  where recording_id = current_recording.id
  order by created_at desc, id desc
  limit 1
  for update;
  if current_recording.legal_hold is not distinct from p_legal_hold then
    if latest_hold_event.id is null
      or latest_hold_event.actor_id is distinct from actor_id
      or latest_hold_event.legal_hold is distinct from p_legal_hold
      or latest_hold_event.reason is distinct from normalized_reason then
      raise exception using errcode = '23505', message = 'LIVE_RECORDING_DECISION_CONFLICT';
    end if;
    return current_recording.id;
  end if;

  insert into public.live_recording_legal_hold_events (
    recording_id, actor_id, legal_hold, reason, created_at
  ) values (
    current_recording.id, actor_id, p_legal_hold, normalized_reason, change_time
  );
  update public.live_recordings
  set legal_hold = p_legal_hold
  where id = current_recording.id;
  insert into public.audit_events (
    actor_id, action, subject_type, subject_id, metadata, created_at
  ) values (
    actor_id, 'live_recording.legal_hold_changed', 'live_recording', current_recording.id,
    jsonb_build_object('legal_hold', p_legal_hold, 'changed_fields', jsonb_build_array('legal_hold')),
    change_time
  );
  return current_recording.id;
end;
$$;

revoke all on function public.claim_livekit_webhook_event(text, text, text)
from public, anon, authenticated, service_role;
revoke all on function public.complete_livekit_webhook_event(text, uuid, uuid, text, text, numeric, bigint, timestamptz, timestamptz, text)
from public, anon, authenticated, service_role;
revoke all on function public.fail_livekit_webhook_event(text, uuid, text)
from public, anon, authenticated, service_role;
revoke all on function public.report_reporter_live_recording_reconciliation(uuid, uuid, text, text)
from public, anon, authenticated, service_role;
revoke all on function public.publish_live_recording(uuid, text, text, uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.reject_live_recording(uuid, text)
from public, anon, authenticated, service_role;
revoke all on function public.set_live_recording_legal_hold(uuid, boolean, text)
from public, anon, authenticated, service_role;

grant execute on function public.claim_livekit_webhook_event(text, text, text) to service_role;
grant execute on function public.complete_livekit_webhook_event(text, uuid, uuid, text, text, numeric, bigint, timestamptz, timestamptz, text) to service_role;
grant execute on function public.fail_livekit_webhook_event(text, uuid, text) to service_role;
grant execute on function public.report_reporter_live_recording_reconciliation(uuid, uuid, text, text) to service_role;
grant execute on function public.publish_live_recording(uuid, text, text, uuid, uuid) to authenticated;
grant execute on function public.reject_live_recording(uuid, text) to authenticated;
grant execute on function public.set_live_recording_legal_hold(uuid, boolean, text) to authenticated;
