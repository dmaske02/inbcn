-- Make the anonymous story/media surface explicit. The public story view is
-- owner-executed by design, so its fixed projection and current-publication
-- predicate are the security boundary rather than base-table RLS.

create or replace function public.public_reporter(public.stories)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when $1.status = 'published'
      and $1.published_at is not null
      and $1.published_at <= now()
      and public.is_reporter_story($1)
    then (
      select jsonb_build_object(
        'public_slug', public_reporter_profiles.public_slug,
        'legal_display_name', public_reporter_profiles.legal_display_name,
        'avatar_url', public_reporter_profiles.avatar_url,
        'public_status', public_reporter_profiles.public_status,
        'home_district', public_reporter_profiles.home_district,
        'bio', public_reporter_profiles.bio,
        'beats', public_reporter_profiles.beats
      )
      from public.public_reporter_profiles
      join public.reporter_profiles
        on reporter_profiles.public_slug = public_reporter_profiles.public_slug
      where reporter_profiles.profile_id = $1.created_by
    )
    else null
  end;
$$;

create view public.public_stories
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
  stories.featured_media_id,
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

revoke all on table public.public_stories
from public, anon, authenticated, service_role;
grant select on table public.public_stories to anon, authenticated;

revoke all on table public.stories from public, anon;

drop policy "Public can read published stories" on public.stories;
create policy "Authenticated can read currently published stories"
on public.stories
for select
to authenticated
using (
  status = 'published'
  and published_at is not null
  and published_at <= now()
);

revoke all on table public.media from public;
revoke all on table public.media from anon;
grant select (
  id,
  cloudinary_public_id,
  secure_url,
  alt_text,
  caption,
  width,
  height
) on table public.media to anon;

drop policy "Public can read media for published stories" on public.media;
create policy "Anonymous can read media for current public stories"
on public.media
for select
to anon
using (
  exists (
    select 1
    from public.public_stories
    where public_stories.id = media.story_id
      or public_stories.featured_media_id = media.id
  )
);

create policy "Authenticated can read media for current published stories"
on public.media
for select
to authenticated
using (
  exists (
    select 1
    from public.stories
    where stories.status = 'published'
      and stories.published_at is not null
      and stories.published_at <= now()
      and (
        stories.id = media.story_id
        or stories.featured_media_id = media.id
      )
  )
);

comment on view public.public_stories is
  'Owner-executed anonymous story projection; its fixed columns and current-publication WHERE clause are the security boundary.';
