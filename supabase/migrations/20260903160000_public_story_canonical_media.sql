-- Preserve the fixed anonymous story projection while resolving the effective
-- public image from the immutable revision that reached publication. Explicit
-- editorial featured media remains authoritative. The existing public_media
-- view continues to enforce the reporter delivery-path safety checks and to
-- expose only its fixed, non-private media columns.

create or replace view public.public_stories
with (security_barrier = true)
as
select
  stories.id,
  stories.translation_group_id,
  stories.language_id,
  stories.category_id,
  stories.source_id,
  stories.external_author,
  stories.story_type,
  stories.slug,
  stories.title,
  stories.summary,
  stories.content,
  stories.external_url,
  stories.external_image_url,
  stories.external_image_width,
  stories.external_image_height,
  coalesce(
    stories.featured_media_id,
    (
      select media.id
      from (
        select story_revisions.associated_media_ids
        from public.story_revisions
        where story_revisions.story_id = stories.id
          and story_revisions.review_outcome in ('published', 'direct_published')
        order by story_revisions.revision_number desc
        limit 1
      ) as latest_revision
      cross join lateral unnest(latest_revision.associated_media_ids)
        with ordinality as associated_media(id, position)
      join public.media on media.id = associated_media.id
      where media.story_id = stories.id
        and media.media_type = 'image'
        and media.deleted_at is null
        and media.secure_url ~ '^https://'
      order by associated_media.position
      limit 1
    )
  ) as featured_media_id,
  stories.seo_title,
  stories.seo_description,
  stories.seo_keywords,
  stories.canonical_url,
  stories.is_featured,
  stories.is_breaking,
  stories.is_sponsored,
  stories.status,
  stories.published_at,
  stories.updated_at,
  stories.search_document,
  public.is_reporter_story(stories) as is_reporter_story,
  public.public_reporter(stories) as public_reporter
from public.stories
where stories.status = 'published'
  and stories.published_at is not null
  and stories.published_at <= now();

comment on view public.public_stories is
  'Owner-executed anonymous story projection with an effective public image selected from explicit featured media or the latest published canonical reporter revision.';
