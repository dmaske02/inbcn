-- Associate published reporter stories with the existing anonymous-safe profile
-- projection without exposing the reporter account/profile UUID.

create function public.public_reporter(public.stories)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when $1.status = 'published'
      and public.is_reporter_story($1)
    then (
      select jsonb_build_object(
        'public_slug', public_reporter_profiles.public_slug,
        'legal_display_name', public_reporter_profiles.legal_display_name,
        'avatar_url', public_reporter_profiles.avatar_url,
        'public_status', public_reporter_profiles.public_status,
        'home_district', public_reporter_profiles.home_district,
        'bio', public_reporter_profiles.bio,
        'beats', public_reporter_profiles.beats
      )
      from public.public_reporter_profiles
      join public.reporter_profiles
        on reporter_profiles.public_slug = public_reporter_profiles.public_slug
      where reporter_profiles.profile_id = $1.created_by
    )
    else null
  end;
$$;

revoke all on function public.public_reporter(public.stories)
from public, anon, authenticated, service_role;

grant execute on function public.public_reporter(public.stories)
to anon, authenticated, service_role;

comment on function public.public_reporter(public.stories) is
  'Anonymous-safe computed reporter attribution for canonical published reporter stories.';
