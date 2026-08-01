# Public Search

## Overview

INBCN public search is available at `/{locale}/search` for English (`en`), Hindi (`hi`), and Marathi (`mr`). It is server-rendered and follows the existing application boundary:

```text
Search page → search service → story repository → Supabase → PostgreSQL RLS
```

The page and header never query Supabase directly. Anonymous visibility remains controlled by the existing `Public can read published stories` RLS policy.

## URL contract

Search uses GET parameters so result pages are linkable and work without client-side JavaScript.

| Parameter | Purpose | Default |
| --- | --- | --- |
| `q` | Search query, normalized to collapsed whitespace and limited to 160 characters | Empty initial state |
| `category` | Localized category slug | All categories |
| `date` | `all`, `day`, `week`, or `month` | `all` |
| `page` | Positive one-based page number | `1` |

Examples:

- `/en/search?q=election`
- `/hi/search?q=भारत&category=national`
- `/mr/search?q=शिक्षण&date=week&page=2`

Invalid filters, unknown localized categories, and out-of-range pages return the Next.js not-found experience.

## Database search document

Migration `20260802010000_public_story_search.sql` adds `stories.search_document`, a maintained `tsvector`. A narrow `BEFORE INSERT OR UPDATE` trigger refreshes it when `title`, `summary`, `content`, or `seo_keywords` changes. Existing rows are backfilled during migration.

PostgreSQL's `simple` text-search configuration is used consistently across English, Hindi, and Marathi. The fields are weighted as follows:

- A: title
- B: SEO keywords
- C: summary
- D: body content

`stories_search_document_idx` is a partial GIN index for rows whose status is `published` and whose `published_at` value is present. Migration `20260802011000_public_story_search_insert_default.sql` keeps existing insert types backward compatible while the trigger remains the authoritative document writer.

No existing story column, relationship, constraint, or RLS policy is removed or weakened.

## Repository and service

`searchPublishedStories()` owns the complete publication boundary. It applies:

- language ID filtering for the current locale;
- `status = published` and non-null `published_at`;
- PostgreSQL web-search parsing against `search_document`;
- optional category and publication-date filtering;
- newest-first ordering;
- exact result counts and 12-result pagination;
- stable DTO mapping and featured-media attachment.

`getSearchPageData()` is the server-only presentation service. It validates URL input, resolves localized categories, avoids a story query for the initial empty state, invokes the repository once for a valid search, and composes localized metadata and the page view model.

`search.model.ts` is framework-independent and unit-tested. It owns normalization, date boundaries, search URLs, cards, author/read-time/image presentation, pagination, metadata, empty states, and JSON-LD.

## Rendering and accessibility

The page is a Server Component. The search and filter form uses native GET controls, localized labels, keyboard-accessible focus states, and no client-side data fetching. The header uses a lightweight Client Component only to open, focus, and close its search panel; form submission remains a normal localized GET navigation.

Story results reuse the public Story Card, localized INBCN News Desk fallback, 200-WPM read-time helper, Cloudinary delivery helper, and standard fallback image.

## SEO

Each valid state provides:

- localized title and description;
- canonical URL preserving active filters and page;
- Open Graph and Twitter metadata;
- `CollectionPage` JSON-LD with an `ItemList` of visible results.

## Rollback

If this search schema must be removed before application deployment, reverse it in this dependency order:

```sql
drop index if exists public.stories_search_document_idx;
drop trigger if exists set_story_search_document_before_write on public.stories;
drop function if exists public.set_story_search_document();
alter table public.stories drop column if exists search_document;
```

Application code that calls `searchPublishedStories()` must be rolled back in the same release before dropping the column.

## Current limitations

- `simple` tokenization intentionally avoids language-specific stemming; spelling variants and fuzzy matching are not included.
- Results are ordered newest-first rather than by relevance, per the Phase 1 requirement.
- Search has no autocomplete, saved searches, analytics, vector search, or AI features.
- A locale with no published stories returns the localized empty state.
