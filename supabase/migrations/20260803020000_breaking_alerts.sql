-- Independent editorial breaking tickers, pinned alerts, and emergency banners.
create table public.breaking_alerts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  type text not null,
  placement text not null,
  status text not null default 'draft',
  is_active boolean not null default false,
  priority smallint not null default 50,
  target_scope text not null default 'global',
  language_id uuid not null references public.languages(id) on delete restrict,
  category_id uuid references public.categories(id) on delete restrict,
  story_id uuid references public.stories(id) on delete restrict,
  background_color text not null default '#B42318',
  text_color text not null default '#FFFFFF',
  dismissible boolean not null default true,
  start_at timestamptz not null default now(),
  end_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint breaking_alerts_title_check check (length(btrim(title)) between 1 and 180),
  constraint breaking_alerts_message_check check (length(btrim(message)) between 1 and 1000),
  constraint breaking_alerts_type_check check (type in ('breaking','alert','emergency')),
  constraint breaking_alerts_placement_check check (placement in ('breaking_ticker','pinned_banner','emergency_banner')),
  constraint breaking_alerts_status_check check (status in ('draft','active','archived')),
  constraint breaking_alerts_target_scope_check check (target_scope in ('global','category','story')),
  constraint breaking_alerts_priority_check check (priority between 1 and 100),
  constraint breaking_alerts_background_color_check check (background_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint breaking_alerts_text_color_check check (text_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint breaking_alerts_schedule_check check (end_at is null or end_at > start_at),
  constraint breaking_alerts_target_check check (
    (target_scope = 'global' and category_id is null and story_id is null)
    or (target_scope = 'category' and category_id is not null and story_id is null)
    or (target_scope = 'story' and story_id is not null and category_id is null)
  )
);

create index breaking_alerts_active_schedule_idx on public.breaking_alerts(status,is_active,start_at,end_at);
create index breaking_alerts_language_idx on public.breaking_alerts(language_id);
create index breaking_alerts_category_idx on public.breaking_alerts(category_id) where category_id is not null;
create index breaking_alerts_story_idx on public.breaking_alerts(story_id) where story_id is not null;
create index breaking_alerts_priority_idx on public.breaking_alerts(type,priority);
create index breaking_alerts_cms_pagination_idx on public.breaking_alerts(updated_at desc,id);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_breaking_alerts_updated_at
before update on public.breaking_alerts
for each row execute function public.set_updated_at();

alter table public.breaking_alerts enable row level security;
revoke all on table public.breaking_alerts from anon, authenticated;
grant select on table public.breaking_alerts to anon;
grant select,insert,update,delete on table public.breaking_alerts to authenticated;
grant all on table public.breaking_alerts to service_role;

create policy "Public can read visible breaking alerts" on public.breaking_alerts
for select to anon, authenticated
using (status = 'active' and is_active and start_at <= now() and (end_at is null or end_at > now()));

create policy "Editors can read all breaking alerts" on public.breaking_alerts
for select to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');

create policy "Editors can create breaking alerts" on public.breaking_alerts
for insert to authenticated
with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'editor' and created_by = (select auth.uid()));

create policy "Editors can update breaking alerts" on public.breaking_alerts
for update to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'editor')
with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');

create policy "Admins can manage breaking alerts" on public.breaking_alerts
for all to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
