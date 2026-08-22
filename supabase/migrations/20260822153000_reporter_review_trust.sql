-- Staff review reads use one field-safe projection. Trust changes remain
-- database-owned and reporter rejection notifications follow the real guarded
-- canonical transition.

create or replace function public.get_reporter_story_review(p_story_id uuid)
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
  reporter_record jsonb;
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
    raise exception using errcode = '42501', message = 'REPORTER_REVIEW_FORBIDDEN';
  end if;

  select * into current_story
  from public.stories
  where stories.id = p_story_id
  for share;
  if not found or not public.is_reporter_story(current_story) then
    raise exception using errcode = 'P0002', message = 'REPORTER_STORY_NOT_FOUND';
  end if;

  select * into current_revision
  from public.story_revisions
  where story_id = current_story.id
  order by revision_number desc
  limit 1
  for share;
  if not found then
    raise exception using errcode = 'P0002', message = 'REPORTER_REVISION_NOT_FOUND';
  end if;

  select jsonb_build_object(
    'profile_id', reporter_profiles.profile_id,
    'legal_name', reporter_profiles.legal_display_name,
    'portrait_url', reporter_profiles.avatar_url,
    'public_slug', reporter_profiles.public_slug,
    'home_city', reporter_profiles.home_city,
    'home_district', reporter_profiles.home_district,
    'home_state', reporter_profiles.home_state,
    'bio', reporter_profiles.bio,
    'beats', to_jsonb(reporter_profiles.beats),
    'public_status', reporter_profiles.public_status,
    'membership_started_at', reporter_profiles.membership_started_at,
    'membership_expires_at', reporter_profiles.membership_expires_at,
    'membership_grace_ends_at', reporter_profiles.membership_grace_ends_at,
    'is_active', profiles.is_active,
    'is_suspended', reporter_profiles.public_status = 'suspended',
    'direct_publish_raw', reporter_profiles.can_publish_directly,
    'live_broadcast_raw', reporter_profiles.can_broadcast_live,
    'direct_publish_effective', reporter_profiles.can_publish_directly
      and profiles.is_active
      and reporter_profiles.public_status = 'active'
      and reporter_profiles.membership_started_at <= clock_timestamp()
      and reporter_profiles.membership_expires_at >= clock_timestamp()
      and reporter_profiles.access_sync_status = 'succeeded'
      and reporter_profiles.access_sync_desired_role = 'reporter',
    'live_broadcast_effective', reporter_profiles.can_broadcast_live
      and profiles.is_active
      and reporter_profiles.public_status = 'active'
      and reporter_profiles.membership_started_at <= clock_timestamp()
      and reporter_profiles.membership_expires_at >= clock_timestamp()
      and reporter_profiles.access_sync_status = 'succeeded'
      and reporter_profiles.access_sync_desired_role = 'reporter'
  ) into reporter_record
  from public.reporter_profiles
  join public.profiles
    on profiles.id = reporter_profiles.profile_id
  where reporter_profiles.profile_id = current_story.created_by;
  if reporter_record is null then
    raise exception using errcode = 'P0002', message = 'REPORTER_PROFILE_NOT_FOUND';
  end if;

  return jsonb_build_object(
    'latest_revision', jsonb_build_object(
      'id', current_revision.id,
      'number', current_revision.revision_number,
      'submitted_at', current_revision.submitted_at,
      'outcome', current_revision.review_outcome,
      'reason', current_revision.review_reason,
      'snapshot', jsonb_build_object(
        'language_id', current_revision.snapshot -> 'language_id',
        'category_id', current_revision.snapshot -> 'category_id',
        'slug', current_revision.snapshot -> 'slug',
        'title', current_revision.snapshot -> 'title',
        'summary', current_revision.snapshot -> 'summary',
        'content', current_revision.snapshot -> 'content',
        'event_occurred_at', current_revision.snapshot -> 'event_occurred_at',
        'featured_media_id', current_revision.snapshot -> 'featured_media_id',
        'media_ids', to_jsonb(current_revision.associated_media_ids)
      )
    ),
    'canonical_story', jsonb_build_object(
      'id', current_story.id,
      'status', current_story.status,
      'language_id', current_story.language_id,
      'category_id', current_story.category_id,
      'slug', current_story.slug,
      'title', current_story.title,
      'summary', current_story.summary,
      'content', current_story.content,
      'event_occurred_at', current_story.event_occurred_at,
      'featured_media_id', current_story.featured_media_id,
      'submitted_at', current_story.submitted_at,
      'approved_at', current_story.approved_at,
      'scheduled_at', current_story.scheduled_at,
      'published_at', current_story.published_at,
      'rejected_at', current_story.rejected_at,
      'rejection_reason', current_story.rejection_reason
    ),
    'reporter', reporter_record,
    'submitted_media', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', media.id,
          'type', media.media_type,
          'secure_url', media.secure_url,
          'title', media.title,
          'original_filename', media.original_filename,
          'alt_text', media.alt_text,
          'caption', media.caption,
          'width', media.width,
          'height', media.height,
          'duration_seconds', media.duration_seconds,
          'bytes', media.bytes,
          'created_at', media.created_at
        ) order by array_position(current_revision.associated_media_ids, media.id)
      )
      from public.media
      where media.id = any(current_revision.associated_media_ids)
        and media.story_id = current_story.id
        and media.secure_url ~ '^https://'
    ), '[]'::jsonb),
    'private_location', (
      select jsonb_build_object(
        'latitude', story_locations.latitude,
        'longitude', story_locations.longitude,
        'accuracy_meters', story_locations.accuracy_meters,
        'captured_at', story_locations.captured_at,
        'received_at', story_locations.received_at,
        'locality', story_locations.locality
      )
      from public.story_locations
      where story_locations.revision_id = current_revision.id
        and story_locations.story_id = current_story.id
    ),
    'story_audit', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'action', audit_events.action,
          'actor_id', audit_events.actor_id,
          'actor_name', profiles.display_name,
          'created_at', audit_events.created_at,
          'metadata', audit_events.metadata
        ) order by audit_events.created_at desc, audit_events.id desc
      )
      from public.audit_events
      left join public.profiles on profiles.id = audit_events.actor_id
      where audit_events.subject_type = 'story'
        and audit_events.subject_id = current_story.id
    ), '[]'::jsonb)
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
    or not public.is_reporter_story(new) then
    return new;
  end if;

  insert into public.reporter_notifications (
    profile_id,
    notification_type,
    message,
    delivery_channel,
    delivery_status,
    created_at
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

create trigger zz_notify_reporter_story_rejection
after update of status on public.stories
for each row execute function public.notify_reporter_story_rejection();

create or replace function public.set_reporter_trust(
  p_profile_id uuid,
  p_capability text,
  p_enabled boolean,
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
  current_reporter public.reporter_profiles%rowtype;
  current_profile public.profiles%rowtype;
  current_value boolean;
  transition_time timestamptz := clock_timestamp();
begin
  if actor_id is null or actor_role is distinct from 'admin'
    or not exists (
      select 1
      from public.profiles
      where profiles.id = actor_id
        and profiles.role = 'admin'
        and profiles.is_active
    ) then
    raise exception using errcode = '42501', message = 'REPORTER_TRUST_FORBIDDEN';
  end if;
  if p_capability is null
    or p_capability not in ('direct_publish', 'live_broadcast')
    or p_enabled is null then
    raise exception using errcode = '22023', message = 'REPORTER_TRUST_CAPABILITY_INVALID';
  end if;
  if p_reason is null
    or length(btrim(p_reason)) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'REPORTER_TRUST_REASON_REQUIRED';
  end if;

  select * into current_reporter
  from public.reporter_profiles
  where reporter_profiles.profile_id = p_profile_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'REPORTER_PROFILE_NOT_FOUND';
  end if;
  select * into current_profile
  from public.profiles
  where profiles.id = p_profile_id
  for update;
  if not found or current_profile.role is distinct from 'reporter' then
    raise exception using errcode = 'P0002', message = 'REPORTER_PROFILE_NOT_FOUND';
  end if;

  current_value := case p_capability
    when 'direct_publish' then current_reporter.can_publish_directly
    else current_reporter.can_broadcast_live
  end;
  if current_value = p_enabled then
    return jsonb_build_object(
      'profile_id', p_profile_id,
      'capability', p_capability,
      'enabled', current_value,
      'changed', false
    );
  end if;

  if p_enabled and (
    current_reporter.public_status is distinct from 'active'
    or not current_profile.is_active
    or current_reporter.suspended_at is not null
    or current_reporter.access_sync_status is distinct from 'succeeded'
    or current_reporter.access_sync_desired_role is distinct from 'reporter'
    or current_reporter.membership_started_at > transition_time
    or current_reporter.membership_expires_at < transition_time
  ) then
    raise exception using errcode = 'P0001', message = 'REPORTER_TRUST_TARGET_INELIGIBLE';
  end if;

  if p_capability = 'direct_publish' then
    if p_enabled then
      update public.reporter_profiles
      set can_publish_directly = true,
          direct_publish_granted_by = actor_id,
          direct_publish_granted_at = transition_time,
          updated_at = transition_time
      where profile_id = p_profile_id;
    else
      update public.reporter_profiles
      set can_publish_directly = false,
          direct_publish_revoked_by = actor_id,
          direct_publish_revoked_at = transition_time,
          updated_at = transition_time
      where profile_id = p_profile_id;
    end if;
  else
    if p_enabled then
      update public.reporter_profiles
      set can_broadcast_live = true,
          live_broadcast_granted_by = actor_id,
          live_broadcast_granted_at = transition_time,
          updated_at = transition_time
      where profile_id = p_profile_id;
    else
      update public.reporter_profiles
      set can_broadcast_live = false,
          live_broadcast_revoked_by = actor_id,
          live_broadcast_revoked_at = transition_time,
          updated_at = transition_time
      where profile_id = p_profile_id;
    end if;
  end if;

  insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata, created_at)
  values (
    actor_id,
    'reporter.trust_changed',
    'reporter_profile',
    p_profile_id,
    jsonb_build_object(
      'capability', p_capability,
      'from', current_value,
      'to', p_enabled,
      'reason', btrim(p_reason)
    ),
    transition_time
  );
  insert into public.reporter_notifications (
    profile_id,
    notification_type,
    message,
    delivery_channel,
    delivery_status,
    created_at
  ) values (
    p_profile_id,
    'trust_changed',
    'Your reporter permissions were updated by the newsroom.',
    'in_app',
    'not_applicable',
    transition_time
  );

  return jsonb_build_object(
    'profile_id', p_profile_id,
    'capability', p_capability,
    'enabled', p_enabled,
    'changed', true
  );
end;
$$;

revoke all on function public.get_reporter_story_review(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.notify_reporter_story_rejection()
from public, anon, authenticated, service_role;
revoke all on function public.set_reporter_trust(uuid, text, boolean, text)
from public, anon, authenticated, service_role;

grant execute on function public.get_reporter_story_review(uuid)
to authenticated;
grant execute on function public.set_reporter_trust(uuid, text, boolean, text)
to authenticated;
