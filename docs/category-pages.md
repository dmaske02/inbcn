# Public Category Pages

## Route

Public category pages use `/{locale}/category/{slug}` with optional server-rendered pagination through `?page={number}`. The route supports the existing `en`, `hi`, and `mr` locales and runs inside the shared public Signal Edition layout.

## Architecture

```text
Category page
  -> category.service.ts
    -> categories.repository.ts
    -> stories.repository.ts
      -> Supabase SSR client
        -> PostgreSQL and RLS
    -> category.model.ts
```

The Server Component calls `getCategoryPageData(locale, slug, page)` once and renders its stable view model. React request memoization allows `generateMetadata` to reuse the same service result. The page does not query Supabase, select the hero, filter publication status, or calculate pagination.

## Repository flow

The existing repositories are extended additively:

- `getCategoryBySlug` validates the active category against the requested locale.
- `getCategoryStoryCandidates` retrieves the newest published featured candidate and newest published fallback candidate.
- `getPublishedCategoryStoryPage` retrieves 12 published stories, applies the stable hero exclusion, and returns an exact count.

Every story query includes `status = 'published'` and a non-null publication timestamp. The regular SSR client is used and RLS remains the final authorization boundary.

## Category service

The server-only service owns hero selection, exclusion, localized author fallback, related-category selection, request validation, and view-model composition. On page 1 it chooses the newest featured candidate, falling back to the newest published story. That story is excluded from every page query so page boundaries remain stable. Pages after page 1 do not render the hero.

Unknown categories, malformed pages, non-positive pages, and pages beyond the adjusted result set return the route's Next.js not-found boundary.

## Pagination

The repository count represents published category stories after excluding the stable hero ID. Twelve stories are rendered per page. Page offsets are `(page - 1) * 12`; the same exclusion is applied on all pages regardless of whether the hero is visible. Empty categories retain one valid empty page while page 2 and later are out of range.

Pagination uses ordinary localized route links and performs no client-side fetching.

## Presentation

The category page reuses the existing Breadcrumb, StoryCard, Pagination, EmptyState, Badge, and AdvertisementPlaceholder components. Public story URL, author, 200-WPM read-time, and fallback-image helpers are shared with other public news experiences. Related-category links contain only active categories from the same language.

## SEO and structured data

The pure category model composes:

- localized title and description;
- canonical URL, including `?page=` after page 1;
- Open Graph website metadata;
- Twitter summary-card metadata;
- `CollectionPage` JSON-LD containing an `ItemList` of stories visible on the current page.

Category descriptions from the database take precedence over localized fallback descriptions.

## Current limitations

- Story cards use the standard fallback image until summary media metadata is introduced.
- Category pages do not implement search, client-side infinite scrolling, analytics, media uploads, comments, bookmarks, notifications, or AI summaries.
