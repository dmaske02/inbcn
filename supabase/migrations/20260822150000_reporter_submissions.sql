-- Reporter story submissions reuse canonical stories and media. Exact location
-- evidence and immutable submitted snapshots remain private base tables.

create table public.story_revisions (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories (id) on delete restrict,
  revision_number integer not null,
  submitted_by uuid not null references public.profiles (id) on delete restrict,
  snapshot jsonb not null,
  associated_media_ids uuid[] not null default '{}'::uuid[],
  submitted_at timestamptz not null default clock_timestamp(),
  review_outcome text not null default 'pending_review',
  reviewed_by uuid references public.profiles (id) on delete restrict,
  reviewed_at timestamptz,
  review_reason text,

  constraint story_revisions_story_revision_key
    unique (story_id, revision_number),
  constraint story_revisions_id_story_id_key unique (id, story_id),
  constraint story_revisions_revision_number_check check (revision_number > 0),
  constraint story_revisions_snapshot_object_check
    check (jsonb_typeof(snapshot) = 'object'),
  constraint story_revisions_media_ids_check check (
    array_position(associated_media_ids, null) is null
  ),
  constraint story_revisions_review_outcome_check check (
    review_outcome in (
      'pending_review',
      'changes_requested',
      'approved',
      'scheduled',
      'direct_published',
      'published',
      'rejected',
      'withdrawn'
    )
  ),
  constraint story_revisions_review_reason_length_check check (
    review_reason is null or length(btrim(review_reason)) between 1 and 2000
  ),
  constraint story_revisions_review_state_check check (
    (
      review_outcome = 'pending_review'
      and reviewed_by is null
      and reviewed_at is null
      and review_reason is null
    )
    or (
      review_outcome is distinct from 'pending_review'
      and reviewed_at is not null
      and (
        review_outcome not in ('changes_requested', 'rejected', 'withdrawn')
        or review_reason is not null
      )
    )
  )
);

create index story_revisions_story_submitted_idx
  on public.story_revisions (story_id, submitted_at desc, id desc);

create index story_revisions_submitter_idx
  on public.story_revisions (submitted_by, submitted_at desc, id desc);

create table public.story_locations (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories (id) on delete restrict,
  revision_id uuid not null,
  latitude numeric(8, 6) not null,
  longitude numeric(9, 6) not null,
  accuracy_meters numeric(10, 3) not null,
  captured_at timestamptz not null,
  received_at timestamptz not null default clock_timestamp(),
  locality text not null,
  retention_due_at timestamptz,
  legal_hold boolean not null default false,

  constraint story_locations_revision_key unique (revision_id),
  constraint story_locations_revision_story_fkey
    foreign key (revision_id, story_id)
    references public.story_revisions (id, story_id)
    on delete restrict,
  constraint story_locations_latitude_check check (latitude between -90 and 90),
  constraint story_locations_longitude_check check (longitude between -180 and 180),
  constraint story_locations_accuracy_check check (
    accuracy_meters > 0 and accuracy_meters <= 10000
  ),
  constraint story_locations_capture_check check (
    captured_at >= received_at - interval '30 minutes'
    and captured_at <= received_at
  ),
  constraint story_locations_locality_check check (
    length(btrim(locality)) between 1 and 200
  ),
  constraint story_locations_retention_check check (
    retention_due_at is null or retention_due_at >= received_at
  )
);

create index story_locations_story_idx
  on public.story_locations (story_id, received_at desc, id desc);

create index story_locations_retention_idx
  on public.story_locations (retention_due_at, id)
  where retention_due_at is not null and not legal_hold;

comment on table public.story_revisions is
  'Immutable reporter-submitted snapshots and one-way editorial outcomes over canonical stories/media.';
comment on table public.story_locations is
  'Private exact submission coordinates; never expose through public views, grants, or audit metadata.';
comment on column public.story_locations.retention_due_at is
  'Delete after this time unless legal_hold is true; set one year after publication, rejection, or withdrawal.';

create or replace function public.protect_story_revision_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'STORY_REVISION_IMMUTABLE';
  end if;

  if not (
      (
        old.review_outcome = 'pending_review'
        and new.review_outcome in (
          'changes_requested', 'approved', 'scheduled', 'published',
          'rejected', 'withdrawn'
        )
      )
      or (
        old.review_outcome = 'approved'
        and new.review_outcome in ('scheduled', 'published', 'rejected')
      )
      or (
        old.review_outcome = 'scheduled'
        and new.review_outcome in ('published', 'rejected')
      )
    )
    or new.reviewed_at is null
    or new.id is distinct from old.id
    or new.story_id is distinct from old.story_id
    or new.revision_number is distinct from old.revision_number
    or new.submitted_by is distinct from old.submitted_by
    or new.snapshot is distinct from old.snapshot
    or new.associated_media_ids is distinct from old.associated_media_ids
    or new.submitted_at is distinct from old.submitted_at then
    raise exception using errcode = '55000', message = 'STORY_REVISION_IMMUTABLE';
  end if;

  return new;
end;
$$;

create trigger protect_story_revision_immutability
before update or delete on public.story_revisions
for each row execute function public.protect_story_revision_immutability();

