-- Add atomic target-index ordering for the visual Homepage Builder workspace.
create or replace function public.move_homepage_section_to(section_id uuid, target_position integer)
returns void language plpgsql security invoker set search_path = public as $$
declare
  current_row public.homepage_sections%rowtype;
  section_count integer;
  sentinel_position integer;
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

  select count(*) into section_count
  from public.homepage_sections
  where homepage_configuration_id = current_row.homepage_configuration_id;

  if target_position < 0 or target_position >= section_count then
    raise exception 'Homepage section target position is out of bounds';
  end if;

  if exists (
    select 1
    from (
      select position, row_number() over (order by position) - 1 as expected_position
      from public.homepage_sections
      where homepage_configuration_id = current_row.homepage_configuration_id
    ) ordered_sections
    where position <> expected_position
  ) then
    raise exception 'Section positions must be unique and contiguous';
  end if;

  if current_row.position = target_position then return; end if;

  sentinel_position := section_count;
  update public.homepage_sections
  set position = sentinel_position, updated_by = (select auth.uid())
  where id = current_row.id;

  if current_row.position < target_position then
    shifted_position := current_row.position + 1;
    while shifted_position <= target_position loop
      update public.homepage_sections
      set position = shifted_position - 1, updated_by = (select auth.uid())
      where homepage_configuration_id = current_row.homepage_configuration_id
        and position = shifted_position;
      shifted_position := shifted_position + 1;
    end loop;
  else
    shifted_position := current_row.position - 1;
    while shifted_position >= target_position loop
      update public.homepage_sections
      set position = shifted_position + 1, updated_by = (select auth.uid())
      where homepage_configuration_id = current_row.homepage_configuration_id
        and position = shifted_position;
      shifted_position := shifted_position - 1;
    end loop;
  end if;

  update public.homepage_sections
  set position = target_position, updated_by = (select auth.uid())
  where id = current_row.id;
end;
$$;

revoke all on function public.move_homepage_section_to(uuid, integer) from public, anon;
grant execute on function public.move_homepage_section_to(uuid, integer) to authenticated, service_role;
