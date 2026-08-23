-- Run only against a disposable local database after all migrations.
-- Every fixture and role assertion is rolled back.
\set ON_ERROR_STOP on

begin;

do $$
declare
  story_columns text[];
  expected_story_columns constant text[] := array[
    'id', 'translation_group_id', 'language_id', 'category_id', 'source_id',
    'external_author', 'story_type', 'slug', 'title', 'summary', 'content',
    'external_url', 'external_image_url', 'external_image_width',
    'external_image_height', 'featured_media_id', 'seo_title',
    'seo_description', 'seo_keywords', 'canonical_url', 'is_featured',
    'is_breaking', 'is_sponsored', 'status', 'published_at', 'updated_at',
    'search_document', 'is_reporter_story', 'public_reporter'
  ];
  media_columns text[];
  expected_media_columns constant text[] := array[
    'id', 'cloudinary_public_id', 'secure_url', 'alt_text', 'caption', 'width',
    'height'
  ];
  reporter_definition text;
  completion_definition text;
  binding_definition text;
begin
  select array_agg(attname order by attnum)
  into story_columns
  from pg_attribute
  where attrelid = 'public.public_stories'::regclass
    and attnum > 0
    and not attisdropped;
  if story_columns is distinct from expected_story_columns then
    raise exception 'public_stories columns differ: %', story_columns;
  end if;

  select array_agg(attname order by attnum)
  into media_columns
  from pg_attribute
  where attrelid = 'public.public_media'::regclass
    and attnum > 0
    and not attisdropped;
  if media_columns is distinct from expected_media_columns then
    raise exception 'public_media columns differ: %', media_columns;
  end if;

  if not exists (
    select 1 from pg_class
    where oid = 'public.public_stories'::regclass
      and reloptions @> array['security_barrier=true']
      and not coalesce(reloptions @> array['security_invoker=true'], false)
  ) or not exists (
    select 1 from pg_class
    where oid = 'public.public_media'::regclass
      and reloptions @> array['security_barrier=true']
      and not coalesce(reloptions @> array['security_invoker=true'], false)
  ) then
    raise exception 'public story/media views are not owner-executed security barriers';
  end if;

  if has_table_privilege('anon', 'public.stories', 'select')
    or has_any_column_privilege('anon', 'public.stories', 'select')
    or has_table_privilege('anon', 'public.media', 'select')
    or has_any_column_privilege('anon', 'public.media', 'select') then
    raise exception 'anon retains a base story/media SELECT privilege';
  end if;
  if not has_table_privilege('authenticated', 'public.stories', 'select')
    or not has_table_privilege('authenticated', 'public.media', 'select') then
    raise exception 'authenticated workflow base privileges were not preserved';
  end if;
  if not has_table_privilege('anon', 'public.public_stories', 'select')
    or not has_table_privilege('authenticated', 'public.public_stories', 'select')
    or not has_table_privilege('anon', 'public.public_media', 'select')
    or not has_table_privilege('authenticated', 'public.public_media', 'select')
    or has_table_privilege('service_role', 'public.public_media', 'select') then
    raise exception 'public safe-view grants differ';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'stories'
      and policyname in (
        'Public can read published stories',
        'Authenticated can read currently published stories'
      )
  ) or exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'media'
      and policyname in (
        'Public can read media for published stories',
        'Anonymous can read media for current public stories',
        'Authenticated can read media for current published stories'
      )
  ) then
    raise exception 'generic public base-table policy remains';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'stories'
      and policyname = 'Writers can read their own stories'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'stories'
      and policyname = 'Editors and admins can read all stories'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'stories'
      and policyname = 'Reporters can read their own stories'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'media'
      and policyname = 'Writers can read media for their own stories'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'media'
      and policyname = 'Editors and admins can manage all media'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'media'
      and policyname = 'Reporters can read their own canonical media'
  ) then
    raise exception 'a named staff/owner policy was removed';
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

  select pg_get_functiondef(
    'public.complete_reporter_media_upload(uuid,bigint,uuid,text,public.media_type,text,text,text,text,text,text,text,integer,integer,numeric,bigint,timestamptz)'::regprocedure
  ) into completion_definition;
  if completion_definition not like '%FOR UPDATE%'
    or completion_definition not like '%current_story.created_by is distinct from p_profile_id%'
    or completion_definition not like '%''inbcn/reporter/story/'' || p_story_id::text || ''/'' || object_id%'
    or completion_definition like '%''inbcn/reporter/story/'' || p_profile_id::text%'
    or completion_definition not like '%''uploadedBy'', p_profile_id%'
    or completion_definition not like '%existing_media.created_by is distinct from p_profile_id%' then
    raise exception 'reporter media completion ownership/path differs';
  end if;

  select pg_get_constraintdef(oid)
  into binding_definition
  from pg_constraint
  where conrelid = 'public.media'::regclass
    and conname = 'media_reporter_upload_binding_check';
  if binding_definition not like '%uploadedBy%created_by%'
    or binding_definition not like '%reporterStoryId%cloudinaryObjectId%' then
    raise exception 'reporter media binding constraint differs';
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