-- Direct authenticated reporter DML is draft-only. Security-definer transition
-- functions execute as their owner and therefore do not enter this guard.
create or replace function public.guard_reporter_story_draft_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if current_user is distinct from 'authenticated'
    or auth.jwt() -> 'app_metadata' ->> 'role' is distinct from 'reporter' then
    return new;
  end if;

  if actor_id is null
    or not exists (
      select 1
      from public.profiles
      join public.reporter_profiles
        on reporter_profiles.profile_id = profiles.id
      where profiles.id = actor_id
        and profiles.role = 'reporter'
        and profiles.is_active
        and reporter_profiles.public_status in ('active', 'grace')
        and reporter_profiles.membership_started_at <= clock_timestamp()
        and reporter_profiles.membership_grace_ends_at >= clock_timestamp()
        and reporter_profiles.access_sync_status = 'succeeded'
        and reporter_profiles.access_sync_desired_role = 'reporter'
        and auth.jwt() -> 'app_metadata' -> 'reporter_access_generation'
          = to_jsonb(reporter_profiles.access_sync_generation)
    ) then
    raise exception using errcode = '42501', message = 'REPORTER_STORY_FORBIDDEN';
  end if;

  if tg_op = 'INSERT' then
    if new.created_by is distinct from actor_id
      or new.story_type is distinct from 'citizen_report'
      or new.status is distinct from 'draft'
      or new.source_id is not null
      or new.approved_by is not null
      or new.submitted_at is not null
      or new.approved_at is not null
      or new.rejected_at is not null
      or new.rejection_reason is not null
      or new.scheduled_at is not null
      or new.published_at is not null
      or new.external_id is not null
      or new.external_url is not null
      or new.external_author is not null
      or new.external_published_at is not null
      or new.external_image_url is not null
      or new.external_image_width is not null
      or new.external_image_height is not null
      or new.canonical_url is not null
      or new.is_featured
      or new.is_breaking
      or new.is_sponsored then
      raise exception using errcode = '42501', message = 'REPORTER_STORY_DRAFT_ONLY';
    end if;
    new.created_at := clock_timestamp();
  else
    if old.created_by is distinct from actor_id
      or old.story_type is distinct from 'citizen_report'
      or old.status is distinct from 'draft'
      or new.id is distinct from old.id
      or new.translation_group_id is distinct from old.translation_group_id
      or new.created_by is distinct from old.created_by
      or new.story_type is distinct from old.story_type
      or new.status is distinct from old.status
      or new.source_id is distinct from old.source_id
      or new.approved_by is distinct from old.approved_by
      or new.submitted_at is distinct from old.submitted_at
      or new.approved_at is distinct from old.approved_at
      or new.rejected_at is distinct from old.rejected_at
      or new.rejection_reason is distinct from old.rejection_reason
      or new.scheduled_at is distinct from old.scheduled_at
      or new.published_at is distinct from old.published_at
      or new.external_id is distinct from old.external_id
      or new.external_url is distinct from old.external_url
      or new.external_author is distinct from old.external_author
      or new.external_published_at is distinct from old.external_published_at
      or new.external_image_url is distinct from old.external_image_url
      or new.external_image_width is distinct from old.external_image_width
      or new.external_image_height is distinct from old.external_image_height
      or new.canonical_url is distinct from old.canonical_url
      or new.is_featured is distinct from old.is_featured
      or new.is_breaking is distinct from old.is_breaking
      or new.is_sponsored is distinct from old.is_sponsored
      or new.created_at is distinct from old.created_at then
      raise exception using errcode = '42501', message = 'REPORTER_STORY_DRAFT_ONLY';
    end if;
  end if;

  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger guard_reporter_story_draft_write
before insert or update on public.stories
for each row execute function public.guard_reporter_story_draft_write();

-- Submitted reporter content and provenance stay byte-for-byte aligned with the
-- latest immutable snapshot through review and every terminal canonical state.
-- Lifecycle state and its timestamps may still advance through the CMS/RPC
-- workflows. A changes request first returns the story to draft, where the
-- reporter may edit before creating a new immutable revision.
create or replace function public.guard_reporter_story_provenance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.story_type = 'citizen_report'
    and old.status is distinct from 'draft'
    and (
      new.id is distinct from old.id
      or new.translation_group_id is distinct from old.translation_group_id
      or new.language_id is distinct from old.language_id
      or new.category_id is distinct from old.category_id
      or new.source_id is distinct from old.source_id
      or new.created_by is distinct from old.created_by
      or new.story_type is distinct from old.story_type
      or new.slug is distinct from old.slug
      or new.title is distinct from old.title
      or new.summary is distinct from old.summary
      or new.content is distinct from old.content
      or new.external_id is distinct from old.external_id
      or new.external_url is distinct from old.external_url
      or new.external_author is distinct from old.external_author
      or new.external_published_at is distinct from old.external_published_at
      or new.external_image_url is distinct from old.external_image_url
      or new.external_image_width is distinct from old.external_image_width
      or new.external_image_height is distinct from old.external_image_height
      or new.featured_media_id is distinct from old.featured_media_id
      or new.seo_title is distinct from old.seo_title
      or new.seo_description is distinct from old.seo_description
      or new.seo_keywords is distinct from old.seo_keywords
      or new.canonical_url is distinct from old.canonical_url
      or new.is_featured is distinct from old.is_featured
      or new.is_breaking is distinct from old.is_breaking
      or new.is_sponsored is distinct from old.is_sponsored
      or new.created_at is distinct from old.created_at
    ) then
    raise exception using
      errcode = '55000',
      message = 'REPORTER_STORY_PROVENANCE_IMMUTABLE';
  end if;

  return new;
end;
$$;

create trigger guard_reporter_story_provenance
before update on public.stories
for each row execute function public.guard_reporter_story_provenance();

