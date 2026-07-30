# Phase 1 database schema

The baseline migration is stored in
`supabase/migrations/20260730000000_phase_1_schema.sql`.

## Tables

- `languages` defines supported editorial languages and their native labels.
- `categories` stores localized, hierarchical content categories.
- `sources` records API, RSS, website, social, and manually managed news
  origins, including a localized fallback category for ingestion.
- `profiles` extends Supabase Auth users with an application identity, preferred
  language, and one of the approved editorial or reader roles.
- `stories` is the central multilingual publishing record. It supports
  aggregated, staff, and citizen content; translation groups; editorial review;
  scheduling; publication; external provenance; flags; and SEO overrides.
- `media` stores Cloudinary-backed story assets and their presentation metadata.
- `ingest_runs` records ingestion lifecycle state, counts, errors, and source
  provenance.
- `push_subscriptions` stores Web Push endpoints for authenticated or anonymous
  readers.

## Design notes

- Story slugs are unique within a language.
- A story and its category must use the same language.
- Translation variants share a `translation_group_id`.
- External source records use restrictive deletion so published provenance and
  ingestion history cannot be orphaned.
- Profile deletion cascades from `auth.users`; authored and approved story
  history is retained by setting profile references to `null`.
- Story deletion cascades to its media. Deleting featured media clears the
  story reference.
- `updated_at` is application-managed because Phase 1 intentionally defines no
  database triggers or functions.
- Row Level Security, policies, seed data, and application integrations are
  intentionally outside this migration.
