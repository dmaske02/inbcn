-- Media Library relationship foundation
--
-- Media assets may exist independently of a story and may be reused as the
-- featured image for multiple stories. Existing story-owned media remains
-- supported through the optional media.story_id relationship.

alter table public.stories
  drop constraint stories_featured_media_id_fkey;

alter table public.media
  drop constraint media_story_id_fkey;

alter table public.media
  alter column story_id drop not null;

alter table public.media
  add constraint media_story_id_fkey
  foreign key (story_id)
  references public.stories (id)
  on delete set null;

alter table public.stories
  add constraint stories_featured_media_id_fkey
  foreign key (featured_media_id)
  references public.media (id)
  on delete set null;

comment on column public.media.story_id is
  'Optional originating story for story-owned media; reusable library assets may be unassigned.';

comment on table public.media is
  'Cloudinary-backed media assets that may be attached to stories or reused from the media library.';

drop policy "Public can read media for published stories"
on public.media;

create policy "Public can read media for published stories"
on public.media
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.stories
    where stories.status = 'published'
      and (
        stories.id = media.story_id
        or stories.featured_media_id = media.id
      )
  )
);
