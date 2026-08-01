# Story Reader

## Route

Published stories are available at `/{locale}/story/{slug}` for the supported `en`, `hi`, and `mr` locales. The route is a Server Component inside the existing localized public layout.

## Data flow

```text
Story page
  -> story-reader.service.ts
    -> published-only news repositories
      -> Supabase client
        -> PostgreSQL and RLS
    -> story-reader.model.ts
      -> reader view model, metadata, and JSON-LD
```

The page calls `getStoryReaderData(locale, slug)` and renders its stable view model. React request memoization allows the page and `generateMetadata` to reuse the same service result. Publication checks stay in `getStoryBySlug`; missing, invalid-locale, and unpublished lookups therefore resolve to the same Next.js 404 path.

## Reader composition

- Story detail uses the locale-aware slug lookup.
- Category labels come from the localized category repository.
- Related stories use the same language and category, exclude the current story, and are limited to four.
- The public author is `external_author` when present; otherwise it is the localized “INBCN News Desk” label. Public routes never expose `created_by` or query protected profiles.
- Read time is calculated at 200 words per minute and rounded up.
- Plain-text story bodies are split into trimmed paragraphs without HTML injection.
- Missing featured media uses `/images/news/story-fallback.svg`, preserving the final media layout.

## Metadata

The pure model composes canonical, Open Graph, Twitter summary-card, and `NewsArticle` JSON-LD inputs. Stored canonical and SEO fields take precedence when available. Relative fallback media paths are converted to absolute application URLs.

## Sharing

`story-share-actions.tsx` is the only Client Component in the reader. It supports Copy Link, X, Facebook, LinkedIn, and email using platform share URLs; it has no third-party SDK and performs no data fetching.

## Security

All content queries use the normal server Supabase client and existing RLS. The reader does not use the service-role client, fetch profiles, or implement a second publication rule outside the repository.

## Current limitations

- Story bodies are plain text.
- Related-story images use the standard fallback until summary DTO media support is introduced.
- Media upload, Cloudinary, comments, reactions, bookmarks, AI summaries, search, and category pages are outside this milestone.
