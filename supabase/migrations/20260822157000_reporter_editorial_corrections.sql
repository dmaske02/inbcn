-- Explicit DB-owned canonical corrections for true reporter stories.
-- Immutable reporter submissions remain untouched; the private state records
-- only the corrected canonical fingerprint needed by later guarded transitions.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

-- Rejected/withdrawn stories may be archived without inventing approval
-- provenance. Published/approved lifecycle rows still require approval time.
alter table public.stories
  drop constraint stories_review_status_check,
  add constraint stories_review_status_check check (
    status not in ('approved', 'scheduled', 'published', 'archived')
    or approved_at is not null
    or (status = 'archived' and rejected_at is not null and rejection_reason is not null)
  );

create table private.reporter_story_correction_states (
  story_id uuid primary key references public.stories (id) on delete cascade,
  revision_id uuid not null,
  snapshot jsonb not null,
  media_ids uuid[] not null,
  updated_by uuid not null references public.profiles (id) on delete restrict,
  updated_at timestamptz not null,
  constraint reporter_story_correction_revision_fkey
    foreign key (revision_id, story_id)
    references public.story_revisions (id, story_id)
    on delete restrict,
  constraint reporter_story_correction_snapshot_check
    check (jsonb_typeof(snapshot) = 'object')
);

revoke all on table private.reporter_story_correction_states
from public, anon, authenticated, service_role;

create table private.reporter_story_corrections (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories (id) on delete restrict,
  revision_id uuid not null,
  actor_id uuid not null references public.profiles (id) on delete restrict,
  reason text not null check (length(btrim(reason)) between 1 and 2000),
  changed_fields text[] not null check (
    cardinality(changed_fields) between 1 and 10
    and changed_fields <@ array[
      'category_id', 'content', 'featured_media_id', 'language_id', 'seo_description',
      'seo_keywords', 'seo_title', 'slug', 'summary', 'title'
    ]::text[]
  ),
  created_at timestamptz not null,
  constraint reporter_story_corrections_revision_fkey
    foreign key (revision_id, story_id)
    references public.story_revisions (id, story_id)
    on delete restrict
);

revoke all on table private.reporter_story_corrections
from public, anon, authenticated, service_role;

create function private.reject_reporter_story_correction_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'REPORTER_CORRECTION_HISTORY_IMMUTABLE';
end;
$$;

revoke all on function private.reject_reporter_story_correction_mutation()
from public, anon, authenticated, service_role;

create trigger reporter_story_corrections_are_append_only
before update or delete on private.reporter_story_corrections
for each row execute function private.reject_reporter_story_correction_mutation();

create or replace function public.guard_reporter_story_provenance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  current_revision public.story_revisions%rowtype;
  canonical_media_ids uuid[];
  expected_snapshot jsonb;
  transition_time timestamptz := clock_timestamp();
  provenance_changed boolean;
  content_changed boolean;
  lifecycle_changed boolean;
  staff_actor boolean;
  correction_matches boolean := false;
  old_reporter_story boolean := public.is_reporter_story(old);
  new_reporter_story boolean := public.is_reporter_story(new);
