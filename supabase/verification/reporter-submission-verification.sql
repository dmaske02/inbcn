-- Run only against a disposable local database after all reporter migrations.
-- The transaction proves RPC-only draft mutation and the guarded draft-withdraw
-- transition with complete immutable event evidence, then rolls back.
\set ON_ERROR_STOP on

begin;

select id as reporter_test_language_id
from public.languages
where code = 'en' and is_active
limit 1
\gset

select id as reporter_test_category_id
from public.categories
where language_id = :'reporter_test_language_id' and is_active
order by id
limit 1
\gset

insert into auth.users (id, email, raw_app_meta_data)
values (
  '85000000-0000-4000-8000-000000000001',
  'reporter-submission-verification@example.invalid',
  '{"role":"reporter","reporter_access_generation":0}'::jsonb
);
insert into public.profiles (id, username, display_name, role)
values (
  '85000000-0000-4000-8000-000000000001',
  'reporter_submission_verifier',
  'Reporter Submission Verifier',
  'reporter'
);
insert into public.reporter_profiles (
  profile_id,
  public_slug,
  legal_display_name,
  avatar_url,
  home_city,
  home_district,
  home_state,
  membership_started_at,
  membership_expires_at,
  membership_grace_ends_at,
  public_photo_verified_by,
  public_photo_verified_at
) values (
  '85000000-0000-4000-8000-000000000001',
  'reporter_submission_verifier',
  'Reporter Submission Verifier',
  'https://example.invalid/reporter.jpg',
  'Mumbai',
  'Mumbai City',
  'Maharashtra',
  '2026-01-01T00:00:00Z',
  '2099-01-01T00:00:00Z',
  '2099-01-08T00:00:00Z',
  '85000000-0000-4000-8000-000000000001',
  clock_timestamp()
);

select set_config(
  'request.jwt.claims',
  '{"sub":"85000000-0000-4000-8000-000000000001","app_metadata":{"role":"reporter","reporter_access_generation":0}}',
  true
);
set local role authenticated;

do $$
declare
  active_language_id uuid := (
    select id from public.languages where code = 'en' and is_active limit 1
  );
  active_category_id uuid := (
    select id
    from public.categories
    where language_id = active_language_id and is_active
    order by id
    limit 1
  );
begin
  insert into public.stories (
    id, language_id, category_id, created_by, story_type, slug, title, summary, content
  ) values (
    '85000000-0000-4000-8000-000000000002',
    active_language_id,
    active_category_id,
    auth.uid(),
    'citizen_report',
    'reporter-direct-dml-must-fail',
    'Direct DML must fail',
    'Direct DML must fail',
    'Direct DML must fail'
  );
  raise exception 'reporter direct story insert was allowed';
exception
  when insufficient_privilege then null;
end;
$$;

select public.save_reporter_story_draft(
  '85000000-0000-4000-8000-000000000003',
  :'reporter_test_language_id',
  :'reporter_test_category_id',
  'Verified draft withdrawal',
  'The event snapshot must survive withdrawal.',
  'This disposable draft exercises the real guarded transition.',
  clock_timestamp() - interval '1 hour',
  '{}'::uuid[],
  null
);
select public.withdraw_reporter_story('85000000-0000-4000-8000-000000000003');

do $$
declare
  verified_story public.stories%rowtype;
  verified_revision public.story_revisions%rowtype;
begin
  select * into strict verified_story
  from public.stories
  where id = '85000000-0000-4000-8000-000000000003';
  select * into strict verified_revision
  from public.story_revisions
  where story_id = verified_story.id
  order by revision_number desc
  limit 1;

  if verified_story.status is distinct from 'rejected'
    or verified_revision.review_outcome is distinct from 'withdrawn'
    or (verified_revision.snapshot ->> 'event_occurred_at')::timestamptz
      is distinct from verified_story.event_occurred_at then
    raise exception 'draft withdrawal did not preserve canonical event evidence';
  end if;
end;
$$;

rollback;
