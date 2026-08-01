-- Add a maintained multilingual search document without changing existing
-- story content, relationships, or row-level security policies.
alter table public.stories
  add column search_document tsvector;

create function public.set_story_search_document()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_document :=
    setweight(
      to_tsvector('simple'::regconfig, coalesce(new.title, '')),
      'A'
    )
    || setweight(
      to_tsvector(
        'simple'::regconfig,
        coalesce(array_to_string(new.seo_keywords, ' '), '')
      ),
      'B'
    )
    || setweight(
      to_tsvector('simple'::regconfig, coalesce(new.summary, '')),
      'C'
    )
    || setweight(
      to_tsvector('simple'::regconfig, coalesce(new.content, '')),
      'D'
    );

  return new;
end;
$$;

revoke all on function public.set_story_search_document() from public;

update public.stories
set search_document =
  setweight(
    to_tsvector('simple'::regconfig, coalesce(title, '')),
    'A'
  )
  || setweight(
    to_tsvector(
      'simple'::regconfig,
      coalesce(array_to_string(seo_keywords, ' '), '')
    ),
    'B'
  )
  || setweight(
    to_tsvector('simple'::regconfig, coalesce(summary, '')),
    'C'
  )
  || setweight(
    to_tsvector('simple'::regconfig, coalesce(content, '')),
    'D'
  );

alter table public.stories
  alter column search_document set not null;

create trigger set_story_search_document_before_write
before insert or update of title, summary, content, seo_keywords
on public.stories
for each row
execute function public.set_story_search_document();

comment on column public.stories.search_document is
  'Weighted simple-config search document for title, SEO keywords, summary, and content.';

create index stories_search_document_idx
  on public.stories
  using gin (search_document)
  where status = 'published' and published_at is not null;
