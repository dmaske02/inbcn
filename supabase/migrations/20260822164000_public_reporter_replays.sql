-- Anonymous-safe replay metadata and service-only private object resolution.

create view public.public_replays
with (security_barrier = true)
as
select
  public_live_replays.id,
  'published'::text as status,
  public_live_replays.title,
  public_live_replays.description,
  public_live_replays.duration_seconds,
  public_live_replays.recording_started_at,
  public_live_replays.recording_ended_at,
  public_live_replays.published_at,
  languages.code as language_code,
  categories.slug as category_slug,
  categories.name as category_name,
  media.secure_url as thumbnail_url,
  coalesce(media.alt_text, public_live_replays.title) as thumbnail_alt_text,
  media.width as thumbnail_width,
  media.height as thumbnail_height,
  public_reporter_profiles.public_slug as reporter_public_slug,
  public_reporter_profiles.legal_display_name as reporter_legal_display_name,
  public_reporter_profiles.avatar_url as reporter_avatar_url,
  public_reporter_profiles.public_status as reporter_public_status,
  public_reporter_profiles.home_district as reporter_home_district,
  public_reporter_profiles.bio as reporter_bio,
  public_reporter_profiles.beats as reporter_beats
from public.public_live_replays
join public.live_recordings
  on live_recordings.id = public_live_replays.id
join public.reporter_live_requests
  on reporter_live_requests.id = public_live_replays.live_request_id
join public.reporter_profiles
  on reporter_profiles.profile_id = reporter_live_requests.profile_id
join public.public_reporter_profiles
  on public_reporter_profiles.public_slug = reporter_profiles.public_slug
join public.categories
  on categories.id = public_live_replays.category_id
join public.languages
  on languages.id = categories.language_id
join public.media
  on media.id = public_live_replays.thumbnail_media_id
where live_recordings.recording_status = 'completed'
  and live_recordings.replay_status = 'published'
  and not live_recordings.legal_hold
  and live_recordings.replay_published_at <= clock_timestamp()
  and public_live_replays.published_at <= clock_timestamp()
  and (
    live_recordings.retention_delete_at is null
    or live_recordings.retention_delete_at > clock_timestamp()
  )
  and categories.is_active
  and languages.is_active
  and media.media_type = 'image'
  and media.deleted_at is null
  and media.secure_url ~ '^https://res[.]cloudinary[.]com/'
  and (
    media.cloudinary_public_id !~ '^inbcn/reporter/story/'
    or (
      media.cloudinary_public_id =
        'inbcn/reporter/story/' || (media.metadata ->> 'reporterStoryId') || '/'
        || (media.metadata ->> 'cloudinaryObjectId')
      and position('/' || media.cloudinary_public_id in media.secure_url) > 0
      and position(
        '/inbcn/reporter/story/' || media.created_by::text || '/'
        in media.secure_url
      ) = 0
    )
  );

revoke all on table public.public_replays
from public, anon, authenticated, service_role;
grant select on table public.public_replays to anon, authenticated;

comment on view public.public_replays is
  'Owner-executed, current anonymous replay projection. It exposes no request/profile UUID, private object key, provider fact, exact location, or editorial metadata.';

create function public.get_public_replay_storage_key(p_replay_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  object_key text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'PUBLIC_REPLAY_STORAGE_FORBIDDEN';
  end if;
  if p_replay_id is null then
    return null;
  end if;

  select live_recordings.storage_key into object_key
  from public.live_recordings
  where live_recordings.id = p_replay_id
    and live_recordings.storage_key =
      'reporter-live/' || live_recordings.live_request_id::text || '/'
      || live_recordings.id::text || '.mp4'
    and exists (
      select 1 from public.public_replays
      where public_replays.id = p_replay_id
    );

  return object_key;
end;
$$;

revoke all on function public.get_public_replay_storage_key(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_public_replay_storage_key(uuid) to service_role;

comment on function public.get_public_replay_storage_key(uuid) is
  'Service-only current-public recheck returning only the canonical private MP4 key.';
