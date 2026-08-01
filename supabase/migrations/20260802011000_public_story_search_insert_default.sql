-- Keep application inserts backward compatible. The write trigger replaces this
-- default with the fully weighted document before every row is stored.
alter table public.stories
  alter column search_document set default ''::tsvector;
