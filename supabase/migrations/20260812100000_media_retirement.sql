-- Media Library Phase 5, Milestone 8: retirement and restoration only.
-- Cloudinary objects and media rows are intentionally preserved.

create or replace function public.assert_story_featured_media_active()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_media public.media%rowtype;
begin
  if new.featured_media_id is null then
    return new;
  end if;

  select * into selected_media
  from public.media
  where id = new.featured_media_id
  for key share;

  if not found then
    raise exception using errcode = '23503', message = 'Featured media is unavailable';
  end if;
  if selected_media.deleted_at is not null then
    raise exception using errcode = '23514', message = 'Featured media is retired';
  end if;
  if selected_media.media_type <> 'image' then
    raise exception using errcode = '23514', message = 'Featured media must be an image';
  end if;
  return new;
end;
$$;

drop trigger if exists stories_featured_media_active on public.stories;
create trigger stories_featured_media_active
before insert or update of featured_media_id on public.stories
for each row execute function public.assert_story_featured_media_active();

create or replace function public.retire_media_asset(media_id uuid, expected_updated_at timestamptz)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  current_media public.media%rowtype;
  lifecycle_time timestamptz := clock_timestamp();
begin
  if actor_id is null or actor_role not in ('editor', 'admin') then
    raise exception using errcode = '42501', message = 'MEDIA_FORBIDDEN';
  end if;

  select * into current_media
  from public.media
  where id = media_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'MEDIA_NOT_FOUND';
  end if;
  if current_media.deleted_at is not null then
    raise exception using errcode = 'P0001', message = 'MEDIA_ALREADY_RETIRED';
  end if;
  if current_media.updated_at <> expected_updated_at then
    raise exception using errcode = '40001', message = 'MEDIA_CONFLICT';
  end if;
  if exists (
    select 1
    from public.stories
    where featured_media_id = media_id
  ) then
    raise exception using errcode = '23503', message = 'MEDIA_IN_USE';
  end if;

  update public.media
  set deleted_at = lifecycle_time,
      deleted_by = actor_id,
      updated_at = lifecycle_time,
      updated_by = actor_id
  where id = media_id;
  return 'retired';
end;
$$;

create or replace function public.restore_media_asset(media_id uuid, expected_updated_at timestamptz)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  current_media public.media%rowtype;
  lifecycle_time timestamptz := clock_timestamp();
begin
  if actor_id is null or actor_role not in ('editor', 'admin') then
    raise exception using errcode = '42501', message = 'MEDIA_FORBIDDEN';
  end if;

  select * into current_media
  from public.media
  where id = media_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'MEDIA_NOT_FOUND';
  end if;
  if current_media.deleted_at is null then
    raise exception using errcode = 'P0001', message = 'MEDIA_NOT_RETIRED';
  end if;
  if current_media.updated_at <> expected_updated_at then
    raise exception using errcode = '40001', message = 'MEDIA_CONFLICT';
  end if;

  update public.media
  set deleted_at = null,
      deleted_by = null,
      updated_at = lifecycle_time,
      updated_by = actor_id
  where id = media_id;
  return 'active';
end;
$$;

revoke delete on table public.media from authenticated;
revoke update on table public.media from authenticated;
grant update (
  story_id, created_by, title, original_filename, credit, updated_by,
  media_type, cloudinary_public_id, secure_url, resource_format, mime_type,
  alt_text, caption, width, height, duration_seconds, bytes, sort_order,
  metadata, updated_at
) on public.media to authenticated;

revoke all on function public.assert_story_featured_media_active() from public, anon, authenticated;
revoke all on function public.retire_media_asset(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.restore_media_asset(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.retire_media_asset(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.restore_media_asset(uuid, timestamptz) to authenticated, service_role;