insert into auth.users (id, email)
values (
  '97000000-0000-4000-8000-000000000003',
  'public-media-legacy-owner@example.invalid'
);

insert into public.profiles (id, username, display_name, role)
values (
  '97000000-0000-4000-8000-000000000003',
  'public_media_legacy_owner',
  'Public Media Legacy Owner',
  'writer'
);

insert into public.stories (
  id, language_id, category_id, story_type, status, slug, title, summary,
  content, approved_at, published_at
) values
  (
    '95000000-0000-4000-8000-000000000001',
    :'public_story_test_language_id', :'public_story_test_category_id',
    'staff_article', 'published', 'verify-current-public-story',
    'Current public story', 'Current public story', 'Current public story',
    now() - interval '2 hours', now() - interval '1 hour'
  ),
  (
    '95000000-0000-4000-8000-000000000002',
    :'public_story_test_language_id', :'public_story_test_category_id',
    'staff_article', 'published', 'verify-future-public-story',
    'Future public story', 'Future public story', 'Future public story',
    now() - interval '1 hour', now() + interval '1 hour'
  ),
  (
    '95000000-0000-4000-8000-000000000003',
    :'public_story_test_language_id', :'public_story_test_category_id',
    'staff_article', 'approved', 'verify-unpublished-public-story',
    'Unpublished story', 'Unpublished story', 'Unpublished story',
    now() - interval '1 hour', null
  ),
  (
    '95000000-0000-4000-8000-000000000004',
    :'public_story_test_language_id', :'public_story_test_category_id',
    'staff_article', 'published', 'verify-legacy-media-public-story',
    'Legacy media public story', 'Legacy media public story',
    'Legacy media public story', now() - interval '2 hours',
    now() - interval '1 hour'
  ),
  (
    '95000000-0000-4000-8000-000000000005',
    :'public_story_test_language_id', :'public_story_test_category_id',
    'staff_article', 'published', 'verify-owner-url-public-story',
    'Owner URL public story', 'Owner URL public story',
    'Owner URL public story', now() - interval '2 hours',
    now() - interval '1 hour'
  );

insert into public.media (
  id, created_by, title, media_type, cloudinary_public_id, secure_url, alt_text,
  metadata
) values
  (
    '96000000-0000-4000-8000-000000000001', null, 'Current media', 'image',
    'verify/current', 'https://example.invalid/current.jpg', 'Current media',
    '{"privateEvidence":"must-not-leak"}'::jsonb
  ),
  (
    '96000000-0000-4000-8000-000000000002', null, 'Future media', 'image',
    'verify/future', 'https://example.invalid/future.jpg', 'Future media',
    '{"privateEvidence":"must-not-leak"}'::jsonb
  ),
  (
    '96000000-0000-4000-8000-000000000003', null, 'Unpublished media', 'image',
    'verify/unpublished', 'https://example.invalid/unpublished.jpg',
    'Unpublished media', '{"privateEvidence":"must-not-leak"}'::jsonb
  ),
  (
    '96000000-0000-4000-8000-000000000004',
    '97000000-0000-4000-8000-000000000003', 'Legacy reporter media', 'image',
    'inbcn/reporter/story/97000000-0000-4000-8000-000000000003/95000000-0000-4000-8000-000000000004/98000000-0000-4000-8000-000000000001',
    'https://example.invalid/inbcn/reporter/story/97000000-0000-4000-8000-000000000003/95000000-0000-4000-8000-000000000004/98000000-0000-4000-8000-000000000001.jpg',
    'Legacy reporter media',
    jsonb_build_object(
      'uploadedBy', '97000000-0000-4000-8000-000000000003',
      'reporterStoryId', '95000000-0000-4000-8000-000000000004',
      'cloudinaryObjectId', '98000000-0000-4000-8000-000000000001',
      'cloudinaryAssetId', 'legacy-asset'
    )
  ),
  (
    '96000000-0000-4000-8000-000000000005',
    '97000000-0000-4000-8000-000000000003',
    'Owner-bearing reporter URL', 'image',
    'inbcn/reporter/story/95000000-0000-4000-8000-000000000005/98000000-0000-4000-8000-000000000002',
    'https://example.invalid/inbcn/reporter/story/97000000-0000-4000-8000-000000000003/95000000-0000-4000-8000-000000000005/98000000-0000-4000-8000-000000000002.jpg',
    'Owner-bearing reporter URL',
    jsonb_build_object(
      'uploadedBy', '97000000-0000-4000-8000-000000000003',
      'reporterStoryId', '95000000-0000-4000-8000-000000000005',
      'cloudinaryObjectId', '98000000-0000-4000-8000-000000000002',
      'cloudinaryAssetId', 'owner-url-asset'
    )
  );

