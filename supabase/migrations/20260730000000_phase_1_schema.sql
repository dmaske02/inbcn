-- INBCN Phase 1 database schema
-- RLS, policies, triggers, functions, and seed data are intentionally deferred.

create type public.story_type as enum (
  'aggregated',
  'staff_article',
  'citizen_report'
);

create type public.story_status as enum (
  'draft',
  'pending_review',
  'approved',
  'scheduled',
  'published',
  'rejected',
  'archived'
);

create type public.source_type as enum (
  'newsdata_api',
  'rss',
  'website',
  'social',
  'manual'
);

create type public.media_type as enum (
  'image',
  'video',
  'audio',
  'document'
);

create type public.profile_role as enum (
  'admin',
  'editor',
  'writer',
  'broadcaster',
  'reader'
);

create table public.languages (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  native_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint languages_code_key unique (code),
  constraint languages_code_format_check
    check (code ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  constraint languages_name_check check (length(btrim(name)) > 0),
  constraint languages_native_name_check check (length(btrim(native_name)) > 0)
);

comment on table public.languages is
  'Languages available for editorial content and reader preferences.';

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  language_id uuid not null,
  parent_id uuid,
  name text not null,
  slug text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint categories_language_id_fkey
    foreign key (language_id)
    references public.languages (id)
    on delete restrict,
  constraint categories_parent_language_fkey
    foreign key (parent_id, language_id)
    references public.categories (id, language_id)
    on delete restrict,
  constraint categories_id_language_id_key unique (id, language_id),
  constraint categories_language_slug_key unique (language_id, slug),
  constraint categories_name_check check (length(btrim(name)) > 0),
  constraint categories_slug_format_check
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint categories_sort_order_check check (sort_order >= 0),
  constraint categories_parent_check check (parent_id is null or parent_id <> id)
);

comment on table public.categories is
  'Localized, hierarchical editorial categories.';

create index categories_parent_id_idx
  on public.categories (parent_id)
  where parent_id is not null;

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  default_language_id uuid,
  name text not null,
  slug text not null,
  source_type public.source_type not null,
  website_url text,
  feed_url text,
  external_identifier text,
  is_active boolean not null default true,
  trust_score smallint,
  last_ingested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sources_default_language_id_fkey
    foreign key (default_language_id)
    references public.languages (id)
    on delete set null,
  constraint sources_slug_key unique (slug),
  constraint sources_external_identifier_key unique (external_identifier),
  constraint sources_name_check check (length(btrim(name)) > 0),
  constraint sources_slug_format_check
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint sources_website_url_check
    check (website_url is null or website_url ~ '^https?://'),
  constraint sources_feed_url_check
    check (feed_url is null or feed_url ~ '^https?://'),
  constraint sources_trust_score_check
    check (trust_score is null or trust_score between 0 and 100),
  constraint sources_feed_type_check
    check (source_type <> 'rss' or feed_url is not null)
);

comment on table public.sources is
  'External and manually managed origins used by the ingestion pipeline.';

create index sources_default_language_id_idx
  on public.sources (default_language_id)
  where default_language_id is not null;

create index sources_type_active_idx
  on public.sources (source_type, is_active);

create table public.profiles (
  id uuid primary key,
  preferred_language_id uuid,
  username text not null,
  display_name text not null,
  role public.profile_role not null default 'reader',
  bio text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_id_fkey
    foreign key (id)
    references auth.users (id)
    on delete cascade,
  constraint profiles_preferred_language_id_fkey
    foreign key (preferred_language_id)
    references public.languages (id)
    on delete set null,
  constraint profiles_username_key unique (username),
  constraint profiles_username_format_check
    check (username ~ '^[a-z0-9_]{3,32}$'),
  constraint profiles_display_name_check check (length(btrim(display_name)) > 0),
  constraint profiles_avatar_url_check
    check (avatar_url is null or avatar_url ~ '^https?://')
);

comment on table public.profiles is
  'Application profiles linked one-to-one with Supabase Auth users.';

create index profiles_role_active_idx
  on public.profiles (role, is_active);

