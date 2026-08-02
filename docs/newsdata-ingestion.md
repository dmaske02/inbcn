# NewsData.io ingestion

## Scope

The NewsData integration gives editors and administrators a manual, server-side
workflow for importing recent provider articles into the existing Story
Management CMS. Every imported item is created as a private `external_article`
draft. Nothing is approved, scheduled, or published automatically.

Scheduled jobs, webhooks, AI rewriting, AI summaries, RSS ingestion, and
Cloudinary ownership of provider images are outside this milestone.

## Architecture

```text
/admin/sources and /admin/imports
  -> authenticated Server Actions
  -> NewsData ingestion service
  -> NewsData API repository
  -> pure request and normalization models
  -> existing stories repository
  -> Supabase with RLS
```

- Pages are Server Components. Client Components are limited to source-form and
  import-button interactions.
- `requireAdminUser()` is the application authorization boundary. Only the
  `editor` and `admin` roles may manage sources or imports.
- The authenticated Supabase server client performs all persistence. The
  service-role client is never used by the ingestion workflow.
- The provider repository uses native server-side `fetch`, a 15-second timeout,
  `cache: "no-store"`, and sanitized errors.

## Routes

- `/admin/sources` configures NewsData sources.
- `/admin/imports` starts a manual import and displays paginated run history.
- Imported drafts appear in the existing `/admin/stories` workflow.

## Configuration and security

`NEWSDATA_API_KEY` is required at runtime and must be stored only in the ignored
`.env.local` file. It is read through the server-only typed environment module.
It is never returned to a Client Component, persisted in Supabase, logged, or
included in a public URL.

The corresponding empty placeholder is already documented in `.env.example`.
Developers must never commit `.env.local`.

## Source configuration

A `newsdata_api` source stores:

- default language and default category;
- optional two-letter country filter;
- ingestion priority from 1 (highest) to 100 (lowest);
- enabled/disabled state and last successful ingestion timestamp.

The selected category must belong to the selected language. Source readiness
is derived from the currently available language and category references, so a
disabled source or a source with stale/inconsistent references cannot start an
import.

## Request and normalization

Manual imports call the official `latest` endpoint with a maximum page size of
10, the configured country and language, and provider-side duplicate removal.
The repository retains the returned pagination token and available quota
headers in the run result; automatic multi-page processing is intentionally not
enabled.

Provider records are normalized into stable draft values:

- `title` -> story headline and generated unique slug;
- `description` -> summary;
- `content` -> body, falling back to the summary when full content is absent or
  plan-gated;
- `pubDate` plus `pubDateTZ` -> `external_published_at`;
- `creator` -> `external_author`;
- `link` -> normalized `external_url`;
- `image_url` -> `external_image_url` without downloading the asset;
- `keywords` and `ai_tag` -> `seo_keywords`;
- provider category -> a matching localized category, otherwise the configured
  default category;
- provider language -> the configured INBCN language;
- story type and status -> `external_article` and `draft`.

Tracking parameters are removed from canonical provider URLs. NewsData fields
that contain plan-access sentinels are not persisted as article content or SEO
keywords.

## Duplicate protection

Duplicate checks are applied in this order:

1. provider `external_id` within the configured source;
2. normalized canonical URL within the configured source;
3. normalized title plus configured source.

The existing unique `(source_id, external_id)` constraint remains unchanged. A
partial unique `(source_id, external_url)` index adds race-safe canonical-URL
protection. A concurrent unique violation is converted into a skipped duplicate
rather than exposed as a PostgREST error. Existing imported identities are read
in deterministic repository pages so duplicate detection remains complete when
a source has more rows than the Supabase response limit.

## Editorial workflow and RLS

The insertion shape explicitly clears all approval, rejection, scheduling,
publication, featured-media, breaking, featured, and sponsored fields.

The additive editor INSERT policy permits only an authenticated editor whose
JWT role is `editor` to insert their own active-source `external_article` draft
with the private editorial fields above. Existing admin access remains intact;
writers receive no additional capability. Existing story update, publication,
and deletion policies remain the final enforcement layer.

Editors can edit an imported draft, approve or reject it, and then publish or
schedule it through explicit workflow commands. The CMS preserves the external
story type and source during edits and displays provider provenance as read-only
metadata.

## Import history and error handling

Each attempt creates an `ingest_runs` row and records fetched, imported,
skipped, duplicate, and failed counts. Per-item outcomes, sanitized reasons,
the next-page token, and non-secret quota information are stored in JSON
metadata. Provider, duplicate-lookup, and slug-lookup failures finalize the run
as failed rather than leaving it in a running state; invalid individual records
produce a partial run without blocking valid records.

No error shown to an editor contains the API key, raw PostgREST details, or
provider response contents.

## Database migrations

- `20260802020000_newsdata_external_story_type.sql` adds the enum value in an
  isolated PostgreSQL transaction boundary.
- `20260802021000_newsdata_ingestion_foundation.sql` adds external metadata,
  source configuration, canonical-URL uniqueness, constraints, and the narrow
  editor INSERT policy.
- `20260802022000_newsdata_identifier_fallback.sql` permits the approved
  title-plus-source fallback when a provider omits both ID and URL while keeping
  the active-source, draft-only, and private-field RLS guards unchanged.

All changes are forward-only and preserve existing columns, data, editorial
stories, public queries, and repository contracts.

## Current limitations

- Imports are manual and process one provider page (up to 10 records) per run.
- Provider images remain remote URLs and are not copied to Cloudinary.
- Provider language and category classifications can require editorial
  correction before approval.
- Free NewsData plans may not return full article bodies; the available summary
  becomes the editable draft body in that case.
- Title-plus-source duplicate matching is application-level; database-level
  race protection is provided for provider IDs and canonical URLs.
