-- Keep public rendering on fixed owner-executed projections. Authenticated
-- workflow access to the base tables continues to be decided only by the
-- existing named staff and owner RLS policies.

drop policy "Authenticated can read currently published stories"
on public.stories;

drop policy "Anonymous can read media for current public stories"
on public.media;

drop policy "Authenticated can read media for current published stories"
on public.media;

revoke all on table public.media from anon;

create view public.public_media
with (security_barrier = true)
as
select
  media.id,
  media.cloudinary_public_id,
  media.secure_url,
  media.alt_text,
  media.caption,
  media.width,
  media.height
from public.media
where exists (
  select 1
  from public.public_stories
  where public_stories.featured_media_id = media.id
)
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

revoke all on table public.public_media
from public, anon, authenticated, service_role;
grant select on table public.public_media to anon, authenticated;

comment on view public.public_media is
  'Owner-executed public featured-media projection; its fixed columns, current-public-story association, and reporter path/URL predicates are the security boundary.';

-- New reporter delivery identifiers contain only the already-public story UUID
-- and a random object UUID. Valid legacy owner-bearing rows remain loadable for
-- migration compatibility but public_media hides them until provider rename or
-- safe recompletion. Ownership remains independently bound through created_by
-- and metadata.uploadedBy for both shapes.

alter table public.media
drop constraint media_reporter_upload_binding_check;

alter table public.media
add constraint media_reporter_upload_binding_check
check (
  cloudinary_public_id !~ '^inbcn/reporter/story/'
  or (
    created_by is not null
    and metadata ? 'uploadedBy'
    and metadata ? 'reporterStoryId'
    and metadata ? 'cloudinaryObjectId'
    and metadata ? 'cloudinaryAssetId'
    and (metadata ->> 'uploadedBy') = created_by::text
    and (
      cloudinary_public_id =
        'inbcn/reporter/story/' || (metadata ->> 'reporterStoryId') || '/'
        || (metadata ->> 'cloudinaryObjectId')
      or cloudinary_public_id =
        'inbcn/reporter/story/' || created_by::text || '/'
        || (metadata ->> 'reporterStoryId') || '/'
        || (metadata ->> 'cloudinaryObjectId')
    )
    and (metadata ->> 'reporterStoryId') ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and (metadata ->> 'cloudinaryObjectId') ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and (story_id is null or story_id::text = metadata ->> 'reporterStoryId')
  )
);

