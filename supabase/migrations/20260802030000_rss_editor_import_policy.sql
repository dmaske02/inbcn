create policy "Editors can import RSS article drafts"
on public.stories
for insert
to authenticated
with check (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'editor'
  and created_by = (select auth.uid())
  and story_type = 'external_article'
  and status = 'draft'
  and source_id is not null
  and exists (
    select 1
    from public.sources as ingestion_source
    where ingestion_source.id = stories.source_id
      and ingestion_source.source_type = 'rss'
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
