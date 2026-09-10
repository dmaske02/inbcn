-- Public projection of one active, published Hero ID. Editorial tables remain private.
create or replace function public.get_public_homepage_hero(requested_locale text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  with selected as (
    select s.configuration ->> 'storyId' as story_id, l.id as language_id
    from public.languages l
    join public.homepage_configurations c on c.language_id = l.id
    join public.homepage_sections s on s.homepage_configuration_id = c.id
    where requested_locale in ('en', 'hi', 'mr')
      and l.code = requested_locale and l.is_active
      and s.block_type = 'hero-story' and s.enabled
      and (s.starts_at is null or s.starts_at <= now())
      and (s.ends_at is null or s.ends_at > now())
    order by s.position, s.id
    limit 1
  )
  select p.id
  from selected h
  join public.public_stories p on p.id::text = h.story_id and p.language_id = h.language_id
  where p.status = 'published' and p.published_at is not null and p.published_at <= now()
  limit 1;
$$;
revoke all on function public.get_public_homepage_hero(text) from public;
grant execute on function public.get_public_homepage_hero(text) to anon, authenticated, service_role;