begin
  if not old_reporter_story and not new_reporter_story then
    return new;
  end if;

  provenance_changed :=
    new.id is distinct from old.id
    or new.translation_group_id is distinct from old.translation_group_id
    or new.source_id is distinct from old.source_id
    or new.created_by is distinct from old.created_by
    or new.story_type is distinct from old.story_type
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
    or new.created_at is distinct from old.created_at;
  content_changed :=
    new.language_id is distinct from old.language_id
    or new.category_id is distinct from old.category_id
    or new.slug is distinct from old.slug
    or new.title is distinct from old.title
    or new.summary is distinct from old.summary
    or new.content is distinct from old.content
    or new.featured_media_id is distinct from old.featured_media_id
    or new.seo_title is distinct from old.seo_title
    or new.seo_description is distinct from old.seo_description
    or new.seo_keywords is distinct from old.seo_keywords;
  lifecycle_changed :=
    new.submitted_at is distinct from old.submitted_at
    or new.approved_by is distinct from old.approved_by
    or new.approved_at is distinct from old.approved_at
    or new.rejected_at is distinct from old.rejected_at
    or new.rejection_reason is distinct from old.rejection_reason
    or new.scheduled_at is distinct from old.scheduled_at
    or new.published_at is distinct from old.published_at;

  if provenance_changed then
    raise exception using
      errcode = '55000',
      message = 'REPORTER_STORY_PROVENANCE_IMMUTABLE';
  end if;

  if old.status = 'draft' and new.status = 'draft' then
    if lifecycle_changed then
      raise exception using
        errcode = '55000',
        message = 'REPORTER_STORY_LIFECYCLE_IMMUTABLE';
    end if;
    new.updated_at := transition_time;
    return new;
  end if;

  if new.status = old.status and lifecycle_changed then
    raise exception using
      errcode = '55000',
      message = 'REPORTER_STORY_LIFECYCLE_IMMUTABLE';
  end if;

  select exists (
    select 1
    from public.profiles
    where profiles.id = actor_id
      and profiles.role::text = actor_role
      and profiles.role in ('editor', 'admin')
      and profiles.is_active
  ) into staff_actor;

  select * into current_revision
  from public.story_revisions
  where story_id = new.id
  order by revision_number desc
  limit 1
  for update;
  if not found then
    raise exception using
      errcode = '55000',
      message = 'REPORTER_STORY_EVIDENCE_REQUIRED';
  end if;

  perform 1
  from public.media
  where media.story_id = new.id
  order by media.id
  for share;
  select coalesce(
    array_agg(media.id order by media.sort_order, media.created_at, media.id),
    '{}'::uuid[]
  ) into canonical_media_ids
  from public.media
  where media.story_id = new.id;
  expected_snapshot := jsonb_build_object(
    'language_id', new.language_id,
    'category_id', new.category_id,
    'slug', new.slug,
    'title', new.title,
    'summary', new.summary,
    'content', new.content,
    'featured_media_id', new.featured_media_id,
    'seo_title', new.seo_title,
    'seo_description', new.seo_description,
    'seo_keywords', to_jsonb(new.seo_keywords),
    'media_ids', to_jsonb(canonical_media_ids)
  );
  select exists (
    select 1
    from private.reporter_story_correction_states
    where reporter_story_correction_states.story_id = new.id
      and reporter_story_correction_states.revision_id = current_revision.id
      and reporter_story_correction_states.snapshot = expected_snapshot
      and reporter_story_correction_states.media_ids = canonical_media_ids
  ) into correction_matches;

  if content_changed and (
    new.status is distinct from old.status
    or lifecycle_changed
    or not staff_actor
    or not correction_matches
  ) then
    raise exception using
      errcode = '55000',
      message = 'REPORTER_STORY_PROVENANCE_IMMUTABLE';
  end if;

  if (
    current_revision.submitted_by is distinct from new.created_by
    or current_revision.associated_media_ids is distinct from canonical_media_ids
    or (current_revision.snapshot - 'event_occurred_at') is distinct from expected_snapshot
    or exists (
      select 1
      from public.media
      where media.story_id = new.id
        and media.created_by is distinct from current_revision.submitted_by
    )
  ) and not correction_matches then
    raise exception using
      errcode = '55000',
      message = 'REPORTER_STORY_EVIDENCE_MISMATCH';
  end if;

  if new.status = old.status then
    if (new.status = 'pending_review'
        and current_revision.review_outcome is distinct from 'pending_review')
      or (new.status = 'approved'
        and current_revision.review_outcome is distinct from 'approved')
      or (new.status = 'scheduled'
        and current_revision.review_outcome is distinct from 'scheduled')
      or (new.status = 'published'
        and current_revision.review_outcome not in ('direct_published', 'published'))
      or (new.status = 'rejected'
        and current_revision.review_outcome not in ('rejected', 'withdrawn'))
      or (new.status = 'archived'
        and current_revision.review_outcome not in (
          'direct_published', 'published', 'rejected', 'withdrawn'
        )) then
      raise exception using
        errcode = '55000',
        message = 'REPORTER_STORY_EVIDENCE_MISMATCH';
    end if;
    new.updated_at := transition_time;
    return new;
  end if;

  if old.status = 'archived'
    or (
      old.status in ('rejected', 'published')
      and new.status is distinct from 'archived'
    ) then
    raise exception using
      errcode = '55000',
      message = 'REPORTER_STORY_TRANSITION_FORBIDDEN';
  end if;

  if old.status = 'draft' and new.status = 'pending_review' then
    if current_revision.review_outcome is distinct from 'pending_review'
      or current_revision.submitted_by is distinct from actor_id
      or new.submitted_at is distinct from current_revision.submitted_at
      or new.approved_by is distinct from old.approved_by
      or new.approved_at is distinct from old.approved_at
      or new.rejected_at is distinct from old.rejected_at
      or new.rejection_reason is distinct from old.rejection_reason
      or new.scheduled_at is distinct from old.scheduled_at
      or new.published_at is distinct from old.published_at then
      raise exception using errcode = '55000', message = 'REPORTER_STORY_EVIDENCE_MISMATCH';
    end if;
  elsif old.status = 'draft' and new.status = 'published' then
    if current_revision.review_outcome is distinct from 'direct_published'
      or current_revision.submitted_by is distinct from actor_id
      or current_revision.reviewed_by is distinct from actor_id
      or new.submitted_at is distinct from current_revision.submitted_at
      or new.approved_by is distinct from current_revision.reviewed_by
      or new.approved_at is distinct from current_revision.reviewed_at
      or new.published_at is distinct from current_revision.reviewed_at
      or new.rejected_at is distinct from old.rejected_at
      or new.rejection_reason is distinct from old.rejection_reason
      or new.scheduled_at is distinct from old.scheduled_at then
      raise exception using errcode = '55000', message = 'REPORTER_STORY_EVIDENCE_MISMATCH';
    end if;
  elsif old.status = 'draft' and new.status = 'rejected' then
    if current_revision.review_outcome is distinct from 'withdrawn'
      or current_revision.submitted_by is distinct from actor_id
      or current_revision.reviewed_by is distinct from actor_id
      or new.submitted_at is distinct from old.submitted_at
      or new.approved_by is distinct from old.approved_by
      or new.approved_at is distinct from old.approved_at
      or new.rejected_at is distinct from current_revision.reviewed_at
      or new.rejection_reason is distinct from 'Withdrawn by reporter'
      or new.scheduled_at is distinct from old.scheduled_at
      or new.published_at is distinct from old.published_at then
      raise exception using errcode = '55000', message = 'REPORTER_STORY_EVIDENCE_MISMATCH';
    end if;
  elsif old.status = 'pending_review' and new.status = 'draft' then
    if current_revision.review_outcome is distinct from 'changes_requested'
      or current_revision.reviewed_by is distinct from actor_id
      or new.submitted_at is not null
      or new.approved_by is distinct from old.approved_by
      or new.approved_at is distinct from old.approved_at
      or new.rejected_at is distinct from old.rejected_at
      or new.rejection_reason is distinct from old.rejection_reason
      or new.scheduled_at is distinct from old.scheduled_at
      or new.published_at is distinct from old.published_at then
      raise exception using errcode = '55000', message = 'REPORTER_STORY_EVIDENCE_MISMATCH';
    end if;
  elsif old.status = 'pending_review'
    and new.status = 'rejected'
    and current_revision.review_outcome = 'withdrawn' then
    if current_revision.submitted_by is distinct from actor_id
      or current_revision.reviewed_by is distinct from actor_id
      or new.submitted_at is distinct from old.submitted_at
      or new.approved_by is distinct from old.approved_by
      or new.approved_at is distinct from old.approved_at
      or new.rejected_at is distinct from current_revision.reviewed_at
      or new.rejection_reason is distinct from 'Withdrawn by reporter'
      or new.scheduled_at is distinct from old.scheduled_at
      or new.published_at is distinct from old.published_at then
      raise exception using errcode = '55000', message = 'REPORTER_STORY_EVIDENCE_MISMATCH';
    end if;
  elsif old.status = 'pending_review'
    and new.status in ('approved', 'scheduled', 'published', 'rejected', 'archived') then
    if current_revision.review_outcome is distinct from 'pending_review' or not staff_actor then
      raise exception using errcode = '55000', message = 'REPORTER_STORY_TRANSITION_FORBIDDEN';
    end if;
    if new.submitted_at is distinct from old.submitted_at then
      raise exception using errcode = '55000', message = 'REPORTER_STORY_LIFECYCLE_IMMUTABLE';
    end if;
    if new.status = 'rejected' then
      if new.approved_by is distinct from old.approved_by
        or new.approved_at is distinct from old.approved_at
        or new.scheduled_at is distinct from old.scheduled_at
        or new.published_at is distinct from old.published_at
        or new.rejection_reason is null
        or length(btrim(new.rejection_reason)) not between 1 and 2000 then
        raise exception using errcode = '55000', message = 'REPORTER_STORY_LIFECYCLE_IMMUTABLE';
      end if;
      new.rejected_at := transition_time;
    elsif new.status = 'approved' then
      if new.approved_by is distinct from actor_id
        or new.rejected_at is distinct from old.rejected_at
        or new.rejection_reason is distinct from old.rejection_reason
        or new.scheduled_at is distinct from old.scheduled_at
        or new.published_at is distinct from old.published_at then
        raise exception using errcode = '55000', message = 'REPORTER_STORY_LIFECYCLE_IMMUTABLE';
      end if;
      new.approved_at := transition_time;
    elsif new.status = 'scheduled' then
      if new.approved_by is distinct from actor_id
        or new.rejected_at is distinct from old.rejected_at
        or new.rejection_reason is distinct from old.rejection_reason
        or new.published_at is distinct from old.published_at
        or new.scheduled_at is null
        or new.scheduled_at <= transition_time then
        raise exception using errcode = '55000', message = 'REPORTER_STORY_LIFECYCLE_IMMUTABLE';
      end if;
      new.approved_at := transition_time;
    elsif new.status = 'published' then
      if new.approved_by is distinct from actor_id
        or new.rejected_at is distinct from old.rejected_at
        or new.rejection_reason is distinct from old.rejection_reason
        or new.scheduled_at is distinct from old.scheduled_at then
        raise exception using errcode = '55000', message = 'REPORTER_STORY_LIFECYCLE_IMMUTABLE';
      end if;
      new.approved_at := transition_time;
      new.published_at := transition_time;
    else
      if new.approved_by is distinct from actor_id
        or new.rejected_at is distinct from old.rejected_at
        or new.rejection_reason is distinct from old.rejection_reason
        or new.scheduled_at is distinct from old.scheduled_at
        or new.published_at is distinct from old.published_at then
        raise exception using errcode = '55000', message = 'REPORTER_STORY_LIFECYCLE_IMMUTABLE';
      end if;
      new.approved_at := transition_time;
    end if;
  elsif old.status = 'approved'
    and new.status in ('scheduled', 'published', 'archived') then
    if current_revision.review_outcome is distinct from 'approved' or not staff_actor then
      raise exception using errcode = '55000', message = 'REPORTER_STORY_TRANSITION_FORBIDDEN';
    end if;
    if new.submitted_at is distinct from old.submitted_at
      or new.approved_by is distinct from old.approved_by
      or new.approved_at is distinct from old.approved_at
      or new.rejected_at is distinct from old.rejected_at
      or new.rejection_reason is distinct from old.rejection_reason then
      raise exception using errcode = '55000', message = 'REPORTER_STORY_LIFECYCLE_IMMUTABLE';
    end if;
    if new.status = 'scheduled' then
      if new.published_at is distinct from old.published_at
        or new.scheduled_at is null
        or new.scheduled_at <= transition_time then
        raise exception using errcode = '55000', message = 'REPORTER_STORY_LIFECYCLE_IMMUTABLE';
      end if;
    elsif new.status = 'published' then
      if new.scheduled_at is not null then
        raise exception using errcode = '55000', message = 'REPORTER_STORY_LIFECYCLE_IMMUTABLE';
      end if;
      new.published_at := transition_time;
    elsif new.scheduled_at is distinct from old.scheduled_at
      or new.published_at is distinct from old.published_at then
      raise exception using errcode = '55000', message = 'REPORTER_STORY_LIFECYCLE_IMMUTABLE';
    end if;
  elsif old.status = 'scheduled' and new.status in ('published', 'archived') then
    if current_revision.review_outcome is distinct from 'scheduled' or not staff_actor then
      raise exception using errcode = '55000', message = 'REPORTER_STORY_TRANSITION_FORBIDDEN';
    end if;
    if new.submitted_at is distinct from old.submitted_at
      or new.approved_by is distinct from old.approved_by
      or new.approved_at is distinct from old.approved_at
      or new.rejected_at is distinct from old.rejected_at
      or new.rejection_reason is distinct from old.rejection_reason then
      raise exception using errcode = '55000', message = 'REPORTER_STORY_LIFECYCLE_IMMUTABLE';
    end if;
    if new.status = 'published' then
      if new.scheduled_at is not null then
        raise exception using errcode = '55000', message = 'REPORTER_STORY_LIFECYCLE_IMMUTABLE';
      end if;
      new.published_at := transition_time;
    elsif new.scheduled_at is distinct from old.scheduled_at
      or new.published_at is distinct from old.published_at then
      raise exception using errcode = '55000', message = 'REPORTER_STORY_LIFECYCLE_IMMUTABLE';
    end if;
  elsif old.status = 'published' and new.status = 'archived' then
    if current_revision.review_outcome not in ('direct_published', 'published')
      or not staff_actor or lifecycle_changed then
      raise exception using errcode = '55000', message = 'REPORTER_STORY_TRANSITION_FORBIDDEN';
    end if;
  elsif old.status = 'rejected' and new.status = 'archived' then
    if current_revision.review_outcome not in ('rejected', 'withdrawn')
      or not staff_actor
      or new.submitted_at is distinct from old.submitted_at
      or new.rejected_at is distinct from old.rejected_at
      or new.rejection_reason is distinct from old.rejection_reason
      or new.scheduled_at is distinct from old.scheduled_at
      or new.published_at is distinct from old.published_at
      or new.approved_by is distinct from old.approved_by
      or new.approved_at is distinct from old.approved_at then
      raise exception using errcode = '55000', message = 'REPORTER_STORY_TRANSITION_FORBIDDEN';
    end if;
  else
    raise exception using
      errcode = '55000',
      message = 'REPORTER_STORY_TRANSITION_FORBIDDEN';
  end if;

  new.updated_at := transition_time;
  return new;