create index profiles_preferred_language_id_idx
  on public.profiles (preferred_language_id)
  where preferred_language_id is not null;

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  translation_group_id uuid not null default gen_random_uuid(),
  language_id uuid not null,
  category_id uuid not null,
  source_id uuid,
  created_by uuid,
  approved_by uuid,
  story_type public.story_type not null,
  status public.story_status not null default 'draft',
  slug text not null,
  title text not null,
  summary text not null,
  content text not null,
  external_id text,
  external_url text,
  external_author text,
  featured_media_id uuid,
  seo_title text,
  seo_description text,
  seo_keywords text[] not null default '{}',
  canonical_url text,
  is_featured boolean not null default false,
  is_breaking boolean not null default false,
  is_sponsored boolean not null default false,
  submitted_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  scheduled_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint stories_language_id_fkey
    foreign key (language_id)
    references public.languages (id)
    on delete restrict,
  constraint stories_category_language_fkey
    foreign key (category_id, language_id)
    references public.categories (id, language_id)
    on delete restrict,
  constraint stories_source_id_fkey
    foreign key (source_id)
    references public.sources (id)
    on delete restrict,
  constraint stories_created_by_fkey
    foreign key (created_by)
    references public.profiles (id)
    on delete set null,
  constraint stories_approved_by_fkey
    foreign key (approved_by)
    references public.profiles (id)
    on delete set null,
  constraint stories_language_slug_key unique (language_id, slug),
  constraint stories_source_external_id_key unique (source_id, external_id),
  constraint stories_slug_format_check
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint stories_title_check check (length(btrim(title)) > 0),
  constraint stories_summary_check check (length(btrim(summary)) > 0),
  constraint stories_content_check check (length(btrim(content)) > 0),
  constraint stories_external_url_check
    check (external_url is null or external_url ~ '^https?://'),
  constraint stories_canonical_url_check
    check (canonical_url is null or canonical_url ~ '^https?://'),
  constraint stories_aggregated_origin_check
    check (
      story_type <> 'aggregated'
      or (source_id is not null and external_url is not null)
    ),
  constraint stories_review_status_check
    check (
      status not in ('approved', 'scheduled', 'published', 'archived')
      or approved_at is not null
    ),
  constraint stories_rejection_check
    check (
      status <> 'rejected'
      or (
        rejected_at is not null
        and rejection_reason is not null
        and length(btrim(rejection_reason)) > 0
      )
    ),
  constraint stories_schedule_check
    check (
      scheduled_at is null
      or status in ('scheduled', 'published', 'archived')
    ),
  constraint stories_scheduled_status_check
    check (status <> 'scheduled' or scheduled_at is not null),
  constraint stories_publication_check
    check (
      published_at is null
      or status in ('published', 'archived')
    ),
  constraint stories_published_status_check
    check (status <> 'published' or published_at is not null),
  constraint stories_timestamp_order_check
    check (
      (submitted_at is null or submitted_at >= created_at)
      and (approved_at is null or submitted_at is null or approved_at >= submitted_at)
      and (rejected_at is null or submitted_at is null or rejected_at >= submitted_at)
      and (published_at is null or approved_at is null or published_at >= approved_at)
    )
);

comment on table public.stories is
  'Multilingual news content for aggregation, staff publishing, and citizen reporting.';

comment on column public.stories.translation_group_id is
  'Shared UUID that groups equivalent stories across languages.';

comment on column public.stories.featured_media_id is
  'Added as a foreign key after media is created to avoid creation-order issues.';

create index stories_language_id_idx
  on public.stories (language_id);

create index stories_category_id_idx
  on public.stories (category_id);

create index stories_published_at_idx
  on public.stories (published_at desc)
  where published_at is not null;

create index stories_status_idx
  on public.stories (status);

create index stories_slug_idx
  on public.stories (slug);

create index stories_translation_group_id_idx
  on public.stories (translation_group_id);

create index stories_source_id_idx
  on public.stories (source_id)
  where source_id is not null;

create index stories_created_by_idx
  on public.stories (created_by)
  where created_by is not null;

