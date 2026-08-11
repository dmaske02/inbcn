-- Localized, ordered Homepage Builder foundation. No public homepage integration.
create table public.homepage_configurations (
  id uuid primary key default gen_random_uuid(),
  language_id uuid not null references public.languages(id) on delete restrict,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (language_id)
);

create table public.homepage_sections (
  id uuid primary key default gen_random_uuid(),
  homepage_configuration_id uuid not null references public.homepage_configurations(id) on delete cascade,
  block_id text not null,
  title text not null,
  block_type text not null,
  renderer text not null,
  position integer not null,
  container text not null default 'main',
  width text not null default 'full',
  enabled boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  configuration jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (homepage_configuration_id, position),
  unique (homepage_configuration_id, block_id),
  constraint homepage_sections_block_id_check check (length(btrim(block_id)) between 1 and 120),
  constraint homepage_sections_title_check check (length(btrim(title)) between 1 and 180),
  constraint homepage_sections_block_type_check check (length(btrim(block_type)) between 1 and 80),
  constraint homepage_sections_renderer_check check (length(btrim(renderer)) between 1 and 120),
  constraint homepage_sections_position_check check (position >= 0),
  constraint homepage_sections_container_check check (container in ('main', 'sidebar', 'footer')),
  constraint homepage_sections_width_check check (width in ('full', 'half', 'third', 'quarter')),
  constraint homepage_sections_configuration_check check (jsonb_typeof(configuration) = 'object'),
  constraint homepage_sections_schedule_check check (ends_at is null or (starts_at is not null and ends_at > starts_at))
);

create index homepage_sections_order_idx on public.homepage_sections(homepage_configuration_id, position);
create index homepage_sections_visibility_idx on public.homepage_sections(homepage_configuration_id, enabled, starts_at, ends_at);
create index homepage_sections_cms_idx on public.homepage_sections(updated_at desc, id);

create trigger set_homepage_configurations_updated_at before update on public.homepage_configurations
for each row execute function public.set_updated_at();
create trigger set_homepage_sections_updated_at before update on public.homepage_sections
for each row execute function public.set_updated_at();

alter table public.homepage_configurations enable row level security;
alter table public.homepage_sections enable row level security;
revoke all on table public.homepage_configurations, public.homepage_sections from anon, authenticated;
grant select on table public.homepage_configurations, public.homepage_sections to authenticated;
grant insert, update, delete on table public.homepage_configurations, public.homepage_sections to authenticated;
grant all on table public.homepage_configurations, public.homepage_sections to service_role;

create policy "Editorial users can read homepage configurations" on public.homepage_configurations
for select to authenticated using ((select auth.jwt() -> 'app_metadata' ->> 'role') in ('writer', 'editor', 'admin'));
create policy "Managers can create homepage configurations" on public.homepage_configurations
for insert to authenticated with check ((select auth.jwt() -> 'app_metadata' ->> 'role') in ('editor', 'admin') and created_by = (select auth.uid()) and updated_by = (select auth.uid()));
create policy "Managers can update homepage configurations" on public.homepage_configurations
for update to authenticated using ((select auth.jwt() -> 'app_metadata' ->> 'role') in ('editor', 'admin'))
with check ((select auth.jwt() -> 'app_metadata' ->> 'role') in ('editor', 'admin') and updated_by = (select auth.uid()));
create policy "Managers can delete homepage configurations" on public.homepage_configurations
for delete to authenticated using ((select auth.jwt() -> 'app_metadata' ->> 'role') in ('editor', 'admin'));

create policy "Editorial users can read homepage sections" on public.homepage_sections
for select to authenticated using ((select auth.jwt() -> 'app_metadata' ->> 'role') in ('writer', 'editor', 'admin'));
create policy "Managers can create homepage sections" on public.homepage_sections
for insert to authenticated with check ((select auth.jwt() -> 'app_metadata' ->> 'role') in ('editor', 'admin') and created_by = (select auth.uid()) and updated_by = (select auth.uid()));
create policy "Managers can update homepage sections" on public.homepage_sections
for update to authenticated using ((select auth.jwt() -> 'app_metadata' ->> 'role') in ('editor', 'admin'))
with check ((select auth.jwt() -> 'app_metadata' ->> 'role') in ('editor', 'admin') and updated_by = (select auth.uid()));
create policy "Managers can delete homepage sections" on public.homepage_sections
for delete to authenticated using ((select auth.jwt() -> 'app_metadata' ->> 'role') in ('editor', 'admin'));

create or replace function public.move_homepage_section(section_id uuid, direction text)
returns void language plpgsql security invoker set search_path = public as $$
declare
  current_row public.homepage_sections%rowtype;
  target_position integer;
  target_id uuid;
  sentinel_position integer;
begin
  if (select auth.jwt() -> 'app_metadata' ->> 'role') not in ('editor', 'admin') then raise exception 'Homepage Builder mutation forbidden'; end if;
  if direction not in ('up', 'down') then raise exception 'Invalid move direction'; end if;
  select * into current_row from public.homepage_sections where id = section_id for update;
  if not found then raise exception 'Homepage section not found'; end if;
  perform 1 from public.homepage_sections where homepage_configuration_id = current_row.homepage_configuration_id for update;
  target_position := current_row.position + case when direction = 'up' then -1 else 1 end;
  select id into target_id from public.homepage_sections where homepage_configuration_id = current_row.homepage_configuration_id and position = target_position;
  if target_id is null then return; end if;
  select coalesce(max(position), 0) + 1 into sentinel_position from public.homepage_sections where homepage_configuration_id = current_row.homepage_configuration_id;
  update public.homepage_sections set position = sentinel_position where id = current_row.id;
  update public.homepage_sections set position = current_row.position where id = target_id;
  update public.homepage_sections set position = target_position where id = current_row.id;
end;
$$;

create or replace function public.delete_homepage_section(section_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare deleted_row public.homepage_sections%rowtype;
begin
  if (select auth.jwt() -> 'app_metadata' ->> 'role') not in ('editor', 'admin') then raise exception 'Homepage Builder mutation forbidden'; end if;
  select * into deleted_row from public.homepage_sections where id = section_id for update;
  if not found then raise exception 'Homepage section not found'; end if;
  delete from public.homepage_sections where id = section_id;
  update public.homepage_sections set position = position - 1
  where homepage_configuration_id = deleted_row.homepage_configuration_id and position > deleted_row.position;
end;
$$;

revoke all on function public.move_homepage_section(uuid, text), public.delete_homepage_section(uuid) from public, anon;
grant execute on function public.move_homepage_section(uuid, text), public.delete_homepage_section(uuid) to authenticated, service_role;