-- Existing CMS review transitions advance the latest reporter revision through
-- an explicit monotonic outcome graph. Pre-publication archive is an editorial
-- rejection; post-terminal archive preserves the exact semantic outcome.
create or replace function public.synchronize_reporter_story_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_revision public.story_revisions%rowtype;
  transition_time timestamptz;
  target_outcome text;
  target_reason text;
begin
  if new.story_type is distinct from 'citizen_report'
    or new.status not in ('approved', 'scheduled', 'published', 'rejected', 'archived')
    or new.status = old.status then
    return new;
  end if;

  select * into current_revision
  from public.story_revisions
  where story_id = new.id
  order by revision_number desc
  limit 1
  for update;
  if not found then
    return new;
  end if;

  -- Reporter-owned terminal RPCs already set their precise outcome, retention,
  -- and audit record before changing the canonical story.
  if (new.status = 'published' and current_revision.review_outcome = 'direct_published')
    or (new.status = 'rejected' and current_revision.review_outcome = 'withdrawn') then
    return new;
  end if;

  transition_time := case
    when new.status = 'published' then coalesce(new.published_at, new.updated_at)
    when new.status = 'rejected' then coalesce(new.rejected_at, new.updated_at)
    else new.updated_at
  end;
  target_outcome := case
    when new.status = 'approved' then 'approved'
    when new.status = 'scheduled' then 'scheduled'
    when new.status = 'published' then 'published'
    when new.status = 'rejected' then 'rejected'
    when current_revision.review_outcome in (
      'direct_published', 'published', 'rejected', 'withdrawn'
    ) then current_revision.review_outcome
    else 'rejected'
  end;
  target_reason := case
    when new.status = 'rejected' then new.rejection_reason
    when new.status = 'archived'
      and current_revision.review_outcome in (
        'pending_review', 'approved', 'scheduled'
      ) then 'Archived before publication'
    else current_revision.review_reason
  end;

  if target_outcome is distinct from current_revision.review_outcome then
    update public.story_revisions
    set review_outcome = target_outcome,
        reviewed_by = coalesce(auth.uid(), new.approved_by, current_revision.reviewed_by),
        reviewed_at = transition_time,
        review_reason = target_reason
    where id = current_revision.id;
  end if;

  if new.status in ('published', 'rejected')
    or (
      new.status = 'archived'
      and current_revision.review_outcome in (
        'pending_review', 'approved', 'scheduled'
      )
    ) then
    update public.story_locations
    set retention_due_at = greatest(
      coalesce(retention_due_at, transition_time + interval '1 year'),
      transition_time + interval '1 year'
    )
    where story_id = new.id;
  end if;

  insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata)
  values (
    auth.uid(),
    'story.reporter_revision_transition',
    'story',
    new.id,
    jsonb_build_object(
      'revision_id', current_revision.id,
      'from_outcome', current_revision.review_outcome,
      'to_outcome', target_outcome,
      'story_status', new.status
    )
  );

  return new;
end;
$$;

create trigger synchronize_reporter_story_evidence
after update of status on public.stories
for each row execute function public.synchronize_reporter_story_evidence();