update public.stories
set featured_media_id = case id
  when '95000000-0000-4000-8000-000000000001' then '96000000-0000-4000-8000-000000000001'::uuid
  when '95000000-0000-4000-8000-000000000002' then '96000000-0000-4000-8000-000000000002'::uuid
  when '95000000-0000-4000-8000-000000000003' then '96000000-0000-4000-8000-000000000003'::uuid
  when '95000000-0000-4000-8000-000000000004' then '96000000-0000-4000-8000-000000000004'::uuid
  else '96000000-0000-4000-8000-000000000005'::uuid
end
where id in (
  '95000000-0000-4000-8000-000000000001',
  '95000000-0000-4000-8000-000000000002',
  '95000000-0000-4000-8000-000000000003',
  '95000000-0000-4000-8000-000000000004',
  '95000000-0000-4000-8000-000000000005'
);

set local role anon;

do $$
declare
  visible_story_ids uuid[];
  visible_media_ids uuid[];
begin
  select array_agg(id order by id) into visible_story_ids
  from public.public_stories
  where id between '95000000-0000-4000-8000-000000000001'
    and '95000000-0000-4000-8000-000000000005';
  if visible_story_ids is distinct from array[
    '95000000-0000-4000-8000-000000000001'::uuid,
    '95000000-0000-4000-8000-000000000004'::uuid,
    '95000000-0000-4000-8000-000000000005'::uuid
  ] then
    raise exception 'anon safe story visibility differs: %', visible_story_ids;
  end if;

  select array_agg(id order by id) into visible_media_ids
  from public.public_media
  where id between '96000000-0000-4000-8000-000000000001'
    and '96000000-0000-4000-8000-000000000005';
  if visible_media_ids is distinct from array[
    '96000000-0000-4000-8000-000000000001'::uuid
  ] then
    raise exception 'anon safe media visibility differs: %', visible_media_ids;
  end if;
  if exists (
    select 1 from public.public_media
    where id = '96000000-0000-4000-8000-000000000004'
  ) then
    raise exception 'legacy reporter media reached public_media';
  end if;
  if exists (
    select 1 from public.public_media
    where id = '96000000-0000-4000-8000-000000000005'
  ) then
    raise exception 'owner-bearing reporter URL reached public_media';
  end if;
end;
$$;

do $$ begin
  perform id from public.stories limit 1;
  raise exception 'anon base stories SELECT was allowed';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  perform id from public.media limit 1;
  raise exception 'anon base media SELECT was allowed';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  perform created_by from public.public_stories limit 1;
  raise exception 'public_stories exposed created_by';
exception when undefined_column then null;
end $$;

do $$ begin
  perform metadata from public.public_media limit 1;
  raise exception 'public_media exposed metadata';
exception when undefined_column then null;
end $$;

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"97000000-0000-4000-8000-000000000001","app_metadata":{}}',
  true
);
set local role authenticated;

do $$
declare
  visible_count integer;
begin
  select count(*) into visible_count
  from public.public_stories
  where id between '95000000-0000-4000-8000-000000000001'
    and '95000000-0000-4000-8000-000000000005';
  if visible_count <> 3 then
    raise exception 'ordinary authenticated safe story visibility differs: %', visible_count;
  end if;

  select count(*) into visible_count
  from public.public_media
  where id between '96000000-0000-4000-8000-000000000001'
    and '96000000-0000-4000-8000-000000000005';
  if visible_count <> 1 then
    raise exception 'ordinary authenticated safe media visibility differs: %', visible_count;
  end if;

  perform created_by, approved_by from public.stories
  where id between '95000000-0000-4000-8000-000000000001'
    and '95000000-0000-4000-8000-000000000005';
  get diagnostics visible_count = row_count;
  if visible_count <> 0 then
    raise exception 'ordinary authenticated user read protected story rows';
  end if;

  perform created_by, metadata from public.media
  where id between '96000000-0000-4000-8000-000000000001'
    and '96000000-0000-4000-8000-000000000005';
  get diagnostics visible_count = row_count;
  if visible_count <> 0 then
    raise exception 'ordinary authenticated user read protected media rows';
  end if;
end;
$$;

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"97000000-0000-4000-8000-000000000002","app_metadata":{"role":"editor"}}',
  true
);
set local role authenticated;

do $$
declare
  visible_count integer;
begin
  select count(*) into visible_count from public.stories
  where id between '95000000-0000-4000-8000-000000000001'
    and '95000000-0000-4000-8000-000000000005';
  if visible_count <> 5 then
    raise exception 'editor story policy was not preserved: %', visible_count;
  end if;

  select count(*) into visible_count from public.media
  where id between '96000000-0000-4000-8000-000000000001'
    and '96000000-0000-4000-8000-000000000005';
  if visible_count <> 5 then
    raise exception 'editor media policy was not preserved: %', visible_count;
  end if;
end;
$$;

reset role;
rollback;