end;
$$;

create or replace function public.correct_reporter_story(
  p_story_id uuid,
  p_revision_id uuid,
  p_expected_updated_at timestamptz,
  p_patch jsonb,
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
  current_story public.stories%rowtype;
  current_revision public.story_revisions%rowtype;
  correction_time timestamptz := clock_timestamp();
  patch_keys text[];
  allowed_keys constant text[] := array[
    'category_id', 'content', 'featured_media_id', 'language_id', 'seo_description',
    'seo_keywords', 'seo_title', 'slug', 'summary', 'title'
  ];
  canonical_language_id uuid;
  canonical_category_id uuid;
  canonical_featured_media_id uuid;
  canonical_slug text;
  canonical_title text;
  canonical_summary text;
  canonical_content text;
  canonical_seo_title text;
  canonical_seo_description text;
  canonical_keywords text[];
  canonical_media_ids uuid[];
  canonical_snapshot jsonb;
  changed_fields text[];
  correction_event_id uuid := gen_random_uuid();
begin
  if actor_id is null or actor_role not in ('editor', 'admin')
    or not exists (
      select 1
      from public.profiles
      where profiles.id = actor_id
        and profiles.role::text = actor_role
        and profiles.role in ('editor', 'admin')
        and profiles.is_active
    ) then
    raise exception using errcode = '42501', message = 'REPORTER_CORRECTION_FORBIDDEN';
  end if;
  if p_reason is null
    or length(btrim(p_reason)) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'REPORTER_CORRECTION_REASON_REQUIRED';
  end if;
  if jsonb_typeof(p_patch) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'REPORTER_CORRECTION_PATCH_INVALID';
  end if;
  select array_agg(key order by key) into patch_keys
  from jsonb_object_keys(p_patch) as keys(key);
  if patch_keys is distinct from allowed_keys then
    raise exception using errcode = '22023', message = 'REPORTER_CORRECTION_PATCH_INVALID';
  end if;
  if exists (
    select 1
    from unnest(array['language_id', 'category_id', 'slug', 'title', 'summary', 'content']) as required_key
    where jsonb_typeof(p_patch -> required_key) is distinct from 'string'
  ) or jsonb_typeof(p_patch -> 'seo_keywords') is distinct from 'array'
    or exists (
      select 1
      from jsonb_array_elements(p_patch -> 'seo_keywords') as keywords(keyword)
      where jsonb_typeof(keyword) is distinct from 'string'
    )
    or jsonb_typeof(p_patch -> 'featured_media_id') not in ('string', 'null')
    or jsonb_typeof(p_patch -> 'seo_title') not in ('string', 'null')
    or jsonb_typeof(p_patch -> 'seo_description') not in ('string', 'null') then
    raise exception using errcode = '22023', message = 'REPORTER_CORRECTION_PATCH_INVALID';
  end if;

  canonical_language_id := (p_patch ->> 'language_id')::uuid;
  canonical_category_id := (p_patch ->> 'category_id')::uuid;
  canonical_featured_media_id := (p_patch ->> 'featured_media_id')::uuid;
  canonical_slug := btrim(p_patch ->> 'slug');
  canonical_title := btrim(p_patch ->> 'title');
  canonical_summary := btrim(p_patch ->> 'summary');
  canonical_content := btrim(p_patch ->> 'content');
  canonical_seo_title := nullif(btrim(p_patch ->> 'seo_title'), '');
  canonical_seo_description := nullif(btrim(p_patch ->> 'seo_description'), '');
  begin
    select coalesce(array_agg(keyword), '{}'::text[])
    into canonical_keywords
    from jsonb_array_elements_text(p_patch -> 'seo_keywords') as keywords(keyword);
  exception when data_exception then
    raise exception using errcode = '22023', message = 'REPORTER_CORRECTION_PATCH_INVALID';
  end;
  if canonical_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or length(canonical_title) not between 1 and 240
    or length(canonical_summary) not between 1 and 1000
    or length(canonical_content) not between 1 and 100000
    or length(coalesce(canonical_seo_title, '')) > 240
    or length(coalesce(canonical_seo_description, '')) > 1000
    or cardinality(canonical_keywords) > 50
    or coalesce((select sum(length(keyword)) from unnest(canonical_keywords) as keyword), 0) > 1000
    or exists (
      select 1 from unnest(canonical_keywords) as keyword
      where length(btrim(keyword)) not between 1 and 100
    ) then
    raise exception using errcode = '22023', message = 'REPORTER_CORRECTION_PATCH_INVALID';
  end if;

  select * into current_story
  from public.stories
  where stories.id = p_story_id
  for update;
  if not found or not public.is_reporter_story(current_story) then
    raise exception using errcode = 'P0002', message = 'REPORTER_STORY_NOT_FOUND';
  end if;
  if current_story.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'REPORTER_CORRECTION_REVISION_CONFLICT';
  end if;
  if current_story.status not in ('pending_review', 'approved', 'scheduled', 'published') then
    raise exception using errcode = '55000', message = 'REPORTER_CORRECTION_STATUS_INVALID';
  end if;

  select * into current_revision
  from public.story_revisions
  where story_id = current_story.id
  order by revision_number desc
  limit 1
  for update;
  if not found or current_revision.id is distinct from p_revision_id then
    raise exception using errcode = '40001', message = 'REPORTER_CORRECTION_REVISION_CONFLICT';
  end if;
  if not exists (
    select 1 from public.languages
    where languages.id = canonical_language_id and languages.is_active
  ) or not exists (
    select 1 from public.categories
    where categories.id = canonical_category_id
      and categories.language_id = canonical_language_id
      and categories.is_active
  ) or exists (
    select 1 from public.stories
    where stories.language_id = canonical_language_id
      and stories.slug = canonical_slug
      and stories.id <> current_story.id
  ) then
    raise exception using errcode = '23514', message = 'REPORTER_CORRECTION_REFERENCE_INVALID';
  end if;

  perform 1
  from public.media
  where media.story_id = current_story.id
  order by media.id
  for share;
  select coalesce(
    array_agg(media.id order by media.sort_order, media.created_at, media.id),
    '{}'::uuid[]
  ) into canonical_media_ids
  from public.media
  where media.story_id = current_story.id;
  if canonical_featured_media_id is not null and not exists (
    select 1 from public.media
    where media.id = canonical_featured_media_id
      and media.story_id = current_story.id
      and media.media_type = 'image'
      and media.deleted_at is null
      and media.secure_url ~ '^https://'
  ) then
    raise exception using errcode = '23514', message = 'REPORTER_CORRECTION_MEDIA_INVALID';
  end if;

  changed_fields := array_remove(array[
    case when canonical_language_id is distinct from current_story.language_id then 'language_id' end,
    case when canonical_category_id is distinct from current_story.category_id then 'category_id' end,
    case when canonical_slug is distinct from current_story.slug then 'slug' end,
    case when canonical_title is distinct from current_story.title then 'title' end,
    case when canonical_summary is distinct from current_story.summary then 'summary' end,
    case when canonical_content is distinct from current_story.content then 'content' end,
    case when canonical_featured_media_id is distinct from current_story.featured_media_id then 'featured_media_id' end,
    case when canonical_seo_title is distinct from current_story.seo_title then 'seo_title' end,
    case when canonical_seo_description is distinct from current_story.seo_description then 'seo_description' end,
    case when canonical_keywords is distinct from current_story.seo_keywords then 'seo_keywords' end
  ], null);
  if cardinality(changed_fields) = 0 then
    raise exception using errcode = '22023', message = 'REPORTER_CORRECTION_NO_CHANGES';
  end if;

  canonical_snapshot := jsonb_build_object(
    'language_id', canonical_language_id,
    'category_id', canonical_category_id,
    'slug', canonical_slug,
    'title', canonical_title,
    'summary', canonical_summary,
    'content', canonical_content,
    'featured_media_id', canonical_featured_media_id,
    'seo_title', canonical_seo_title,
    'seo_description', canonical_seo_description,
    'seo_keywords', to_jsonb(canonical_keywords),
    'media_ids', to_jsonb(canonical_media_ids)
  );
  insert into private.reporter_story_correction_states (
    story_id, revision_id, snapshot, media_ids, updated_by, updated_at
  ) values (
    current_story.id, current_revision.id, canonical_snapshot,
    canonical_media_ids, actor_id, correction_time
  ) on conflict (story_id) do update
  set revision_id = excluded.revision_id,
      snapshot = excluded.snapshot,
      media_ids = excluded.media_ids,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

  update public.stories
  set language_id = canonical_language_id,
      category_id = canonical_category_id,
      slug = canonical_slug,
      title = canonical_title,
      summary = canonical_summary,
      content = canonical_content,
      featured_media_id = canonical_featured_media_id,
      seo_title = canonical_seo_title,
      seo_description = canonical_seo_description,
      seo_keywords = canonical_keywords,
      updated_at = correction_time
  where id = current_story.id;

  insert into private.reporter_story_corrections (
    id, story_id, revision_id, actor_id, reason, changed_fields, created_at
  ) values (
    correction_event_id, current_story.id, current_revision.id, actor_id,
    btrim(p_reason), changed_fields, correction_time
  );

  insert into public.audit_events (
    actor_id, action, subject_type, subject_id, metadata, created_at
  ) values (
    actor_id,
    'story.reporter_editorial_corrected',
    'story',
    current_story.id,
    jsonb_build_object(
      'correction_event_id', correction_event_id,
      'revision_id', current_revision.id,
      'changed_fields', to_jsonb(changed_fields)
    ),
    correction_time
  );
  insert into public.reporter_notifications (
    profile_id, notification_type, message, delivery_channel, delivery_status, created_at
  ) values (
    current_story.created_by,
    'story_corrected',
    'The newsroom corrected the canonical version of one of your submitted stories.',
    'in_app',
    'not_applicable',
    correction_time
  );

  return jsonb_build_object(
    'story_id', current_story.id,
    'status', current_story.status,
    'changed_fields', to_jsonb(changed_fields),
    'updated_at', correction_time
  );
end;
$$;

create or replace function public.notify_reporter_story_rejection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from 'pending_review'
    or new.status is distinct from 'rejected'
    or new.created_by is null
    or not public.is_reporter_story(new)
    or (
      select story_revisions.review_outcome
      from public.story_revisions
      where story_revisions.story_id = new.id
      order by story_revisions.revision_number desc
      limit 1
    ) = 'withdrawn' then
    return new;
  end if;

  insert into public.reporter_notifications (
    profile_id, notification_type, message, delivery_channel, delivery_status, created_at
  ) values (
    new.created_by,
    'story_rejected',
    'Your submitted story was rejected. Review the editorial decision in the reporter portal.',
    'in_app',
    'not_applicable',
    clock_timestamp()
  );
  return new;
end;
$$;

revoke all on function public.correct_reporter_story(uuid, uuid, timestamptz, jsonb, text)
from public, anon, authenticated, service_role;
revoke all on function public.notify_reporter_story_rejection()
from public, anon, authenticated, service_role;

grant execute on function public.correct_reporter_story(uuid, uuid, timestamptz, jsonb, text)
to authenticated;
