-- Publish only video assets that belong to the immutable revision which most
-- recently reached publication. Keep this projection separate from
-- public_media so featured_media_id remains image-only.

create view public.public_story_videos
with (security_barrier = true)
as
select
  media.id,
  public_stories.id as story_id,
  media.secure_url,
  media.mime_type,
  media.width,
  media.height,
  media.duration_seconds,
  associated_media.position::integer as position
from public.public_stories
cross join lateral (
  select story_revisions.associated_media_ids
  from public.story_revisions
  where story_revisions.story_id = public_stories.id
    and story_revisions.review_outcome in ('published', 'direct_published')
  order by story_revisions.revision_number desc
  limit 1
) as latest_revision
cross join lateral unnest(latest_revision.associated_media_ids)
  with ordinality as associated_media(id, position)
join public.media
  on media.id = associated_media.id
  and media.story_id = public_stories.id
where media.media_type = 'video'
  and media.deleted_at is null
  and media.secure_url ~ '^https://'
  and media.mime_type ~ '^video/'
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

revoke all on table public.public_story_videos
from public, anon, authenticated, service_role;
grant select on table public.public_story_videos to anon, authenticated;

comment on view public.public_story_videos is
  'Owner-executed public projection of canonical video assets from the latest published story revision; fixed columns and reporter delivery-path predicates form the security boundary.';
