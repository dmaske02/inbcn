-- Add the minimum schema required for manually reviewed NewsData.io imports.
-- Existing editorial stories, publication timestamps, and RLS policies remain
-- unchanged. Imported articles are always inserted as private drafts.

alter table public.stories
  add column external_published_at timestamptz,
  add column external_image_url text;

alter table public.stories
  add constraint stories_external_image_url_check
    check (external_image_url is null or external_image_url ~ '^https?://'),
  add constraint stories_external_article_origin_check
    check (
      story_type <> 'external_article'
      or (source_id is not null and external_url is not null)
    );

comment on column public.stories.external_published_at is
  'Original publication timestamp supplied by an external content provider.';

comment on column public.stories.external_image_url is
  'Temporary provider-hosted image URL; no Cloudinary ownership is implied.';

alter table public.sources
  add column country text,
  add column ingestion_priority smallint not null default 50;

alter table public.sources
  add constraint sources_country_check
    check (country is null or country ~ '^[a-z]{2}$'),
  add constraint sources_ingestion_priority_check
    check (ingestion_priority between 1 and 100);

comment on column public.sources.country is
  'Optional ISO 3166-1 alpha-2 country filter sent to the provider.';

comment on column public.sources.ingestion_priority is
  'Manual ingestion order where 1 is highest priority and 100 is lowest.';

-- NewsData links are normalized before persistence. This index complements the
-- existing (source_id, external_id) constraint and closes concurrent-import
-- races when the provider article id is unavailable.
create unique index stories_source_external_url_external_article_key
  on public.stories (source_id, external_url)
  where source_id is not null
    and external_url is not null
    and story_type = 'external_article';

create policy "Editors can import external article drafts"
on public.stories
for insert
to authenticated
with check (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'editor'
  and created_by = (select auth.uid())
  and story_type = 'external_article'
  and status = 'draft'
  and source_id is not null
  and external_url is not null
  and exists (
    select 1
    from public.sources as ingestion_source
    where ingestion_source.id = stories.source_id
      and ingestion_source.source_type = 'newsdata_api'
      and ingestion_source.is_active
  )
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
