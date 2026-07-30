-- Associate each source with the category used when ingestion cannot classify
-- an item more specifically.

alter table public.sources
  add column default_category_id uuid;

alter table public.sources
  add constraint sources_default_category_language_fkey
  foreign key (default_category_id, default_language_id)
  references public.categories (id, language_id)
  on delete restrict;

create index sources_default_category_id_idx
  on public.sources (default_category_id)
  where default_category_id is not null;

comment on column public.sources.default_category_id is
  'Localized fallback category assigned to newly ingested stories.';