create or replace function public.submit_reporter_story(
  p_story_id uuid,
  p_event_occurred_at timestamptz,
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy_meters numeric,
  p_captured_at timestamptz,
  p_locality text
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
  current_profile public.profiles%rowtype;
  current_story public.stories%rowtype;
  submission_time timestamptz := clock_timestamp();
  media_ids uuid[];
  next_revision integer;
  revision_id uuid;
begin
  if actor_id is null or actor_role is distinct from 'reporter' then
    raise exception using errcode = '42501', message = 'REPORTER_STORY_FORBIDDEN';
  end if;

  select * into current_reporter
  from public.reporter_profiles
  where profile_id = actor_id
  for update;
  select * into current_profile
  from public.profiles
  where id = actor_id
  for update;
  if current_reporter.profile_id is null
    or current_profile.id is null
    or current_profile.role is distinct from 'reporter'
    or not current_profile.is_active
    or current_reporter.access_sync_status is distinct from 'succeeded'
    or current_reporter.access_sync_desired_role is distinct from 'reporter'
    or auth.jwt() -> 'app_metadata' -> 'reporter_access_generation'
      is distinct from to_jsonb(current_reporter.access_sync_generation)
    or current_reporter.public_status not in ('active', 'grace')
    or current_reporter.membership_started_at > submission_time
    or current_reporter.membership_grace_ends_at < submission_time then
    raise exception using errcode = '42501', message = 'REPORTER_STORY_FORBIDDEN';
  end if;

  select * into current_story
  from public.stories
  where id = p_story_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'REPORTER_STORY_NOT_FOUND';
  end if;
  if current_story.created_by is distinct from actor_id
    or current_story.story_type is distinct from 'citizen_report' then
    raise exception using errcode = '42501', message = 'REPORTER_STORY_FORBIDDEN';
  end if;
  if current_story.status is distinct from 'draft' then
    raise exception using errcode = 'P0001', message = 'REPORTER_STORY_INVALID_STATE';
  end if;
  if current_story.source_id is not null
    or current_story.approved_by is not null
    or current_story.approved_at is not null
    or current_story.rejected_at is not null
    or current_story.rejection_reason is not null
    or current_story.scheduled_at is not null
    or current_story.published_at is not null then
    raise exception using errcode = 'P0001', message = 'REPORTER_STORY_INVALID_STATE';
  end if;
  if p_event_occurred_at is null or p_event_occurred_at > submission_time + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'REPORTER_STORY_EVENT_TIME_INVALID';
  end if;
  if p_latitude is null or p_latitude not between -90 and 90
    or p_longitude is null or p_longitude not between -180 and 180
    or p_accuracy_meters is null or p_accuracy_meters <= 0 or p_accuracy_meters > 10000
    or p_captured_at is null
    or p_captured_at < submission_time - interval '30 minutes'
    or p_captured_at > submission_time
    or p_locality is null or length(btrim(p_locality)) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'REPORTER_LOCATION_INVALID';
  end if;
  if not exists (
    select 1
    from public.languages
    join public.categories
      on categories.language_id = languages.id
    where languages.id = current_story.language_id
      and languages.is_active
      and categories.id = current_story.category_id
      and categories.is_active
  ) then
    raise exception using errcode = '23514', message = 'REPORTER_STORY_CLASSIFICATION_INVALID';
  end if;

  perform 1
  from public.media
  where media.story_id = current_story.id
  order by media.id
  for share;
  if exists (
    select 1
    from public.media
    where media.story_id = current_story.id
      and (
        media.created_by is distinct from actor_id
        or media.deleted_at is not null
        or media.secure_url !~ '^https://'
        or length(btrim(media.cloudinary_public_id)) = 0
      )
  ) then
    raise exception using errcode = '23514', message = 'REPORTER_STORY_MEDIA_INVALID';
  end if;
  select coalesce(
    array_agg(media.id order by media.sort_order, media.created_at, media.id),
    '{}'::uuid[]
  ) into media_ids
  from public.media
  where media.story_id = current_story.id;
  if current_story.featured_media_id is not null
    and not current_story.featured_media_id = any(media_ids) then
    raise exception using errcode = '23514', message = 'REPORTER_STORY_MEDIA_INVALID';
  end if;

  select coalesce(max(revision_number), 0) + 1 into next_revision
  from public.story_revisions
  where story_id = current_story.id;
  revision_id := gen_random_uuid();
  insert into public.story_revisions (
    id,
    story_id,
    revision_number,
    submitted_by,
    snapshot,
    associated_media_ids,
    submitted_at,
    review_outcome
  ) values (
    revision_id,
    current_story.id,
    next_revision,
    actor_id,
    jsonb_build_object(
      'language_id', current_story.language_id,
      'category_id', current_story.category_id,
      'slug', current_story.slug,
      'title', current_story.title,
      'summary', current_story.summary,
      'content', current_story.content,
      'featured_media_id', current_story.featured_media_id,
      'seo_title', current_story.seo_title,
      'seo_description', current_story.seo_description,
      'seo_keywords', to_jsonb(current_story.seo_keywords),
      'event_occurred_at', p_event_occurred_at,
      'media_ids', to_jsonb(media_ids)
    ),
    media_ids,
    submission_time,
    'pending_review'
  );
  insert into public.story_locations (
    story_id,
    revision_id,
    latitude,
    longitude,
    accuracy_meters,
    captured_at,
    received_at,
    locality
  ) values (
    current_story.id,
    revision_id,
    p_latitude,
    p_longitude,
    p_accuracy_meters,
    p_captured_at,
    submission_time,
    btrim(p_locality)
  );
  update public.stories
  set status = 'pending_review',
      submitted_at = submission_time,
      updated_at = submission_time
  where id = current_story.id;
  insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata)
  values (
    actor_id,
    'story.submitted',
    'story',
    current_story.id,
    jsonb_build_object('revision_id', revision_id, 'revision_number', next_revision)
  );

  return jsonb_build_object(
    'story_id', current_story.id,
    'story_status', 'pending_review',
    'revision_id', revision_id,
    'revision_number', next_revision,
    'revision_outcome', 'pending_review'
  );
end;
$$;

