-- Run only against a disposable local database after all migrations.
-- Automated scenarios roll back. Concurrency scenarios require two psql sessions.
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('80000000-0000-4000-8000-000000000001', 'm8-editor@example.invalid'),
  ('80000000-0000-4000-8000-000000000002', 'm8-admin@example.invalid'),
  ('80000000-0000-4000-8000-000000000003', 'm8-writer@example.invalid');
insert into public.profiles (id, username, display_name, role) values
  ('80000000-0000-4000-8000-000000000001', 'm8_editor', 'M8 Editor', 'editor'),
  ('80000000-0000-4000-8000-000000000002', 'm8_admin', 'M8 Admin', 'admin'),
  ('80000000-0000-4000-8000-000000000003', 'm8_writer', 'M8 Writer', 'writer');
insert into public.languages (id, code, name, native_name) values
  ('81000000-0000-4000-8000-000000000001', 'zz', 'M8 Test', 'M8 Test');
insert into public.categories (id, language_id, name, slug) values
  ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'M8 Category', 'm8-category');
insert into public.stories (id, language_id, category_id, created_by, story_type, slug, title, summary, content)
values ('83000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', 'staff_article', 'm8-story', 'M8 Story', 'Summary', 'Content');
insert into public.media (id, story_id, created_by, media_type, cloudinary_public_id, secure_url, alt_text)
values
  ('84000000-0000-4000-8000-000000000001', null, '80000000-0000-4000-8000-000000000001', 'image', 'm8/unused', 'https://example.invalid/unused.jpg', 'Unused'),
  ('84000000-0000-4000-8000-000000000002', null, '80000000-0000-4000-8000-000000000001', 'image', 'm8/used', 'https://example.invalid/used.jpg', 'Used'),
  ('84000000-0000-4000-8000-000000000003', null, '80000000-0000-4000-8000-000000000001', 'image', 'm8/admin', 'https://example.invalid/admin.jpg', 'Admin');
update public.stories set featured_media_id = '84000000-0000-4000-8000-000000000002' where id = '83000000-0000-4000-8000-000000000001';

-- writer denied
select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000003","app_metadata":{"role":"writer"}}', true);
do $$ begin
  perform public.retire_media_asset('84000000-0000-4000-8000-000000000001', (select updated_at from public.media where id='84000000-0000-4000-8000-000000000001'));
  raise exception 'writer denial was not enforced';
exception when insufficient_privilege then null; end $$;

-- editor succeeds; unused media retired; stale expected_updated_at; restore
select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000001","app_metadata":{"role":"editor"}}', true);
select public.retire_media_asset('84000000-0000-4000-8000-000000000001', (select updated_at from public.media where id='84000000-0000-4000-8000-000000000001'));
do $$ begin
  perform public.restore_media_asset('84000000-0000-4000-8000-000000000001', '2000-01-01T00:00:00Z');
  raise exception 'stale expected_updated_at was not enforced';
exception when serialization_failure then null; end $$;
select public.restore_media_asset('84000000-0000-4000-8000-000000000001', (select updated_at from public.media where id='84000000-0000-4000-8000-000000000001'));

-- referenced media denied
do $$ begin
  perform public.retire_media_asset('84000000-0000-4000-8000-000000000002', (select updated_at from public.media where id='84000000-0000-4000-8000-000000000002'));
  raise exception 'referenced media denial was not enforced';
exception when foreign_key_violation then null; end $$;

-- admin succeeds
select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000002","app_metadata":{"role":"admin"}}', true);
select public.retire_media_asset('84000000-0000-4000-8000-000000000003', (select updated_at from public.media where id='84000000-0000-4000-8000-000000000003'));

-- retired media cannot be assigned
do $$ begin
  update public.stories set featured_media_id='84000000-0000-4000-8000-000000000003' where id='83000000-0000-4000-8000-000000000001';
  raise exception 'retired assignment was not rejected';
exception when check_violation then null; end $$;

-- direct lifecycle update denied; direct delete denied
set local role authenticated;
do $$ begin update public.media set deleted_at=now(),deleted_by=auth.uid() where id='84000000-0000-4000-8000-000000000001'; raise exception 'direct lifecycle update allowed'; exception when insufficient_privilege then null; end $$;
do $$ begin delete from public.media where id='84000000-0000-4000-8000-000000000001'; raise exception 'direct delete allowed'; exception when insufficient_privilege then null; end $$;
reset role;

rollback;

-- Explicit two-session concurrency verification (run each pair in separate psql sessions).
-- assignment wins / SESSION A:
--   begin; update public.stories set featured_media_id = :'media_id' where id = :'story_id';
-- assignment wins / SESSION B (blocks, then returns MEDIA_IN_USE after A commits):
--   begin; select public.retire_media_asset(:'media_id', :'updated_at');
-- retirement wins / SESSION A:
--   begin; select public.retire_media_asset(:'media_id', :'updated_at');
-- retirement wins / SESSION B (blocks, then trigger rejects after A commits):
--   begin; update public.stories set featured_media_id = :'media_id' where id = :'story_id';
-- simultaneous retirement / SESSION A and SESSION B:
--   begin; select public.retire_media_asset(:'media_id', :'updated_at');
-- Commit SESSION A; SESSION B must return MEDIA_ALREADY_RETIRED.
-- Rollback both sessions and remove their disposable fixtures.
