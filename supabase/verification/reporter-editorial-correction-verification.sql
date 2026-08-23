-- Run only against a disposable database after all reporter migrations.
-- The explicit correction path and immutable submitted evidence are rolled back.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_app_meta_data) values
  ('86000000-0000-4000-8000-000000000001', 'correction-editor@example.invalid', '{"role":"editor"}'::jsonb),
  ('86000000-0000-4000-8000-000000000002', 'correction-reporter@example.invalid', '{"role":"reporter","reporter_access_generation":0}'::jsonb);
insert into public.profiles (id, username, display_name, role) values
  ('86000000-0000-4000-8000-000000000001', 'correction_editor', 'Correction Editor', 'editor'),
  ('86000000-0000-4000-8000-000000000002', 'correction_reporter', 'Correction Reporter', 'reporter');
insert into public.reporter_profiles (
  profile_id, public_slug, legal_display_name, avatar_url,
  home_city, home_district, home_state,
  membership_started_at, membership_expires_at, membership_grace_ends_at,
  public_photo_verified_by, public_photo_verified_at
) values (
  '86000000-0000-4000-8000-000000000002', 'correction-reporter',
  'Correction Reporter', 'https://example.invalid/correction-reporter.jpg',
  'Mumbai', 'Mumbai City', 'Maharashtra',
  now() - interval '1 day', now() + interval '1 year', now() + interval '1 year 7 days',
  '86000000-0000-4000-8000-000000000001', now()
);

select id as correction_language_id
from public.languages where code = 'en' and is_active limit 1
\gset
select id as correction_category_id
from public.categories
where language_id = :'correction_language_id' and is_active
order by id limit 1
\gset

select set_config(
  'request.jwt.claims',
  '{"sub":"86000000-0000-4000-8000-000000000002","app_metadata":{"role":"reporter","reporter_access_generation":0}}',
  true
);
set local role authenticated;
select public.save_reporter_story_draft(
  '86000000-0000-4000-8000-000000000003',
  :'correction_language_id', :'correction_category_id',
  'Original submitted headline', 'Original summary', 'Original submitted body',
  now() - interval '1 hour', '{}'::uuid[], null
);
select public.submit_reporter_story(
  '86000000-0000-4000-8000-000000000003',
  19.076, 72.8777, 10, now(), 'Mumbai newsroom verification'
);

select id as correction_revision_id
from public.story_revisions
where story_id = '86000000-0000-4000-8000-000000000003'
order by revision_number desc limit 1
\gset
select set_config(
  'app.correction_expected_updated_at',
  (select updated_at::text from public.stories where id = '86000000-0000-4000-8000-000000000003'),
  true
);

select set_config(
  'request.jwt.claims',
  '{"sub":"86000000-0000-4000-8000-000000000001","app_metadata":{"role":"editor"}}',
  true
);
select public.correct_reporter_story(
  '86000000-0000-4000-8000-000000000003',
  :'correction_revision_id',
  current_setting('app.correction_expected_updated_at')::timestamptz,
  jsonb_build_object(
    'language_id', :'correction_language_id',
    'category_id', :'correction_category_id',
    'slug', 'editor-corrected-headline',
    'title', 'Editor corrected headline',
    'summary', 'Original summary',
    'content', 'Original submitted body',
    'featured_media_id', null,
    'seo_title', null,
    'seo_description', null,
    'seo_keywords', '[]'::jsonb
  ),
  'Corrected a factual error in the headline.'
);

do $$
declare
  canonical_title text;
  submitted_title text;
  generic_metadata jsonb;
  private_reason text;
  private_changed jsonb;
begin
  select title into strict canonical_title
  from public.stories
  where id = '86000000-0000-4000-8000-000000000003';
  select snapshot ->> 'title' into strict submitted_title
  from public.story_revisions
  where story_id = '86000000-0000-4000-8000-000000000003'
  order by revision_number desc limit 1;
  select audit_events.metadata, corrections.reason, to_jsonb(corrections.changed_fields)
  into strict generic_metadata, private_reason, private_changed
  from public.audit_events
  join private.reporter_story_corrections as corrections
    on corrections.id = (audit_events.metadata ->> 'correction_event_id')::uuid
  where audit_events.action = 'story.reporter_editorial_corrected'
    and audit_events.subject_id = '86000000-0000-4000-8000-000000000003'
  order by audit_events.created_at desc limit 1;
  if canonical_title is distinct from 'Editor corrected headline'
    or submitted_title is distinct from 'Original submitted headline'
    or private_reason is distinct from 'Corrected a factual error in the headline.'
    or private_changed is distinct from '["slug", "title"]'::jsonb
    or generic_metadata -> 'changed_fields' is distinct from private_changed
    or jsonb_object_length(generic_metadata) is distinct from 3
    or generic_metadata ? 'reason'
    or generic_metadata ?| array['latitude', 'longitude', 'accuracy'] then
    raise exception 'editor correction or immutable revision verification failed';
  end if;
end;
$$;

do $$
begin
  begin
    update private.reporter_story_corrections
    set reason = 'History must remain immutable.'
    where story_id = '86000000-0000-4000-8000-000000000003';
    raise exception 'private correction history unexpectedly changed';
  exception when object_not_in_prerequisite_state then
    if sqlerrm is distinct from 'REPORTER_CORRECTION_HISTORY_IMMUTABLE' then
      raise;
    end if;
  end;
end;
$$;

do $$
declare
  latest_revision_id uuid;
begin
  select id into strict latest_revision_id
  from public.story_revisions
  where story_id = '86000000-0000-4000-8000-000000000003'
  order by revision_number desc limit 1;
  begin
    perform public.correct_reporter_story(
      '86000000-0000-4000-8000-000000000003',
      latest_revision_id,
      current_setting('app.correction_expected_updated_at')::timestamptz,
      jsonb_build_object(
        'language_id', '86000000-0000-4000-8000-000000000010',
        'category_id', '86000000-0000-4000-8000-000000000011',
        'slug', 'stale-editor-overwrite',
        'title', 'Stale editor overwrite',
        'summary', 'Original summary',
        'content', 'Original submitted body',
        'featured_media_id', null,
        'seo_title', null,
        'seo_description', null,
        'seo_keywords', '[]'::jsonb
      ),
      'This stale correction must not overwrite the first correction.'
    );
    raise exception 'stale correction unexpectedly succeeded';
  exception when serialization_failure then
    if sqlerrm is distinct from 'REPORTER_CORRECTION_REVISION_CONFLICT' then
      raise;
    end if;
  end;
end;
$$;

rollback;
