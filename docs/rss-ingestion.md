# RSS ingestion

## Scope

INBCN supports manual ingestion from public RSS 2.0, RSS 1.0/RDF, and Atom
feeds. Editors and administrators can run imports from the existing editorial
CMS. Every accepted item is created as a private `external_article` draft and
must pass through the existing review, approval, and publication workflow.

RSS imports never publish automatically. Provider-hosted images remain external
and are not copied into Cloudinary in this milestone.

## Architecture

```text
/admin/sources and /admin/imports
  -> authenticated Server Actions
  -> ingestion service
  -> RSS feed repository
  -> RSS/Atom parser
  -> RSS normalizer
  -> shared external-import operation
  -> existing stories and ingest-runs repositories
  -> authenticated Supabase client
  -> PostgreSQL constraints and RLS
```

The implementation extends the NewsData ingestion architecture rather than
creating a parallel CMS:

- `rss.request.ts` retrieves a bounded public feed with caching disabled.
- `rss.parser.ts` parses supported syndication formats and common extensions.
- `rss.model.ts` validates source configuration and normalizes feed entries.
- `rss.operations.ts` adapts RSS to the shared external-article import operation.
- `external-import.operations.ts` owns provider-neutral duplicate checks, draft
  composition, slug allocation, item outcomes, and run finalization.
- `ingestion.repository.ts` persists source configuration, run history, and
  imported drafts through the authenticated server client.
- `ingestion.service.ts` authorizes the command, loads editorial defaults, and
  dispatches to either the NewsData or RSS provider adapter.

No service-role client is used.

## Routes

- `/admin/sources` creates and edits NewsData or RSS sources. RSS configuration
  includes the feed URL, active state, default language, default category,
  country, and ingestion priority.
- `/admin/imports` starts a manual import and displays paginated history using
  `ingest_runs`, including imported, skipped, duplicate, and failed counts plus
  a safe failure reason.

Both routes use the existing admin authentication and authorization boundary.
Writers cannot access ingestion commands.

## Parsing flow

The server performs the following steps for each manual RSS import:

1. Validate that the configured feed uses a public HTTP or HTTPS URL.
2. Fetch with `cache: "no-store"`, a 15-second request timeout, and a 5 MiB
   response limit.
3. Follow at most five redirects and validate every redirect target before
   requesting it.
4. Reject DTD-bearing XML and documents that are not RSS, RDF, or Atom.
5. Parse up to 50 entries per run.
6. Extract common fields and media extensions.
7. Normalize each valid item into the existing external-story contract.
8. Apply duplicate detection and persist accepted items as private drafts.
9. Finalize the `ingest_runs` record with counts and per-item outcomes.

The parser recognizes common feed fields and extensions, including:

- RSS `item`, Atom `entry`, and RDF `item`
- `guid` or Atom `id`
- RSS links and Atom alternate links
- `description`, Atom `summary`, `content:encoded`, and Atom `content`
- `pubDate`, `published`, `updated`, and `dc:date`
- `author` and `dc:creator`
- RSS categories and Atom category terms
- `media:content`, `media:thumbnail`, image enclosures, and the first content
  image as media fallbacks

## Normalization

RSS entries map to the existing story schema as follows:

| Feed field | Story field |
| --- | --- |
| Title | `title` |
| Summary/description | `summary` |
| Content/body | `content` |
| GUID/Atom ID | `external_id` |
| Canonical item link | `external_url` |
| Published/updated date | `external_published_at` |
| Author | `external_author` |
| External image | `external_image_url` |
| Categories | category matching and `seo_keywords` |
| Configured language | `language_id` |
| Configured/default category | `category_id` |

Markup is converted to plain text for the current plain-text editorial body.
HTML scripts and styles are removed, entities are decoded, whitespace is
normalized, and invalid dates become `null`. A missing headline fails only that
item. Missing body or summary content falls back safely to the headline.

The public image priority remains:

1. Owned Cloudinary featured media
2. Provider `external_image_url`
3. Standard story placeholder

## Duplicate detection

RSS reuses the shared, three-level duplicate strategy:

1. Provider identifier (`source_id`, `external_id`)
2. Normalized canonical URL (`source_id`, `external_url`)
3. Normalized title plus source fingerprint

In-memory sets catch duplicates inside a run and against existing imported
stories. Existing database uniqueness constraints remain authoritative for
concurrent requests. A uniqueness conflict is recorded as a duplicate rather
than an import failure.

## Editorial workflow

```text
RSS feed
  -> normalize
  -> duplicate check
  -> external_article / draft
  -> editor review
  -> edit
  -> approve
  -> publish
```

Imported rows explicitly clear approval, scheduling, publication, feature,
breaking, sponsorship, and owned-media fields. Existing Story Management
commands and RLS control all later transitions.

## Security

- All mutations use the authenticated Supabase SSR server client.
- Server Actions call the existing `requireAdminUser()` authorization boundary.
- Only editor and admin identities can reach ingestion services; writers are
  rejected before persistence and remain blocked by RLS.
- The dedicated policy `Editors can import RSS article drafts` grants only
  authenticated editor `INSERT` operations for active RSS sources and private
  `external_article` drafts.
- The existing NewsData policy is unchanged.
- The RSS policy grants no update, delete, approve, schedule, or publish access.
- Feed responses and parser failures are converted into safe operational
  messages; provider response bodies are not exposed.
- Feed URL checks reject credentials, localhost names, private IPv4 targets,
  loopback targets, and unsafe redirect destinations.

## Compatibility verification

The generic request and parsing path was exercised without persistence against
reachable public feeds from BBC News, NDTV, The Hindu, and Indian Express. The
same implementation is not hardcoded to those publishers. The retired Reuters
legacy feed endpoint was unreachable at verification time; administrators may
configure any currently available public Reuters syndication URL when supplied
by the publisher.

Unit coverage includes RSS and Atom parsing, common media extraction,
normalization, source validation, response limits, safe errors, redirect
validation, duplicate detection, private-draft composition, run history
finalization, and the additive RLS policy invariants.

## Limitations

- Imports are manual; scheduling and background jobs are outside this milestone.
- One manual run processes at most the first 50 feed entries.
- RSS has no continuation-token standard, so there is no cross-page feed
  traversal.
- Full article bodies depend on what the publisher includes in its feed.
- External images remain provider-hosted and may later disappear or reject
  hotlinking.
- The application does not copy, transform, license, or claim ownership of
  provider content. Publisher terms and attribution requirements must be
  reviewed before enabling a source in production.
