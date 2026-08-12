-- Localized Live TV provider configuration and scheduling persistence.
create table public.live_streams (
  id uuid primary key default gen_random_uuid(),
  language_id uuid not null references public.languages(id) on delete restrict,
  internal_name text not null,
  title text not null,
  description text not null,
  provider text not null,
  provider_stream_id text,
  stream_url text,
  external_watch_url text,
  poster_url text,
  poster_alt_text text,
  status text not null default 'draft',
  autoplay boolean not null default false,
  muted boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  offline_message text,
  related_category_id uuid references public.categories(id) on delete restrict,
  related_story_id uuid references public.stories(id) on delete restrict,
  seo_title text,
  seo_description text,
  social_image_url text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint live_streams_id_language_id_key unique (id, language_id),
  constraint live_streams_internal_name_check
    check (length(btrim(internal_name)) between 1 and 160),
  constraint live_streams_title_check
    check (length(btrim(title)) between 1 and 180),
  constraint live_streams_description_check
    check (length(btrim(description)) between 1 and 2000),
  constraint live_streams_provider_check
    check (provider in ('youtube', 'hls')),
  constraint live_streams_provider_configuration_check check (
    (
      provider = 'youtube'
      and provider_stream_id ~ '^[A-Za-z0-9_-]{11}$'
      and stream_url is null
    )
    or (
      provider = 'hls'
      and provider_stream_id is null
      and stream_url is not null
      and stream_url ~* '^https://[^[:space:]]+\.m3u8(?:[?#][^[:space:]]*)?$'
    )
  ),
  constraint live_streams_status_check
    check (status in ('draft', 'scheduled', 'live', 'offline', 'archived')),
  constraint live_streams_autoplay_muted_check
    check (not autoplay or muted),
  constraint live_streams_schedule_check
    check (ends_at is null or (starts_at is not null and ends_at > starts_at)),
  constraint live_streams_scheduled_start_check
    check (status <> 'scheduled' or starts_at is not null),
  constraint live_streams_stream_url_check
    check (stream_url is null or stream_url ~ '^https://'),
  constraint live_streams_external_watch_url_check
    check (external_watch_url is null or external_watch_url ~ '^https://'),
  constraint live_streams_poster_url_check
    check (poster_url is null or poster_url ~ '^https://'),
  constraint live_streams_poster_alt_text_check check (
    poster_url is null
    or (poster_alt_text is not null and length(btrim(poster_alt_text)) between 1 and 300)
  ),
  constraint live_streams_offline_message_check
    check (offline_message is null or length(btrim(offline_message)) between 1 and 500),
  constraint live_streams_seo_title_check
    check (seo_title is null or length(btrim(seo_title)) between 1 and 180),
  constraint live_streams_seo_description_check
    check (seo_description is null or length(btrim(seo_description)) between 1 and 500),
  constraint live_streams_social_image_url_check
    check (social_image_url is null or social_image_url ~ '^https://')
);

comment on table public.live_streams is
  'Localized Live TV provider configuration, lifecycle state, and schedule.';

create unique index live_streams_one_live_per_language_idx
  on public.live_streams(language_id)
  where status = 'live';

create index live_streams_public_schedule_idx
  on public.live_streams(language_id, status, starts_at, ends_at);

create index live_streams_language_idx
  on public.live_streams(language_id);

create index live_streams_status_idx
  on public.live_streams(status);

create index live_streams_provider_idx
  on public.live_streams(provider);

create index live_streams_cms_pagination_idx
  on public.live_streams(updated_at desc, id);

create index live_streams_related_category_idx
  on public.live_streams(related_category_id)
  where related_category_id is not null;

create index live_streams_related_story_idx
  on public.live_streams(related_story_id)
  where related_story_id is not null;

create trigger set_live_streams_updated_at
before update on public.live_streams
for each row execute function public.set_updated_at();

alter table public.live_streams enable row level security;

revoke all on table public.live_streams from anon, authenticated;
grant select on table public.live_streams to anon;
grant select, insert, update, delete on table public.live_streams to authenticated;
grant all on table public.live_streams to service_role;

create policy "Public can read visible live streams"
on public.live_streams
for select
to anon, authenticated
using (
  status in ('live', 'scheduled', 'offline')
  and (
    status = 'offline'
    or (status = 'scheduled' and starts_at > now())
    or (
      status = 'live'
      and (starts_at is null or starts_at <= now())
      and (ends_at is null or ends_at > now())
    )
  )
);

create policy "Editors can read all live streams"
on public.live_streams
for select
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');

create policy "Editors can create live streams"
on public.live_streams
for insert
to authenticated
with check (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'editor'
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
);

create policy "Editors can update live streams"
on public.live_streams
for update
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'editor')
with check (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'editor'
  and updated_by = (select auth.uid())
);

create policy "Admins can manage live streams"
on public.live_streams
for all
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