create or replace function public.complete_reporter_media_upload(
  p_profile_id uuid,
  p_access_generation bigint,
  p_story_id uuid,
  p_asset_id text,
  p_media_type public.media_type,
  p_public_id text,
  p_secure_url text,
  p_resource_format text,
  p_mime_type text,
  p_title text,
  p_original_filename text,
  p_alt_text text,
  p_width integer,
  p_height integer,
  p_duration_seconds numeric,
  p_bytes bigint,
  p_provider_created_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_reporter public.reporter_profiles%rowtype;
  current_profile public.profiles%rowtype;
  current_story public.stories%rowtype;
  existing_media public.media%rowtype;
  completion_time timestamptz := clock_timestamp();
  completed_media_id uuid;
  object_id text := split_part(p_public_id, '/', 5);
begin
  select * into current_reporter
  from public.reporter_profiles
  where profile_id = p_profile_id
  for update;
  select * into current_profile
  from public.profiles
  where id = p_profile_id
  for update;
  if current_reporter.profile_id is null
    or current_profile.id is null
    or current_profile.role is distinct from 'reporter'
    or not current_profile.is_active
    or current_reporter.access_sync_status is distinct from 'succeeded'
    or current_reporter.access_sync_desired_role is distinct from 'reporter'
    or current_reporter.access_sync_generation is distinct from p_access_generation
    or current_reporter.public_status not in ('active', 'grace')
    or current_reporter.membership_started_at > completion_time
    or current_reporter.membership_grace_ends_at < completion_time then
    raise exception using errcode = '42501', message = 'REPORTER_MEDIA_FORBIDDEN';
  end if;

  select * into current_story
  from public.stories
  where id = p_story_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'REPORTER_MEDIA_FORBIDDEN';
  end if;
  if current_story.created_by is distinct from p_profile_id
    or not public.is_reporter_story(current_story)
    or current_story.status is distinct from 'draft'
    or current_story.source_id is not null then
    raise exception using errcode = '42501', message = 'REPORTER_MEDIA_FORBIDDEN';
  end if;

  if p_asset_id is null or p_asset_id !~ '^[A-Za-z0-9_-]{1,255}$'
    or p_public_id is null
    or p_public_id is distinct from
      'inbcn/reporter/story/' || p_story_id::text || '/' || object_id
    or object_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_secure_url is null or p_secure_url !~ '^https://res[.]cloudinary[.]com/'
    or p_resource_format is null
    or p_mime_type is null
    or p_title is null or length(btrim(p_title)) not between 1 and 200
    or p_original_filename is null or length(btrim(p_original_filename)) not between 1 and 255
    or p_alt_text is not null and length(btrim(p_alt_text)) > 500
    or p_bytes is null or p_bytes <= 0
    or p_provider_created_at is null
    or p_provider_created_at > completion_time + interval '5 minutes'
    or p_width is not null and p_width <= 0
    or p_height is not null and p_height <= 0
    or p_duration_seconds is not null and p_duration_seconds <= 0
    or (case p_media_type
      when 'image' then
        p_resource_format not in ('jpg', 'jpeg', 'png', 'webp', 'avif')
        or p_mime_type is distinct from case p_resource_format
          when 'jpg' then 'image/jpeg'
          when 'jpeg' then 'image/jpeg'
          else 'image/' || p_resource_format
        end
        or p_bytes > 10485760
        or p_width is null
        or p_height is null
        or p_duration_seconds is not null
        or p_alt_text is null
        or length(btrim(p_alt_text)) = 0
      when 'video' then
        p_resource_format not in ('mp4', 'webm')
        or p_mime_type is distinct from 'video/' || p_resource_format
        or p_bytes > 262144000
        or p_duration_seconds is null
      else true
    end) then
    raise exception using errcode = '22023', message = 'REPORTER_MEDIA_INVALID';
  end if;

  if exists (
    select 1 from public.media
    where metadata ->> 'cloudinaryAssetId' = p_asset_id
      and cloudinary_public_id is distinct from p_public_id
  ) then
    raise exception using errcode = '23505', message = 'REPORTER_MEDIA_CONFLICT';
  end if;

  insert into public.media (
    story_id,
    created_by,
    updated_by,
    title,
    original_filename,
    media_type,
    cloudinary_public_id,
    secure_url,
    resource_format,
    mime_type,
    alt_text,
    width,
    height,
    duration_seconds,
    bytes,
    metadata,
    created_at,
    updated_at
  ) values (
    null,
    p_profile_id,
    p_profile_id,
    btrim(p_title),
    btrim(p_original_filename),
    p_media_type,
    p_public_id,
    p_secure_url,
    p_resource_format,
    p_mime_type,
    nullif(btrim(p_alt_text), ''),
    p_width,
    p_height,
    p_duration_seconds,
    p_bytes,
    jsonb_build_object(
      'title', btrim(p_title),
      'credit', null,
      'tags', '[]'::jsonb,
      'uploadedBy', p_profile_id,
      'originalFilename', btrim(p_original_filename),
      'cloudinaryAssetId', p_asset_id,
      'cloudinaryDeliveryType', 'upload',
      'cloudinaryCreatedAt', p_provider_created_at,
      'reporterStoryId', p_story_id,
      'cloudinaryObjectId', object_id
    ),
    completion_time,
    completion_time
  )
  on conflict do nothing
  returning id into completed_media_id;

  if completed_media_id is not null then
    return completed_media_id;
  end if;

  select * into existing_media
  from public.media
  where cloudinary_public_id = p_public_id
  for update;
  if not found
    or existing_media.created_by is distinct from p_profile_id
    or (existing_media.story_id is not null and existing_media.story_id is distinct from p_story_id)
    or existing_media.deleted_at is not null
    or existing_media.media_type is distinct from p_media_type
    or existing_media.secure_url is distinct from p_secure_url
    or existing_media.resource_format is distinct from p_resource_format
    or existing_media.mime_type is distinct from p_mime_type
    or existing_media.width is distinct from p_width
    or existing_media.height is distinct from p_height
    or existing_media.duration_seconds is distinct from p_duration_seconds
    or existing_media.bytes is distinct from p_bytes
    or existing_media.metadata ->> 'cloudinaryAssetId' is distinct from p_asset_id
    or existing_media.metadata ->> 'cloudinaryDeliveryType' is distinct from 'upload'
    or existing_media.metadata ->> 'reporterStoryId' is distinct from p_story_id::text
    or (existing_media.metadata ->> 'cloudinaryCreatedAt')::timestamptz is distinct from p_provider_created_at then
    raise exception using errcode = '23505', message = 'REPORTER_MEDIA_CONFLICT';
  end if;
  return existing_media.id;
end;
$$;

revoke all on function public.complete_reporter_media_upload(
  uuid, bigint, uuid, text, public.media_type, text, text, text, text, text,
  text, text, integer, integer, numeric, bigint, timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.complete_reporter_media_upload(
  uuid, bigint, uuid, text, public.media_type, text, text, text, text, text,
  text, text, integer, integer, numeric, bigint, timestamptz
) to service_role;
