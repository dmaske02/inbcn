-- INBCN Phase 1 Row Level Security
-- Application roles are read from signed app_metadata, never user_metadata.

alter table public.languages enable row level security;
alter table public.categories enable row level security;
alter table public.sources enable row level security;
alter table public.stories enable row level security;
alter table public.profiles enable row level security;
alter table public.media enable row level security;
alter table public.ingest_runs enable row level security;
alter table public.push_subscriptions enable row level security;

-- Replace Supabase's broad default API grants with the minimum operations
-- required by the policies below. TRUNCATE is intentionally never granted.
revoke all on table
  public.languages,
  public.categories,
  public.sources,
  public.stories,
  public.profiles,
  public.media,
  public.ingest_runs,
  public.push_subscriptions
from anon, authenticated;

grant select on table
  public.languages,
  public.categories,
  public.sources,
  public.stories,
  public.media
to anon;

grant select, insert, update, delete on table
  public.languages,
  public.categories,
  public.sources,
  public.stories,
  public.profiles,
  public.media,
  public.ingest_runs,
  public.push_subscriptions
to authenticated;

grant all on table
  public.languages,
  public.categories,
  public.sources,
  public.stories,
  public.profiles,
  public.media,
  public.ingest_runs,
  public.push_subscriptions
to service_role;

-- Languages

create policy "Public can read enabled languages"
on public.languages
for select
to anon, authenticated
using (is_active);

create policy "Admins can manage languages"
on public.languages
for all
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
)
with check (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

-- Categories

create policy "Public can read active categories"
on public.categories
for select
to anon, authenticated
using (is_active);

create policy "Admins can manage categories"
on public.categories
for all
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
)
with check (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

-- Sources

create policy "Public can read active source metadata"
on public.sources
for select
to anon, authenticated
using (is_active);

create policy "Editors and admins can manage sources"
on public.sources
for all
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') in ('editor', 'admin')
)
with check (
  (select auth.jwt() -> 'app_metadata' ->> 'role') in ('editor', 'admin')
);

-- Profiles

create policy "Users can read their own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy "Users can update their own profile without changing access"
on public.profiles
for update
to authenticated
using (
  (select auth.uid()) = id
  and is_active
)
with check (
  (select auth.uid()) = id
  and is_active
  and role::text = coalesce(
    (select auth.jwt() -> 'app_metadata' ->> 'role'),
    'reader'
  )
);

create policy "Admins can manage all profiles"
on public.profiles
for all
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
)
with check (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

-- Stories

create policy "Public can read published stories"
on public.stories
for select
to anon, authenticated
using (status = 'published');

create policy "Writers can read their own stories"
on public.stories
for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'writer'
  and created_by = (select auth.uid())
);

create policy "Editors and admins can read all stories"
on public.stories
for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') in ('editor', 'admin')
);

create policy "Writers can create draft stories"
on public.stories
for insert
to authenticated
with check (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'writer'
  and created_by = (select auth.uid())
  and story_type in ('staff_article', 'citizen_report')
  and status = 'draft'
  and source_id is null
  and approved_by is null
  and submitted_at is null
  and approved_at is null
  and rejected_at is null
  and rejection_reason is null
  and scheduled_at is null
  and published_at is null
  and featured_media_id is null
  and not is_featured
  and not is_breaking
  and not is_sponsored
);

create policy "Writers can update and submit only their own drafts"
on public.stories
for update
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'writer'
  and created_by = (select auth.uid())
  and status = 'draft'
)
with check (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'writer'
  and created_by = (select auth.uid())
  and story_type in ('staff_article', 'citizen_report')
  and (
    (status = 'draft' and submitted_at is null)
    or (status = 'pending_review' and submitted_at is not null)
  )
  and source_id is null
  and approved_by is null
  and approved_at is null
  and rejected_at is null
  and rejection_reason is null
  and scheduled_at is null
  and published_at is null
  and not is_featured
  and not is_breaking
  and not is_sponsored
);

create policy "Editors can review and publish stories"
on public.stories
for update
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'editor'
)
with check (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'editor'
);

create policy "Admins can manage all stories"
on public.stories
for all
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
)
with check (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

-- Media

create policy "Public can read media for published stories"
on public.media
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.stories
    where stories.id = media.story_id
      and stories.status = 'published'
  )
);

create policy "Writers can read media for their own stories"
on public.media
for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'writer'
  and exists (
    select 1
    from public.stories
    where stories.id = media.story_id
      and stories.created_by = (select auth.uid())
  )
);

create policy "Writers can add media to their own drafts"
on public.media
for insert
to authenticated
with check (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'writer'
  and created_by = (select auth.uid())
  and exists (
    select 1
    from public.stories
    where stories.id = media.story_id
      and stories.created_by = (select auth.uid())
      and stories.status = 'draft'
  )
);

create policy "Writers can update media on their own drafts"
on public.media
for update
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'writer'
  and created_by = (select auth.uid())
  and exists (
    select 1
    from public.stories
    where stories.id = media.story_id
      and stories.created_by = (select auth.uid())
      and stories.status = 'draft'
  )
)
with check (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'writer'
  and created_by = (select auth.uid())
  and exists (
    select 1
    from public.stories
    where stories.id = media.story_id
      and stories.created_by = (select auth.uid())
      and stories.status = 'draft'
  )
);

create policy "Writers can delete media from their own drafts"
on public.media
for delete
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'writer'
  and created_by = (select auth.uid())
  and exists (
    select 1
    from public.stories
    where stories.id = media.story_id
      and stories.created_by = (select auth.uid())
      and stories.status = 'draft'
  )
);

create policy "Editors and admins can manage all media"
on public.media
for all
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') in ('editor', 'admin')
)
with check (
  (select auth.jwt() -> 'app_metadata' ->> 'role') in ('editor', 'admin')
);

-- Ingest runs

create policy "Editors and admins can manage ingest runs"
on public.ingest_runs
for all
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') in ('editor', 'admin')
)
with check (
  (select auth.jwt() -> 'app_metadata' ->> 'role') in ('editor', 'admin')
);

-- Push subscriptions

create policy "Users can read their own push subscriptions"
on public.push_subscriptions
for select
to authenticated
using (
  profile_id = (select auth.uid())
);

create policy "Users can create their own push subscriptions"
on public.push_subscriptions
for insert
to authenticated
with check (
  profile_id = (select auth.uid())
);

create policy "Users can update their own push subscriptions"
on public.push_subscriptions
for update
to authenticated
using (
  profile_id = (select auth.uid())
)
with check (
  profile_id = (select auth.uid())
);

create policy "Users can delete their own push subscriptions"
on public.push_subscriptions
for delete
to authenticated
using (
  profile_id = (select auth.uid())
);

create policy "Admins can read all push subscriptions"
on public.push_subscriptions
for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);
