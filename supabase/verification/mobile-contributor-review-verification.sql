-- Fixture writes roll back. Run after the mobile upload migrations.
begin;
do $$
<<mobile_upload_verification>>
declare
  owner_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  story_id uuid := gen_random_uuid();
  result jsonb;
  updated timestamptz;
  language_id uuid;
  category_id uuid;
begin
  select l.id, c.id into strict language_id, category_id
  from public.languages l join public.categories c on c.language_id = l.id
  where l.is_active and c.is_active and l.code = 'en' limit 1;
  insert into auth.users(id) values (owner_id), (other_id);
  insert into public.profiles(id, username, display_name, role)
  values (owner_id, 'test_' || left(replace(owner_id::text, '-', ''), 24), 'Upload test', 'reader'),
    (other_id, 'test_' || left(replace(other_id::text, '-', ''), 24), 'Editor test', 'editor');
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  perform public.save_mobile_contributor_story_draft(story_id, language_id, category_id,
    'Upload test', 'Summary', 'Content', now(), '{}'::uuid[], null);
  perform public.submit_mobile_contributor_story(story_id, 22, 88, 10, now(), 'Test locality');
  begin
    perform public.get_reporter_story_review(story_id);
    raise exception 'Contributor could read private staff review';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', other_id, 'role', 'authenticated',
    'app_metadata', jsonb_build_object('role', 'editor'))::text, true);
  result := public.get_reporter_story_review(story_id);
  if result->'reporter' is distinct from 'null'::jsonb
    or result->'latest_revision'->'snapshot'->>'title' <> 'Upload test'
    or result->'private_location'->>'locality' <> 'Test locality' then
    raise exception 'Contributor evidence is unavailable to editor';
  end if;
  select updated_at into updated from public.stories where id = mobile_upload_verification.story_id;
  result := public.transition_story(story_id, 'approve', updated, null, null);
  if result->>'code' <> 'SUCCESS' then raise exception 'Approval failed: %', result->>'code'; end if;
  select updated_at into updated from public.stories where id = mobile_upload_verification.story_id;
  result := public.transition_story(story_id, 'publish', updated, null, null);
  if result->>'code' <> 'SUCCESS' then raise exception 'Publish failed: %', result->>'code'; end if;

end;
$$;
rollback;
