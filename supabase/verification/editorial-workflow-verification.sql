-- M10.1 verification for an isolated/disposable Supabase database only.
-- Run after all repository migrations. The transaction always rolls back.

begin;

do $$
begin
  if not public.is_story_public('published', statement_timestamp() - interval '1 second') then
    raise exception 'due published Story must be public';
  end if;
  if public.is_story_public('published', statement_timestamp() + interval '1 hour') then
    raise exception 'future published Story must not be public';
  end if;
  if public.is_story_public('draft', statement_timestamp())
    or public.is_story_public('pending_review', statement_timestamp())
    or public.is_story_public('approved', statement_timestamp())
    or public.is_story_public('scheduled', statement_timestamp())
    or public.is_story_public('rejected', statement_timestamp())
    or public.is_story_public('archived', statement_timestamp()) then
    raise exception 'non-published lifecycle states must not be public';
  end if;
end;
$$;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from pg_proc
  where oid = 'public.transition_story(uuid,text,timestamptz,timestamptz,text)'::regprocedure
    and prosecdef
    and proconfig @> array['search_path=""'];
  if v_count <> 1 then raise exception 'transition_story security contract is invalid'; end if;

  if has_function_privilege('anon', 'public.transition_story(uuid,text,timestamptz,timestamptz,text)', 'execute') then
    raise exception 'anon must not execute transition_story';
  end if;
  if not has_function_privilege('authenticated', 'public.transition_story(uuid,text,timestamptz,timestamptz,text)', 'execute') then
    raise exception 'authenticated must execute transition_story';
  end if;
  if has_table_privilege('authenticated', 'public.story_events', 'insert') then
    raise exception 'authenticated clients must not insert Story events';
  end if;
end;
$$;

-- Disposable authenticated fixtures exercise the RPC. These UUIDs are reserved for
-- this rollback-only script.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm10-editor@example.invalid', '', now(), '{"role":"editor"}', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm10-writer@example.invalid', '', now(), '{"role":"writer"}', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm10-admin@example.invalid', '', now(), '{"role":"admin"}', '{}', now(), now());

insert into public.profiles (id, username, display_name, role) values
  ('10000000-0000-4000-8000-000000000001', 'm10_editor', 'M10 Editor', 'editor'),
  ('10000000-0000-4000-8000-000000000002', 'm10_writer', 'M10 Writer', 'writer'),
  ('10000000-0000-4000-8000-000000000003', 'm10_admin', 'M10 Admin', 'admin');

do $$
declare
  v_definition text := pg_get_functiondef(
    'public.transition_story(uuid,text,timestamptz,timestamptz,text)'::regprocedure
  );
  v_required text;
begin
  foreach v_required in array array[
    'SUCCESS', 'NOT_FOUND', 'FORBIDDEN', 'CONFLICT', 'INVALID_TRANSITION',
    'INVALID_SCHEDULE', 'VALIDATION_ERROR', 'for update', 'auth.uid()',
    'story_events', 'send_back', 'cancel_schedule', 'unpublish'
  ] loop
    if position(lower(v_required) in lower(v_definition)) = 0 then
      raise exception 'transition_story is missing required behavior: %', v_required;
    end if;
  end loop;
end;
$$;

do $$
declare
  v_language uuid;
  v_category uuid;
  v_story uuid := '20000000-0000-4000-8000-000000000001';
  v_other_story uuid := '20000000-0000-4000-8000-000000000002';
  v_version timestamptz;
  v_result jsonb;
  v_events integer;
