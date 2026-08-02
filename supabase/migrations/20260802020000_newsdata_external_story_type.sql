-- Extend the existing story taxonomy without changing any current value.
-- Kept in a separate migration because PostgreSQL enum values cannot be used
-- safely by later DDL until the transaction that creates them has committed.

alter type public.story_type
  add value if not exists 'external_article';
