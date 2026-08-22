-- Reporter event time is canonical editorial evidence. Legacy and staff stories
-- remain compatible because the field is nullable outside true reporter flows.
alter table public.stories
add column event_occurred_at timestamptz;

comment on column public.stories.event_occurred_at is
  'Reporter-supplied event time; required for true reporter drafts and immutable after submission.';

-- Reporter drafts and their ordered canonical media association are one write.
-- A canonical media row exists only after Task 3 verifies upload completion;
-- secure provider identity fields are checked again here and during submission.
create or replace function public.save_reporter_story_draft(
  p_story_id uuid,
  p_language_id uuid,
  p_category_id uuid,
  p_title text,
  p_summary text,
  p_content text,
  p_event_occurred_at timestamptz,
  p_media_ids uuid[],
  p_featured_media_id uuid
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
  save_time timestamptz := clock_timestamp();
  saved_story_id uuid := coalesce(p_story_id, gen_random_uuid());
  saved_updated_at timestamptz;
  distinct_media_count integer;
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
    or current_reporter.membership_started_at > save_time
    or current_reporter.membership_grace_ends_at < save_time then
    raise exception using errcode = '42501', message = 'REPORTER_STORY_FORBIDDEN';
  end if;

  if p_title is null or length(btrim(p_title)) not between 1 and 240
    or p_summary is null or length(btrim(p_summary)) not between 1 and 1000
    or p_content is null or length(btrim(p_content)) = 0
    or p_event_occurred_at is null
    or p_event_occurred_at > save_time + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'REPORTER_STORY_INPUT_INVALID';
  end if;
  if not exists (
    select 1
    from public.languages
    join public.categories
      on categories.language_id = languages.id
    where languages.id = p_language_id
      and languages.code in ('en', 'hi', 'mr')
      and languages.is_active
      and categories.id = p_category_id
      and categories.is_active
  ) then
    raise exception using errcode = '23514', message = 'REPORTER_STORY_CLASSIFICATION_INVALID';
  end if;
  if p_media_ids is null or array_position(p_media_ids, null) is not null then
    raise exception using errcode = '22023', message = 'REPORTER_STORY_MEDIA_INVALID';
  end if;
  select count(distinct media_id) into distinct_media_count
  from unnest(p_media_ids) as selected(media_id);
  if cardinality(p_media_ids) is distinct from distinct_media_count then
    raise exception using errcode = '22023', message = 'REPORTER_STORY_MEDIA_INVALID';
  end if;
  if p_featured_media_id is not null
    and not p_featured_media_id = any (p_media_ids) then
    raise exception using errcode = '22023', message = 'REPORTER_STORY_MEDIA_INVALID';
  end if;

  select * into current_story
  from public.stories
  where id = saved_story_id
  for update;
  if found and (
    current_story.created_by is distinct from actor_id
    or not public.is_reporter_story(current_story)
  ) then
    raise exception using errcode = '42501', message = 'REPORTER_STORY_FORBIDDEN';
  end if;
  if found and (
    current_story.status is distinct from 'draft'
    or current_story.source_id is not null
    or current_story.approved_by is not null
    or current_story.submitted_at is not null
    or current_story.approved_at is not null
    or current_story.rejected_at is not null
    or current_story.rejection_reason is not null
    or current_story.scheduled_at is not null
    or current_story.published_at is not null
    or current_story.external_id is not null
    or current_story.external_url is not null
    or current_story.external_author is not null
    or current_story.external_published_at is not null
    or current_story.external_image_url is not null
    or current_story.canonical_url is not null
    or current_story.is_featured
    or current_story.is_breaking
    or current_story.is_sponsored
  ) then
    raise exception using errcode = 'P0001', message = 'REPORTER_STORY_INVALID_STATE';
  end if;

  perform 1
  from public.media
  where media.story_id = saved_story_id
     or media.id = any (p_media_ids)
  order by media.id
  for update;
  if exists (
    select 1
    from public.media
    where media.story_id = saved_story_id
      and media.created_by is distinct from actor_id
  ) or (
    select count(*) from public.media where media.id = any (p_media_ids)
  ) is distinct from cardinality(p_media_ids)
    or exists (
      select 1
      from public.media
      where media.id = any (p_media_ids)
        and (
          media.created_by is distinct from actor_id
          or media.deleted_at is not null
          or media.secure_url !~ '^https://'
          or length(btrim(media.cloudinary_public_id)) = 0
          or (media.id = p_featured_media_id and media.media_type is distinct from 'image')
          or (media.story_id is not null and media.story_id is distinct from saved_story_id)
        )
    ) then
    raise exception using errcode = '23514', message = 'REPORTER_STORY_MEDIA_INVALID';
  end if;

  if current_story.id is null then
    insert into public.stories (
      id,
      language_id,
      category_id,
      created_by,
      source_id,
      story_type,
      status,
      slug,
      title,
      summary,
      content,
      featured_media_id,
      event_occurred_at,
      created_at,
      updated_at
    ) values (
      saved_story_id,
      p_language_id,
      p_category_id,
      actor_id,
      null,
      'citizen_report',
      'draft',
      'report-' || replace(saved_story_id::text, '-', ''),
      btrim(p_title),
      btrim(p_summary),
      btrim(p_content),
      p_featured_media_id,
      p_event_occurred_at,
      save_time,
      save_time
    );
  else
    update public.stories
    set language_id = p_language_id,
        category_id = p_category_id,
        title = btrim(p_title),
        summary = btrim(p_summary),
        content = btrim(p_content),
        featured_media_id = p_featured_media_id,
        event_occurred_at = p_event_occurred_at,
        updated_at = save_time
    where id = saved_story_id;
  end if;

  update public.media
  set story_id = null,
      sort_order = 0,
      updated_by = actor_id,
      updated_at = save_time
  where story_id = saved_story_id
    and not (id = any (p_media_ids));
  update public.media as media
  set story_id = saved_story_id,
      sort_order = array_position(p_media_ids, media.id),
      updated_by = actor_id,
      updated_at = save_time
  where media.id = any (p_media_ids);

  select updated_at into saved_updated_at
  from public.stories
  where id = saved_story_id;
  return jsonb_build_object(
    'story_id', saved_story_id,
    'story_status', 'draft',
    'updated_at', saved_updated_at
  );
end;
$$;

-- Draft event time stays authorable. Once a revision exists, canonical event
-- evidence cannot change and must match the latest immutable snapshot.
create or replace function public.guard_reporter_story_event_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_revision public.story_revisions%rowtype;
  old_reporter_story boolean := public.is_reporter_story(old);
  new_reporter_story boolean := public.is_reporter_story(new);
begin
  if not old_reporter_story and not new_reporter_story then
    return new;
  end if;
  if new.event_occurred_at is null
    or new.event_occurred_at > clock_timestamp() + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'REPORTER_STORY_EVENT_TIME_INVALID';
  end if;
  if old.status = 'draft' and new.status = 'draft' then
    return new;
  end if;
  if new.event_occurred_at is distinct from old.event_occurred_at then
    raise exception using errcode = '55000', message = 'REPORTER_STORY_EVENT_EVIDENCE_IMMUTABLE';
  end if;

  select * into current_revision
  from public.story_revisions
  where story_id = new.id
  order by revision_number desc
  limit 1
  for update;
  if not found
    or (current_revision.snapshot ->> 'event_occurred_at')::timestamptz
      is distinct from new.event_occurred_at then
    raise exception using errcode = '55000', message = 'REPORTER_STORY_EVENT_EVIDENCE_MISMATCH';
  end if;
  return new;
end;
$$;

create trigger guard_reporter_story_event_evidence
before update on public.stories
for each row execute function public.guard_reporter_story_event_evidence();

-- Keep the reviewed transition implementation, but make the public RPC source
-- event time from the locked canonical draft rather than transition input.
alter function public.submit_reporter_story(
  uuid, timestamptz, numeric, numeric, numeric, timestamptz, text
) rename to submit_reporter_story_with_event_legacy;
alter function public.direct_publish_reporter_story(
  uuid, timestamptz, numeric, numeric, numeric, timestamptz, text
) rename to direct_publish_reporter_story_with_event_legacy;

create or replace function public.submit_reporter_story(
  p_story_id uuid,
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
  canonical_event_time timestamptz;
begin
  if actor_id is null or actor_role is distinct from 'reporter' then
    raise exception using errcode = '42501', message = 'REPORTER_STORY_FORBIDDEN';
  end if;
  perform 1
  from public.reporter_profiles
  where profile_id = actor_id
  for update;
  perform 1
  from public.profiles
  where id = actor_id
  for update;
  select stories.event_occurred_at into canonical_event_time
  from public.stories
  where stories.id = p_story_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'REPORTER_STORY_NOT_FOUND';
  end if;
  return public.submit_reporter_story_with_event_legacy(
    p_story_id,
    canonical_event_time,
    p_latitude,
    p_longitude,
    p_accuracy_meters,
    p_captured_at,
    p_locality
  );
end;
$$;

create or replace function public.direct_publish_reporter_story(
  p_story_id uuid,
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
  canonical_event_time timestamptz;
begin
  if actor_id is null or actor_role is distinct from 'reporter' then
    raise exception using errcode = '42501', message = 'REPORTER_DIRECT_PUBLISH_FORBIDDEN';
  end if;
  perform 1
  from public.reporter_profiles
  where profile_id = actor_id
  for update;
  perform 1
  from public.profiles
  where id = actor_id
  for update;
  select stories.event_occurred_at into canonical_event_time
  from public.stories
  where stories.id = p_story_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'REPORTER_STORY_NOT_FOUND';
  end if;
  return public.direct_publish_reporter_story_with_event_legacy(
    p_story_id,
    canonical_event_time,
    p_latitude,
    p_longitude,
    p_accuracy_meters,
    p_captured_at,
    p_locality
  );
end;
$$;

revoke all on function public.save_reporter_story_draft(
  uuid, uuid, uuid, text, text, text, timestamptz, uuid[], uuid
) from public, anon, authenticated, service_role;
revoke all on function public.submit_reporter_story_with_event_legacy(
  uuid, timestamptz, numeric, numeric, numeric, timestamptz, text
) from public, anon, authenticated, service_role;
revoke all on function public.direct_publish_reporter_story_with_event_legacy(
  uuid, timestamptz, numeric, numeric, numeric, timestamptz, text
) from public, anon, authenticated, service_role;
revoke all on function public.submit_reporter_story(
  uuid, numeric, numeric, numeric, timestamptz, text
) from public, anon, authenticated, service_role;
revoke all on function public.direct_publish_reporter_story(
  uuid, numeric, numeric, numeric, timestamptz, text
) from public, anon, authenticated, service_role;
revoke all on function public.guard_reporter_story_event_evidence()
from public, anon, authenticated, service_role;

grant execute on function public.save_reporter_story_draft(
  uuid, uuid, uuid, text, text, text, timestamptz, uuid[], uuid
) to authenticated;
grant execute on function public.submit_reporter_story(
  uuid, numeric, numeric, numeric, timestamptz, text
) to authenticated;
grant execute on function public.direct_publish_reporter_story(
  uuid, numeric, numeric, numeric, timestamptz, text
) to authenticated;
