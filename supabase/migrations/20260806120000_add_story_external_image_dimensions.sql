alter table public.stories
  add column if not exists external_image_width integer,
  add column if not exists external_image_height integer;

alter table public.stories
  add constraint stories_external_image_width_positive
    check (external_image_width is null or external_image_width > 0),
  add constraint stories_external_image_height_positive
    check (external_image_height is null or external_image_height > 0);

comment on column public.stories.external_image_width is
  'Intrinsic pixel width captured during external image ingestion.';
comment on column public.stories.external_image_height is
  'Intrinsic pixel height captured during external image ingestion.';