create or replace function public.direct_publish_reporter_story(
  p_story_id uuid,
  p_event_occurred_at timestamptz,
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy_meters numeric,
  p_captured_at timestamptz,
  p_locality text
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
  current_profile public.profiles%rowtype;
  current_story public.stories%rowtype;
  publication_time timestamptz := clock_timestamp();
  media_ids uuid[];
  next_revision integer;
  revision_id uuid;
begin
  if actor_id is null or actor_role is distinct from 'reporter' then
    raise exception using errcode = '42501', message = 'REPORTER_DIRECT_PUBLISH_FORBIDDEN';
  end if;

  select * into current_reporter
  from public.reporter_profiles
  where profile_id = actor_id
  for update;
  select * into current_profile
  from public.profiles
  where id = actor_id
  for update;
  if current_reporter.profile_id is null
    or current_profile.id is null
    or current_profile.role is distinct from 'reporter'
    or not current_profile.is_active
    or current_reporter.access_sync_status is distinct from 'succeeded'
    or current_reporter.access_sync_desired_role is distinct from 'reporter'
    or auth.jwt() -> 'app_metadata' -> 'reporter_access_generation'
      is distinct from to_jsonb(current_reporter.access_sync_generation)
    or current_reporter.public_status is distinct from 'active'
    or current_reporter.membership_started_at > publication_time
    or current_reporter.membership_expires_at < publication_time
    or not current_reporter.can_publish_directly then
    raise exception using errcode = '42501', message = 'REPORTER_DIRECT_PUBLISH_FORBIDDEN';
  end if;

  select * into current_story
  from public.stories
  where id = p_story_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'REPORTER_STORY_NOT_FOUND';
  end if;
  if current_story.created_by is distinct from actor_id
    or current_story.story_type is distinct from 'citizen_report' then
    raise exception using errcode = '42501', message = 'REPORTER_DIRECT_PUBLISH_FORBIDDEN';
  end if;
  if current_story.status is distinct from 'draft'
    or current_story.source_id is not null
    or current_story.approved_by is not null
    or current_story.approved_at is not null
    or current_story.rejected_at is not null
    or current_story.rejection_reason is not null
    or current_story.scheduled_at is not null
    or current_story.published_at is not null then
    raise exception using errcode = 'P0001', message = 'REPORTER_STORY_INVALID_STATE';
  end if;
  if p_event_occurred_at is null or p_event_occurred_at > publication_time + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'REPORTER_STORY_EVENT_TIME_INVALID';
  end if;
  if p_latitude is null or p_latitude not between -90 and 90
    or p_longitude is null or p_longitude not between -180 and 180
    or p_accuracy_meters is null or p_accuracy_meters <= 0 or p_accuracy_meters > 10000
    or p_captured_at is null
    or p_captured_at < publication_time - interval '30 minutes'
    or p_captured_at > publication_time
    or p_locality is null or length(btrim(p_locality)) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'REPORTER_LOCATION_INVALID';
  end if;
  if not exists (
    select 1
    from public.languages
    join public.categories
      on categories.language_id = languages.id
    where languages.id = current_story.language_id
      and languages.is_active
      and categories.id = current_story.category_id
      and categories.is_active
  ) then
    raise exception using errcode = '23514', message = 'REPORTER_STORY_CLASSIFICATION_INVALID';
  end if;

  perform 1
  from public.media
  where media.story_id = current_story.id
  order by media.id
  for share;
  if exists (
    select 1
    from public.media
    where media.story_id = current_story.id
      and (
        media.created_by is distinct from actor_id
        or media.deleted_at is not null
        or media.secure_url !~ '^https://'
        or length(btrim(media.cloudinary_public_id)) = 0
      )
  ) then
    raise exception using errcode = '23514', message = 'REPORTER_STORY_MEDIA_INVALID';
  end if;
  select coalesce(
    array_agg(media.id order by media.sort_order, media.created_at, media.id),
    '{}'::uuid[]
  ) into media_ids
  from public.media
  where media.story_id = current_story.id;
  if current_story.featured_media_id is not null
    and not current_story.featured_media_id = any(media_ids) then
    raise exception using errcode = '23514', message = 'REPORTER_STORY_MEDIA_INVALID';
  end if;

  select coalesce(max(revision_number), 0) + 1 into next_revision
  from public.story_revisions
  where story_id = current_story.id;
  revision_id := gen_random_uuid();
  insert into public.story_revisions (
    id,
    story_id,
    revision_number,
    submitted_by,
    snapshot,
    associated_media_ids,
    submitted_at,
    review_outcome,
    reviewed_by,
    reviewed_at
  ) values (
    revision_id,
    current_story.id,
    next_revision,
    actor_id,
    jsonb_build_object(
      'language_id', current_story.language_id,
      'category_id', current_story.category_id,
      'slug', current_story.slug,
      'title', current_story.title,
      'summary', current_story.summary,
      'content', current_story.content,
      'featured_media_id', current_story.featured_media_id,
      'seo_title', current_story.seo_title,
      'seo_description', current_story.seo_description,
      'seo_keywords', to_jsonb(current_story.seo_keywords),
      'event_occurred_at', p_event_occurred_at,
      'media_ids', to_jsonb(media_ids)
    ),
    media_ids,
    publication_time,
    'direct_published',
    actor_id,
    publication_time
  );
  insert into public.story_locations (
    story_id,
    revision_id,
    latitude,
    longitude,
    accuracy_meters,
    captured_at,
    received_at,
    locality,
    retention_due_at
  ) values (
    current_story.id,
    revision_id,
    p_latitude,
    p_longitude,
    p_accuracy_meters,
    p_captured_at,
    publication_time,
    btrim(p_locality),
    publication_time + interval '1 year'
  );
  update public.stories
  set status = 'published',
      submitted_at = publication_time,
      approved_by = actor_id,
      approved_at = publication_time,
      published_at = publication_time,
      updated_at = publication_time
  where id = current_story.id;
  insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata)
  values (
    actor_id,
    'story.direct_published',
    'story',
    current_story.id,
    jsonb_build_object('revision_id', revision_id, 'revision_number', next_revision)
  );

  return jsonb_build_object(
    'story_id', current_story.id,
    'story_status', 'published',
    'revision_id', revision_id,
    'revision_number', next_revision,
    'revision_outcome', 'direct_published'
  );
end;
$$;

