\set ON_ERROR_STOP on

begin;

do $$
declare
  actual_columns text[];
  expected_columns constant text[] := array[
    'id', 'translation_group_id', 'language_id', 'category_id', 'source_id',
    'external_author', 'story_type', 'slug', 'title', 'summary', 'content',
    'external_url', 'external_image_url', 'external_image_width',
    'external_image_height', 'featured_media_id', 'seo_title',
    'seo_description', 'seo_keywords', 'canonical_url', 'is_featured',
    'is_breaking', 'is_sponsored', 'status', 'published_at', 'updated_at',
    'search_document', 'is_reporter_story', 'public_reporter'
  ];
  media_columns text[];
  reporter_definition text;
begin
  select array_agg(attname order by attnum)
  into actual_columns
  from pg_attribute
  where attrelid = 'public.public_stories'::regclass
    and attnum > 0
    and not attisdropped;

  if actual_columns is distinct from expected_columns then
    raise exception 'public_stories columns differ: %', actual_columns;
  end if;

  if not exists (
    select 1
    from pg_class
    where oid = 'public.public_stories'::regclass
      and reloptions @> array['security_barrier=true']
      and not coalesce(reloptions @> array['security_invoker=true'], false)
  ) then
    raise exception 'public_stories is not an owner-executed security-barrier view';
  end if;

  if has_table_privilege('anon', 'public.stories', 'select')
    or has_any_column_privilege('anon', 'public.stories', 'select') then
    raise exception 'anon retains base stories SELECT';
  end if;
  if not has_table_privilege('anon', 'public.public_stories', 'select')
    or not has_table_privilege('authenticated', 'public.public_stories', 'select') then
    raise exception 'public_stories client-role grants differ';
  end if;
  if not has_table_privilege('authenticated', 'public.stories', 'select') then
    raise exception 'authenticated base stories SELECT was not preserved';
  end if;

  select array_agg(column_name order by column_name)
  into media_columns
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name = 'media'
    and grantee = 'anon'
    and privilege_type = 'SELECT';
  if media_columns is distinct from array[
    'alt_text', 'caption', 'cloudinary_public_id', 'height', 'id',
    'secure_url', 'width'
  ] then
    raise exception 'anon media columns differ: %', media_columns;
  end if;
  if has_table_privilege('anon', 'public.media', 'select')
    or has_column_privilege('anon', 'public.media', 'created_by', 'select')
    or has_column_privilege('anon', 'public.media', 'metadata', 'select') then
    raise exception 'anon retains protected media SELECT';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'stories'
      and policyname = 'Authenticated can read currently published stories'
      and roles = array['authenticated']::name[]
      and qual like '%published_at IS NOT NULL%'
      and qual like '%published_at <= now()%'
  ) or exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'stories'
      and policyname = 'Public can read published stories'
  ) then
    raise exception 'stories current-publication policy differs';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'media'
      and policyname = 'Anonymous can read media for current public stories'
      and roles = array['anon']::name[]
      and qual like '%public_stories%'
  ) or not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'media'
      and policyname = 'Authenticated can read media for current published stories'
      and roles = array['authenticated']::name[]
      and qual like '%published_at <= now()%'
  ) then
    raise exception 'media current-publication policies differ';
  end if;

  select pg_get_functiondef('public.public_reporter(public.stories)'::regprocedure)
  into reporter_definition;
  if reporter_definition not like '%SECURITY DEFINER%'
    or reporter_definition not like '%SET search_path TO %'
    or reporter_definition not like '%$1.published_at is not null%'
    or reporter_definition not like '%$1.published_at <= now()%'
    or reporter_definition not like '%public.is_reporter_story($1)%' then
    raise exception 'public_reporter publication guard differs';
  end if;
end;
$$;

select id as public_story_test_language_id
from public.languages
where code = 'en' and is_active
limit 1
\gset

select id as public_story_test_category_id
from public.categories
where language_id = :'public_story_test_language_id' and is_active
order by id
limit 1
\gset

insert into public.stories (
  id, language_id, category_id, story_type, status, slug, title, summary,
  content, approved_at, published_at
) values
  (
    '95000000-0000-4000-8000-000000000001',
    :'public_story_test_language_id',
    :'public_story_test_category_id',
    'staff_article', 'published', 'verify-current-public-story',
    'Current public story', 'Current public story', 'Current public story',
    now() - interval '2 hours', now() - interval '1 hour'
  ),
  (
    '95000000-0000-4000-8000-000000000002',
    :'public_story_test_language_id',
    :'public_story_test_category_id',
    'staff_article', 'published', 'verify-future-public-story',
    'Future public story', 'Future public story', 'Future public story',
    now() - interval '1 hour', now() + interval '1 hour'
  ),
  (
    '95000000-0000-4000-8000-000000000003',
    :'public_story_test_language_id',
    :'public_story_test_category_id',
    'staff_article', 'approved', 'verify-unpublished-public-story',
    'Unpublished story', 'Unpublished story', 'Unpublished story',
    now() - interval '1 hour', null
  );

set local role anon;

do $$
declare
  visible_ids uuid[];
begin
  select array_agg(id order by id)
  into visible_ids
  from public.public_stories
  where id in (
    '95000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-000000000002',
    '95000000-0000-4000-8000-000000000003'
  );
  if visible_ids is distinct from array[
    '95000000-0000-4000-8000-000000000001'::uuid
  ] then
    raise exception 'anon story visibility differs: %', visible_ids;
  end if;
end;
$$;

do $$
begin
  perform id from public.stories limit 1;
  raise exception 'anon base stories SELECT was allowed';
exception
  when insufficient_privilege then null;
end;
$$;

do $$
begin
  perform created_by from public.public_stories limit 1;
  raise exception 'public_stories exposed created_by';
exception
  when undefined_column then null;
end;
$$;

do $$
begin
  perform created_by from public.media limit 1;
  raise exception 'anon media created_by SELECT was allowed';
exception
  when insufficient_privilege then null;
end;
$$;

select id, cloudinary_public_id, secure_url, alt_text, caption, width, height
from public.media
limit 0;

reset role;
set local role authenticated;

do $$
declare
  visible_count integer;
  safe_view_count integer;
begin
  select count(*)
  into visible_count
  from public.stories
  where id in (
    '95000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-000000000002',
    '95000000-0000-4000-8000-000000000003'
  );
  if visible_count <> 1 then
    raise exception 'authenticated public story visibility differs: %', visible_count;
  end if;
  select count(*)
  into safe_view_count
  from public.public_stories
  where id in (
    '95000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-000000000002',
    '95000000-0000-4000-8000-000000000003'
  );
  if safe_view_count <> 1 then
    raise exception 'authenticated safe-view visibility differs: %', safe_view_count;
  end if;
  perform created_by
  from public.stories
  where id = '95000000-0000-4000-8000-000000000001';
end;
$$;

reset role;
rollback;