create table public.media (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null,
  created_by uuid,
  media_type public.media_type not null,
  cloudinary_public_id text not null,
  secure_url text not null,
  resource_format text,
  mime_type text,
  alt_text text,
  caption text,
  width integer,
  height integer,
  duration_seconds numeric(12, 3),
  bytes bigint,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint media_story_id_fkey
    foreign key (story_id)
    references public.stories (id)
    on delete cascade,
  constraint media_created_by_fkey
    foreign key (created_by)
    references public.profiles (id)
    on delete set null,
  constraint media_cloudinary_public_id_key unique (cloudinary_public_id),
  constraint media_id_story_id_key unique (id, story_id),
  constraint media_cloudinary_public_id_check
    check (length(btrim(cloudinary_public_id)) > 0),
  constraint media_secure_url_check check (secure_url ~ '^https://'),
  constraint media_width_check check (width is null or width > 0),
  constraint media_height_check check (height is null or height > 0),
  constraint media_duration_check
    check (duration_seconds is null or duration_seconds >= 0),
  constraint media_bytes_check check (bytes is null or bytes >= 0),
  constraint media_sort_order_check check (sort_order >= 0),
  constraint media_alt_text_check
    check (
      media_type <> 'image'
      or (alt_text is not null and length(btrim(alt_text)) > 0)
    ),
  constraint media_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

comment on table public.media is
  'Cloudinary-backed media assets attached to stories.';

create index media_story_id_sort_order_idx
  on public.media (story_id, sort_order);

create index media_created_by_idx
  on public.media (created_by)
  where created_by is not null;

alter table public.stories
  add constraint stories_featured_media_id_fkey
  foreign key (featured_media_id, id)
  references public.media (id, story_id)
  on delete set null;

create index stories_featured_media_id_idx
  on public.stories (featured_media_id)
  where featured_media_id is not null;

create table public.ingest_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null,
  triggered_by uuid,
  status text not null default 'queued',
  items_fetched integer not null default 0,
  items_created integer not null default 0,
  items_updated integer not null default 0,
  items_failed integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ingest_runs_source_id_fkey
    foreign key (source_id)
    references public.sources (id)
    on delete restrict,
  constraint ingest_runs_triggered_by_fkey
    foreign key (triggered_by)
    references public.profiles (id)
    on delete set null,
  constraint ingest_runs_status_check
    check (status in ('queued', 'running', 'completed', 'partial', 'failed')),
  constraint ingest_runs_items_fetched_check check (items_fetched >= 0),
  constraint ingest_runs_items_created_check check (items_created >= 0),
  constraint ingest_runs_items_updated_check check (items_updated >= 0),
  constraint ingest_runs_items_failed_check check (items_failed >= 0),
  constraint ingest_runs_started_check
    check (status = 'queued' or started_at is not null),
  constraint ingest_runs_completed_check
    check (
      status not in ('completed', 'partial', 'failed')
      or completed_at is not null
    ),
  constraint ingest_runs_timestamp_order_check
    check (
      (started_at is null or started_at >= created_at)
      and (
        completed_at is null
        or (started_at is not null and completed_at >= started_at)
      )
    ),
  constraint ingest_runs_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

comment on table public.ingest_runs is
  'Operational history and item counts for each source ingestion run.';

create index ingest_runs_source_id_idx
  on public.ingest_runs (source_id);

create index ingest_runs_status_idx
  on public.ingest_runs (status);

create index ingest_runs_created_at_idx
  on public.ingest_runs (created_at desc);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid,
  language_id uuid not null,
  endpoint text not null,
  p256dh_key text not null,
  auth_key text not null,
  user_agent text,
  is_active boolean not null default true,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint push_subscriptions_profile_id_fkey
    foreign key (profile_id)
    references public.profiles (id)
    on delete cascade,
  constraint push_subscriptions_language_id_fkey
    foreign key (language_id)
    references public.languages (id)
    on delete restrict,
  constraint push_subscriptions_endpoint_key unique (endpoint),
  constraint push_subscriptions_endpoint_check
    check (endpoint ~ '^https://'),
  constraint push_subscriptions_p256dh_key_check
    check (length(btrim(p256dh_key)) > 0),
  constraint push_subscriptions_auth_key_check
    check (length(btrim(auth_key)) > 0),
  constraint push_subscriptions_expiry_check
    check (expires_at is null or expires_at > created_at),
  constraint push_subscriptions_last_used_check
    check (last_used_at is null or last_used_at >= created_at)
);

comment on table public.push_subscriptions is
  'Web Push endpoints for authenticated or anonymous readers.';

create index push_subscriptions_profile_id_idx
  on public.push_subscriptions (profile_id)
  where profile_id is not null;

create index push_subscriptions_language_id_active_idx
  on public.push_subscriptions (language_id, is_active);