create or replace function public.withdraw_reporter_story(p_story_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  current_reporter public.reporter_profiles%rowtype;
  current_profile public.profiles%rowtype;
  current_story public.stories%rowtype;
  current_revision public.story_revisions%rowtype;
  withdrawal_time timestamptz := clock_timestamp();
  media_ids uuid[];
  next_revision integer;
  revision_id uuid;
begin
  if actor_id is null or actor_role is distinct from 'reporter' then
    raise exception using errcode = '42501', message = 'REPORTER_STORY_FORBIDDEN';
  end if;
  select * into current_reporter
  from public.reporter_profiles
  where profile_id = actor_id
  for update;
  select * into current_profile
  from public.profiles
  where id = actor_id
  for update;
  if current_reporter.profile_id is null
    or current_profile.id is null
    or current_profile.role is distinct from 'reporter'
    or not current_profile.is_active
    or current_reporter.access_sync_status is distinct from 'succeeded'
    or current_reporter.access_sync_desired_role is distinct from 'reporter'
    or auth.jwt() -> 'app_metadata' -> 'reporter_access_generation'
      is distinct from to_jsonb(current_reporter.access_sync_generation)
    or current_reporter.public_status not in ('active', 'grace')
    or current_reporter.membership_started_at > withdrawal_time
    or current_reporter.membership_grace_ends_at < withdrawal_time then
    raise exception using errcode = '42501', message = 'REPORTER_STORY_FORBIDDEN';
  end if;

  select * into current_story
  from public.stories
  where id = p_story_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'REPORTER_STORY_NOT_FOUND';
  end if;
  if current_story.created_by is distinct from actor_id
    or current_story.story_type is distinct from 'citizen_report' then
    raise exception using errcode = '42501', message = 'REPORTER_STORY_FORBIDDEN';
  end if;
  if current_story.status not in ('draft', 'pending_review') then
    raise exception using errcode = 'P0001', message = 'REPORTER_STORY_EDITORIAL_CONTROL';
  end if;

  if current_story.status = 'pending_review' then
    select * into current_revision
    from public.story_revisions
    where story_id = current_story.id
    order by revision_number desc
    limit 1
    for update;
    if not found or current_revision.review_outcome is distinct from 'pending_review' then
      raise exception using errcode = 'P0001', message = 'REPORTER_STORY_REVISION_CONFLICT';
    end if;
    update public.story_revisions
    set review_outcome = 'withdrawn',
        reviewed_by = actor_id,
        reviewed_at = withdrawal_time,
        review_reason = 'Reporter withdrawal'
    where id = current_revision.id;
    revision_id := current_revision.id;
    next_revision := current_revision.revision_number;
  else
    perform 1
    from public.media
    where media.story_id = current_story.id
    order by media.id
    for share;
    if exists (
      select 1
      from public.media
      where media.story_id = current_story.id
        and (
          media.created_by is distinct from actor_id
          or media.deleted_at is not null
          or media.secure_url !~ '^https://'
          or length(btrim(media.cloudinary_public_id)) = 0
        )
    ) then
      raise exception using errcode = '23514', message = 'REPORTER_STORY_MEDIA_INVALID';
    end if;
    select coalesce(
      array_agg(media.id order by media.sort_order, media.created_at, media.id),
      '{}'::uuid[]
    ) into media_ids
    from public.media
    where media.story_id = current_story.id;
    select coalesce(max(revision_number), 0) + 1 into next_revision
    from public.story_revisions
    where story_id = current_story.id;
    revision_id := gen_random_uuid();
    insert into public.story_revisions (
      id,
      story_id,
      revision_number,
      submitted_by,
      snapshot,
      associated_media_ids,
      submitted_at,
      review_outcome,
      reviewed_by,
      reviewed_at,
      review_reason
    ) values (
      revision_id,
      current_story.id,
      next_revision,
      actor_id,
      jsonb_build_object(
        'language_id', current_story.language_id,
        'category_id', current_story.category_id,
        'slug', current_story.slug,
        'title', current_story.title,
        'summary', current_story.summary,
        'content', current_story.content,
        'featured_media_id', current_story.featured_media_id,
        'seo_title', current_story.seo_title,
        'seo_description', current_story.seo_description,
        'seo_keywords', to_jsonb(current_story.seo_keywords),
        'media_ids', to_jsonb(media_ids)
      ),
      media_ids,
      withdrawal_time,
      'withdrawn',
      actor_id,
      withdrawal_time,
      'Reporter withdrawal'
    );
  end if;

  update public.story_locations
  set retention_due_at = greatest(
    coalesce(retention_due_at, withdrawal_time + interval '1 year'),
    withdrawal_time + interval '1 year'
  )
  where story_id = current_story.id;
  update public.stories
  set status = 'rejected',
      rejected_at = withdrawal_time,
      rejection_reason = 'Withdrawn by reporter',
      updated_at = withdrawal_time
  where id = current_story.id;
  insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata)
  values (
    actor_id,
    'story.withdrawn',
    'story',
    current_story.id,
    jsonb_build_object('revision_id', revision_id, 'revision_outcome', 'withdrawn')
  );

  return jsonb_build_object(
    'story_id', current_story.id,
    'story_status', 'rejected',
    'revision_id', revision_id,
    'revision_number', next_revision,
    'revision_outcome', 'withdrawn',
    'retention_due_at', withdrawal_time + interval '1 year'
  );
end;
$$;

