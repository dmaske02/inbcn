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
- `media` is the canonical Cloudinary-backed asset table. Assets may originate
  from a story or exist independently for reuse. Phase 5 promotes `title`,
  `original_filename`, and `credit` from legacy JSON metadata into normalized
  columns while retaining the JSON object for backward compatibility.
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
- `stories.featured_media_id` references reusable `media.id` values. Deleting a
  featured media row clears the Story reference; deleting an originating Story
  clears nullable `media.story_id` without deleting the reusable media row.
- Active media has `deleted_at is null`. The `deleted_at` and `deleted_by`
  fields establish retirement metadata for later lifecycle work; Milestone 1
  only excludes retired rows from active library queries.
- `media.updated_by` and `media.deleted_by` reference `profiles` with
  `ON DELETE SET NULL`, preserving media records when a profile is removed.
- The active-library index orders by media type, retirement state,
  `created_at desc`, and `id desc`. No search extension or search index is added
  in Milestone 1 because the existing multi-field `ilike` query has not yet
  been measured against representative production-scale data.
- `updated_at` is application-managed because Phase 1 intentionally defines no
  database triggers or functions.
- Row Level Security, policies, seed data, and application integrations are
  intentionally outside this migration.
