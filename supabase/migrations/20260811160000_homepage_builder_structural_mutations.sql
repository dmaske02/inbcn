-- Add conflict-aware atomic duplication and deletion for the visual workspace.
create or replace function public.duplicate_homepage_section_after(
  source_section_id uuid,
  expected_updated_at timestamptz,
  expected_order uuid[],
  new_block_id text,
  new_title text
)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  current_row public.homepage_sections%rowtype;
  current_order uuid[];
  section_count integer;
  shifted_position integer;
  new_section_id uuid;
begin
  if coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') not in ('editor', 'admin') then
    raise exception 'Homepage Builder mutation forbidden';
  end if;

  select * into current_row
  from public.homepage_sections
  where id = source_section_id
  for update;
  if not found then raise exception 'Homepage section not found'; end if;

  perform 1
  from public.homepage_sections
  where homepage_configuration_id = current_row.homepage_configuration_id
  order by position
  for update;

  select array_agg(id order by position), count(*)
  into current_order, section_count
  from public.homepage_sections
  where homepage_configuration_id = current_row.homepage_configuration_id;

  if current_row.updated_at is distinct from expected_updated_at
    or current_order is distinct from expected_order then
    return null;
  end if;

  if exists (
    select 1 from (
      select position, row_number() over (order by position) - 1 as expected_position
      from public.homepage_sections
      where homepage_configuration_id = current_row.homepage_configuration_id
    ) ordered_sections where position <> expected_position
  ) then
    raise exception 'Section positions must be unique and contiguous';
  end if;

  shifted_position := section_count - 1;
  while shifted_position > current_row.position loop
    update public.homepage_sections
    set position = shifted_position + 1, updated_by = (select auth.uid())
    where homepage_configuration_id = current_row.homepage_configuration_id
      and position = shifted_position;
    shifted_position := shifted_position - 1;
  end loop;

  insert into public.homepage_sections (
    homepage_configuration_id,
    block_id,
    title,
    block_type,
    renderer,
    position,
    container,
    width,
    enabled,
    starts_at,
    ends_at,
    configuration,
    created_by,
    updated_by
  ) values (
    current_row.homepage_configuration_id,
    new_block_id,
    new_title,
    current_row.block_type,
    current_row.renderer,
    current_row.position + 1,
    current_row.container,
    current_row.width,
    current_row.enabled,
    current_row.starts_at,
    current_row.ends_at,
    current_row.configuration,
    (select auth.uid()),
    (select auth.uid())
  ) returning id into new_section_id;

  return new_section_id;
end;
$$;

create or replace function public.delete_homepage_section_if_current(
  section_id uuid,
  expected_updated_at timestamptz,
  expected_order uuid[]
)
returns boolean language plpgsql security invoker set search_path = public as $$
declare
  current_row public.homepage_sections%rowtype;
  current_order uuid[];
  section_count integer;
  shifted_position integer;
begin
  if coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') not in ('editor', 'admin') then
    raise exception 'Homepage Builder mutation forbidden';
  end if;

  select * into current_row
  from public.homepage_sections
  where id = section_id
  for update;
  if not found then raise exception 'Homepage section not found'; end if;

  perform 1
  from public.homepage_sections
  where homepage_configuration_id = current_row.homepage_configuration_id
  order by position
  for update;

  select array_agg(id order by position), count(*)
  into current_order, section_count
  from public.homepage_sections
  where homepage_configuration_id = current_row.homepage_configuration_id;

  if current_row.updated_at is distinct from expected_updated_at
    or current_order is distinct from expected_order then
    return false;
  end if;

  delete from public.homepage_sections where id = current_row.id;
  shifted_position := current_row.position + 1;
  while shifted_position < section_count loop
    update public.homepage_sections
    set position = shifted_position - 1, updated_by = (select auth.uid())
    where homepage_configuration_id = current_row.homepage_configuration_id
      and position = shifted_position;
    shifted_position := shifted_position + 1;
  end loop;

  return true;
end;
$$;

revoke all on function public.duplicate_homepage_section_after(uuid, timestamptz, uuid[], text, text) from public, anon;
revoke all on function public.delete_homepage_section_if_current(uuid, timestamptz, uuid[]) from public, anon;
grant execute on function public.duplicate_homepage_section_after(uuid, timestamptz, uuid[], text, text) to authenticated, service_role;
grant execute on function public.delete_homepage_section_if_current(uuid, timestamptz, uuid[]) to authenticated, service_role;