begin
  select languages.id, categories.id into v_language, v_category
  from public.languages
  join public.categories on categories.language_id = languages.id
  where languages.is_active and categories.is_active
  order by languages.code, categories.slug
  limit 1;
  if v_language is null or v_category is null then
    raise exception 'verification requires one active language/category pair';
  end if;

  insert into public.stories (
    id, language_id, category_id, created_by, story_type, status,
    slug, title, summary, content
  ) values
    (v_story, v_language, v_category, '10000000-0000-4000-8000-000000000002', 'staff_article', 'draft', 'm10-lifecycle-fixture', 'M10 lifecycle fixture', 'Verification summary', 'Verification content'),
    (v_other_story, v_language, v_category, '10000000-0000-4000-8000-000000000002', 'staff_article', 'draft', 'm10-other-fixture', 'M10 other fixture', 'Verification summary', 'Verification content');

  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', '10000000-0000-4000-8000-000000000002',
    'app_metadata', jsonb_build_object('role', 'writer')
  )::text, true);
  select updated_at into v_version from public.stories where id = v_story;
  v_result := public.transition_story(v_story, 'submit', v_version, null, null);
  if v_result->>'code' <> 'SUCCESS' then raise exception 'writer submit failed: %', v_result; end if;

  select updated_at into v_version from public.stories where id = v_other_story;
  v_result := public.transition_story(v_other_story, 'approve', v_version, null, null);
  if v_result->>'code' <> 'INVALID_TRANSITION' then raise exception 'writer approval was not rejected'; end if;

  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', '10000000-0000-4000-8000-000000000001',
    'app_metadata', jsonb_build_object('role', 'editor')
  )::text, true);

  select updated_at into v_version from public.stories where id = v_story;
  v_result := public.transition_story(v_story, 'approve', v_version, null, null);
  if v_result->>'code' <> 'SUCCESS' then raise exception 'approve failed: %', v_result; end if;
  select updated_at into v_version from public.stories where id = v_story;
  v_result := public.transition_story(v_story, 'publish', v_version, null, null);
  if v_result->>'code' <> 'SUCCESS' then raise exception 'publish failed: %', v_result; end if;
  select updated_at into v_version from public.stories where id = v_story;
  v_result := public.transition_story(v_story, 'unpublish', v_version, null, null);
  if v_result->>'code' <> 'SUCCESS' then raise exception 'unpublish failed: %', v_result; end if;
  select updated_at into v_version from public.stories where id = v_story;
  v_result := public.transition_story(v_story, 'schedule', v_version, statement_timestamp() + interval '2 hours', null);
  if v_result->>'code' <> 'SUCCESS' then raise exception 'schedule failed: %', v_result; end if;
  select updated_at into v_version from public.stories where id = v_story;
  v_result := public.transition_story(v_story, 'schedule', v_version, statement_timestamp() + interval '3 hours', null);
  if v_result->>'code' <> 'SUCCESS' then raise exception 'reschedule failed: %', v_result; end if;
  select updated_at into v_version from public.stories where id = v_story;
  v_result := public.transition_story(v_story, 'cancel_schedule', v_version, null, null);
  if v_result->>'code' <> 'SUCCESS' then raise exception 'cancel schedule failed: %', v_result; end if;
  select updated_at into v_version from public.stories where id = v_story;
  v_result := public.transition_story(v_story, 'archive', v_version, null, null);
  if v_result->>'code' <> 'SUCCESS' then raise exception 'approved archive failed: %', v_result; end if;

  -- Invalid terminal transitions and stale versions never append events.
  select count(*) into v_events from public.story_events where story_id = v_story;
  v_result := public.transition_story(v_story, 'publish', v_version, null, null);
  if v_result->>'code' <> 'CONFLICT' then raise exception 'stale transition did not conflict: %', v_result; end if;
  select count(*) into v_events from public.story_events where story_id = v_story and created_at is not null;
  if v_events <> 8 then raise exception 'expected exactly eight successful lifecycle events, got %', v_events; end if;
  select updated_at into v_version from public.stories where id = v_story;
  v_result := public.transition_story(v_story, 'publish', v_version, null, null);
  if v_result->>'code' <> 'INVALID_TRANSITION' then raise exception 'archived publish was not rejected'; end if;
  v_result := public.transition_story(v_story, 'send_back', v_version, null, null);
  if v_result->>'code' <> 'INVALID_TRANSITION' then raise exception 'archived send-back was not rejected'; end if;

  -- Rejection and recovery semantics.
  update public.stories set status = 'pending_review', submitted_at = now(), approved_by = null,
    approved_at = null, rejected_at = null, rejection_reason = null, scheduled_at = null,
    published_at = null, updated_at = clock_timestamp() where id = v_other_story;
  select updated_at into v_version from public.stories where id = v_other_story;
  v_result := public.transition_story(v_other_story, 'reject', v_version, null, '   ');
  if v_result->>'code' <> 'VALIDATION_ERROR' then raise exception 'blank rejection reason was accepted'; end if;
  v_result := public.transition_story(v_other_story, 'reject', v_version, null, repeat('x', 1001));
  if v_result->>'code' <> 'VALIDATION_ERROR' then raise exception 'over-limit rejection reason was accepted'; end if;
  v_result := public.transition_story(v_other_story, 'reject', v_version, null, E'unsafe\nreason');
  if v_result->>'code' <> 'VALIDATION_ERROR' then raise exception 'control character in rejection reason was accepted'; end if;
  v_result := public.transition_story(v_other_story, 'reject', v_version, null, 'Needs verification');
  if v_result->>'code' <> 'SUCCESS' then raise exception 'reject failed: %', v_result; end if;
  select updated_at into v_version from public.stories where id = v_other_story;
  v_result := public.transition_story(v_other_story, 'send_back', v_version, null, null);
  if v_result->>'code' <> 'SUCCESS' then raise exception 'send-back failed: %', v_result; end if;
  if exists (select 1 from public.stories where id = v_other_story and (status <> 'draft' or rejected_at is not null or rejection_reason is not null)) then
    raise exception 'send-back did not clear rejection fields';
  end if;

  -- Admin shortcuts are limited to direct publish/schedule, not draft archive.
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', '10000000-0000-4000-8000-000000000003',
    'app_metadata', jsonb_build_object('role', 'admin')
  )::text, true);
  select updated_at into v_version from public.stories where id = v_other_story;
  v_result := public.transition_story(v_other_story, 'archive', v_version, null, null);
  if v_result->>'code' <> 'INVALID_TRANSITION' then raise exception 'draft archive shortcut was not rejected'; end if;
  v_result := public.transition_story(v_other_story, 'publish', v_version, null, null);
  if v_result->>'code' <> 'SUCCESS' then raise exception 'admin direct publish failed: %', v_result; end if;

  -- Duplicate transition using the same version must conflict and add no event.
  v_result := public.transition_story(v_other_story, 'archive', v_version, null, null);
  if v_result->>'code' <> 'CONFLICT' then raise exception 'duplicate version did not conflict'; end if;
end;
$$;

-- RLS defense-in-depth: anon sees a due published fixture, never a future one.
do $$
declare
  v_language uuid;
  v_category uuid;
begin
  select languages.id, categories.id into v_language, v_category
  from public.languages join public.categories on categories.language_id = languages.id
  where languages.is_active and categories.is_active limit 1;
  insert into public.stories (
    id, language_id, category_id, story_type, status, slug, title, summary, content,
    approved_at, published_at
  ) values
    ('30000000-0000-4000-8000-000000000001', v_language, v_category, 'staff_article', 'published', 'm10-due-public', 'Due public', 'Summary', 'Content', now() - interval '2 hours', now() - interval '1 hour'),
    ('30000000-0000-4000-8000-000000000002', v_language, v_category, 'staff_article', 'published', 'm10-future-private', 'Future private', 'Summary', 'Content', now(), now() + interval '1 hour');
end;
$$;

set local role anon;
do $$
begin
  if (select count(*) from public.stories where id in ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002')) <> 1 then
    raise exception 'anonymous Story RLS did not enforce due publication';
  end if;
end;
$$;
reset role;

rollback;
