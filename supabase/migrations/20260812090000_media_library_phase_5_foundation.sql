-- INBCN Media Library Phase 5: canonical metadata foundation
--
-- This migration extends public.media in place. Existing provider identifiers,
-- story relationships, ordering, UUIDs, and legacy JSON metadata are retained.

alter table public.media
  add column if not exists title text,
  add column if not exists original_filename text,
  add column if not exists credit text,
  add column if not exists updated_by uuid,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

-- Promote searchable/display metadata without changing or removing the legacy
-- JSON object. Malformed individual values fall through to safe existing data.
update public.media
set
  title = coalesce(
    nullif(btrim(title), ''),
    nullif(btrim(metadata ->> 'title'), ''),
    nullif(btrim(alt_text), ''),
    nullif(btrim(metadata ->> 'originalFilename'), ''),
    cloudinary_public_id
  ),
  original_filename = coalesce(
    nullif(btrim(original_filename), ''),
    nullif(btrim(metadata ->> 'originalFilename'), '')
  ),
  credit = coalesce(
    nullif(btrim(credit), ''),
    nullif(btrim(metadata ->> 'credit'), '')
  );

alter table public.media
  alter column title set not null,
  add constraint media_title_check
    check (length(btrim(title)) > 0),
  add constraint media_updated_by_fkey
    foreign key (updated_by)
    references public.profiles (id)
    on delete set null,
  add constraint media_deleted_by_fkey
    foreign key (deleted_by)
    references public.profiles (id)
    on delete set null,
  add constraint media_deletion_audit_check
    check (
      (deleted_at is null and deleted_by is null)
      or (deleted_at is not null and deleted_by is not null)
    );

comment on column public.media.title is
  'Canonical editorial title, backfilled from legacy metadata with safe fallbacks.';
comment on column public.media.original_filename is
  'Original upload filename promoted from legacy metadata for display and search.';
comment on column public.media.credit is
  'Canonical optional editorial credit promoted from legacy metadata.';
comment on column public.media.updated_by is
  'Profile that most recently updated canonical media metadata, when known.';
comment on column public.media.deleted_at is
  'Retirement timestamp; null identifies active media.';
comment on column public.media.deleted_by is
  'Profile that retired the media row; present whenever deleted_at is present.';

create index if not exists media_active_type_created_id_idx
  on public.media (media_type, deleted_at, created_at desc, id desc)
  where deleted_at is null;