create or replace function public.request_reporter_changes(
  p_story_id uuid,
  p_revision_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  current_profile public.profiles%rowtype;
  current_story public.stories%rowtype;
  current_revision public.story_revisions%rowtype;
  review_time timestamptz := clock_timestamp();
begin
  if actor_id is null
    or actor_role not in ('editor', 'admin') then
    raise exception using errcode = '42501', message = 'REPORTER_CHANGES_FORBIDDEN';
  end if;
  select * into current_profile
  from public.profiles
  where profiles.id = actor_id
    and profiles.role = actor_role::public.profile_role
    and profiles.is_active
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'REPORTER_CHANGES_FORBIDDEN';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0
    or length(btrim(p_reason)) > 2000 then
    raise exception using errcode = '22023', message = 'REPORTER_CHANGES_REASON_REQUIRED';
  end if;

  select * into current_story
  from public.stories
  where id = p_story_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'REPORTER_STORY_NOT_FOUND';
  end if;
  if current_story.story_type is distinct from 'citizen_report'
    or current_story.created_by is null
    or current_story.status is distinct from 'pending_review' then
    raise exception using errcode = 'P0001', message = 'REPORTER_STORY_INVALID_STATE';
  end if;
  select * into current_revision
  from public.story_revisions
  where id = p_revision_id
    and story_id = current_story.id
  for update;
  if not found
    or current_revision.submitted_by is distinct from current_story.created_by
    or current_revision.review_outcome is distinct from 'pending_review'
    or exists (
      select 1
      from public.story_revisions
      where story_id = current_story.id
        and revision_number > current_revision.revision_number
    ) then
    raise exception using errcode = '40001', message = 'REPORTER_STORY_REVISION_CONFLICT';
  end if;

  update public.story_revisions
  set review_outcome = 'changes_requested',
      reviewed_by = actor_id,
      reviewed_at = review_time,
      review_reason = btrim(p_reason)
  where id = current_revision.id;
  update public.stories
  set status = 'draft',
      submitted_at = null,
      updated_at = review_time
  where id = current_story.id;
  insert into public.reporter_notifications (
    profile_id,
    notification_type,
    message,
    delivery_channel,
    delivery_status,
    created_at
  ) values (
    current_story.created_by,
    'story_changes_requested',
    'Changes requested: ' || btrim(p_reason),
    'in_app',
    'not_applicable',
    review_time
  );
  insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata)
  values (
    actor_id,
    'story.changes_requested',
    'story',
    current_story.id,
    jsonb_build_object('revision_id', current_revision.id)
  );

  return jsonb_build_object(
    'story_id', current_story.id,
    'story_status', 'draft',
    'revision_id', current_revision.id,
    'revision_number', current_revision.revision_number,
    'revision_outcome', 'changes_requested',
    'review_reason', btrim(p_reason)
  );
end;
$$;

alter table public.story_revisions enable row level security;
alter table public.story_locations enable row level security;

revoke all on table public.story_revisions, public.story_locations
from public, anon, authenticated, service_role;

grant select on table public.story_revisions to authenticated;
grant select on table public.story_locations to authenticated;
grant select on table public.media to authenticated;
grant select on table public.story_revisions to service_role;
grant select on table public.story_locations to service_role;
grant update (retention_due_at, legal_hold)
on table public.story_locations to service_role;

create policy "Reporters can read their own stories"
on public.stories
for select
to authenticated
using (
  created_by = (select auth.uid())
  and story_type = 'citizen_report'
  and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'reporter'
  and exists (
    select 1
    from public.profiles
    join public.reporter_profiles
      on reporter_profiles.profile_id = profiles.id
    where profiles.id = (select auth.uid())
      and profiles.role = 'reporter'
      and profiles.is_active
      and reporter_profiles.public_status in ('active', 'grace')
      and reporter_profiles.membership_started_at <= clock_timestamp()
      and reporter_profiles.membership_grace_ends_at >= clock_timestamp()
      and reporter_profiles.access_sync_status = 'succeeded'
      and reporter_profiles.access_sync_desired_role = 'reporter'
      and (select auth.jwt() -> 'app_metadata' -> 'reporter_access_generation')
        = to_jsonb(reporter_profiles.access_sync_generation)
  )
);

create policy "Reporters can create their own story drafts"
on public.stories
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and story_type = 'citizen_report'
  and status = 'draft'
  and source_id is null
  and approved_by is null
  and submitted_at is null
  and approved_at is null
  and rejected_at is null
  and rejection_reason is null
  and scheduled_at is null
  and published_at is null
  and external_id is null
  and external_url is null
  and external_author is null
  and external_published_at is null
  and external_image_url is null
  and canonical_url is null
  and not is_featured
  and not is_breaking
  and not is_sponsored
  and (
    featured_media_id is null
    or exists (
      select 1
      from public.media
      where media.id = stories.featured_media_id
        and media.story_id = stories.id
        and media.created_by = (select auth.uid())
        and media.deleted_at is null
    )
  )
  and exists (
    select 1
    from public.profiles
    join public.reporter_profiles
      on reporter_profiles.profile_id = profiles.id
    where profiles.id = (select auth.uid())
      and profiles.role = 'reporter'
      and profiles.is_active
      and reporter_profiles.public_status in ('active', 'grace')
      and reporter_profiles.membership_started_at <= clock_timestamp()
      and reporter_profiles.membership_grace_ends_at >= clock_timestamp()
      and reporter_profiles.access_sync_status = 'succeeded'
      and reporter_profiles.access_sync_desired_role = 'reporter'
      and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'reporter'
      and (select auth.jwt() -> 'app_metadata' -> 'reporter_access_generation')
        = to_jsonb(reporter_profiles.access_sync_generation)
  )
);

create policy "Reporters can update their own story drafts"
on public.stories
for update
to authenticated
using (
  created_by = (select auth.uid())
  and story_type = 'citizen_report'
  and status = 'draft'
  and exists (
    select 1
    from public.profiles
    join public.reporter_profiles
      on reporter_profiles.profile_id = profiles.id
    where profiles.id = (select auth.uid())
      and profiles.role = 'reporter'
      and profiles.is_active
      and reporter_profiles.public_status in ('active', 'grace')
      and reporter_profiles.membership_started_at <= clock_timestamp()
      and reporter_profiles.membership_grace_ends_at >= clock_timestamp()
      and reporter_profiles.access_sync_status = 'succeeded'
      and reporter_profiles.access_sync_desired_role = 'reporter'
      and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'reporter'
      and (select auth.jwt() -> 'app_metadata' -> 'reporter_access_generation')
        = to_jsonb(reporter_profiles.access_sync_generation)
  )
)
with check (
  created_by = (select auth.uid())
  and story_type = 'citizen_report'
  and status = 'draft'
  and source_id is null
  and approved_by is null
  and submitted_at is null
  and approved_at is null
  and rejected_at is null
  and rejection_reason is null
  and scheduled_at is null
  and published_at is null
  and external_id is null
  and external_url is null
  and external_author is null
  and external_published_at is null
  and external_image_url is null
  and canonical_url is null
  and not is_featured
  and not is_breaking
  and not is_sponsored
  and (
    featured_media_id is null
    or exists (
      select 1
      from public.media
      where media.id = stories.featured_media_id
        and media.story_id = stories.id
        and media.created_by = (select auth.uid())
        and media.deleted_at is null
    )
  )
);

create policy "Reporters can read their own canonical media"
on public.media
for select
to authenticated
using (
  (select auth.uid()) is not null
  and media.created_by = (select auth.uid())
  and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'reporter'
  and exists (
    select 1
    from public.profiles
    join public.reporter_profiles
      on reporter_profiles.profile_id = profiles.id
    where profiles.id = (select auth.uid())
      and profiles.role = 'reporter'
      and profiles.is_active
      and reporter_profiles.public_status in ('active', 'grace')
      and reporter_profiles.membership_started_at <= clock_timestamp()
      and reporter_profiles.membership_grace_ends_at >= clock_timestamp()
      and reporter_profiles.access_sync_status = 'succeeded'
      and reporter_profiles.access_sync_desired_role = 'reporter'
      and (select auth.jwt() -> 'app_metadata' -> 'reporter_access_generation')
        = to_jsonb(reporter_profiles.access_sync_generation)
  )
);

create policy "Reporters can read their own story revisions"
on public.story_revisions
for select
to authenticated
using (
  submitted_by = (select auth.uid())
  and exists (
    select 1
    from public.profiles
    join public.reporter_profiles
      on reporter_profiles.profile_id = profiles.id
    where profiles.id = (select auth.uid())
      and profiles.role = 'reporter'
      and profiles.is_active
      and reporter_profiles.public_status in ('active', 'grace')
      and reporter_profiles.membership_started_at <= clock_timestamp()
      and reporter_profiles.membership_grace_ends_at >= clock_timestamp()
      and reporter_profiles.access_sync_status = 'succeeded'
      and reporter_profiles.access_sync_desired_role = 'reporter'
      and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'reporter'
      and (select auth.jwt() -> 'app_metadata' -> 'reporter_access_generation')
        = to_jsonb(reporter_profiles.access_sync_generation)
  )
);

create policy "Staff can read reporter story revisions"
on public.story_revisions
for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') in ('editor', 'admin')
  and exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role::text = (select auth.jwt() -> 'app_metadata' ->> 'role')
      and profiles.role in ('editor', 'admin')
      and profiles.is_active
  )
);

create policy "Reporters can read their own story locations"
on public.story_locations
for select
to authenticated
using (
  exists (
    select 1
    from public.story_revisions
    where story_revisions.id = story_locations.revision_id
      and story_revisions.story_id = story_locations.story_id
      and story_revisions.submitted_by = (select auth.uid())
  )
  and exists (
    select 1
    from public.profiles
    join public.reporter_profiles
      on reporter_profiles.profile_id = profiles.id
    where profiles.id = (select auth.uid())
      and profiles.role = 'reporter'
      and profiles.is_active
      and reporter_profiles.public_status in ('active', 'grace')
      and reporter_profiles.membership_started_at <= clock_timestamp()
      and reporter_profiles.membership_grace_ends_at >= clock_timestamp()
      and reporter_profiles.access_sync_status = 'succeeded'
      and reporter_profiles.access_sync_desired_role = 'reporter'
      and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'reporter'
      and (select auth.jwt() -> 'app_metadata' -> 'reporter_access_generation')
        = to_jsonb(reporter_profiles.access_sync_generation)
  )
);

create policy "Editors and admins can read reporter story locations"
on public.story_locations
for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') in ('editor', 'admin')
  and exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role::text = (select auth.jwt() -> 'app_metadata' ->> 'role')
      and profiles.role in ('editor', 'admin')
      and profiles.is_active
  )
);

revoke all on function public.protect_story_revision_immutability()
from public, anon, authenticated, service_role;
revoke all on function public.guard_reporter_story_draft_write()
from public, anon, authenticated, service_role;
revoke all on function public.guard_reporter_story_provenance()
from public, anon, authenticated, service_role;
revoke all on function public.synchronize_reporter_story_evidence()
from public, anon, authenticated, service_role;
revoke all on function public.submit_reporter_story(uuid, timestamptz, numeric, numeric, numeric, timestamptz, text)
from public, anon, authenticated, service_role;
revoke all on function public.direct_publish_reporter_story(uuid, timestamptz, numeric, numeric, numeric, timestamptz, text)
from public, anon, authenticated, service_role;
revoke all on function public.withdraw_reporter_story(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.request_reporter_changes(uuid, uuid, text)
from public, anon, authenticated, service_role;

grant execute on function public.submit_reporter_story(uuid, timestamptz, numeric, numeric, numeric, timestamptz, text)
to authenticated;
grant execute on function public.direct_publish_reporter_story(uuid, timestamptz, numeric, numeric, numeric, timestamptz, text)
to authenticated;
grant execute on function public.withdraw_reporter_story(uuid)
to authenticated;
grant execute on function public.request_reporter_changes(uuid, uuid, text)
to authenticated;
