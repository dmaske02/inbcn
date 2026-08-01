# Production Homepage

The localized homepage is a React Server Component backed by a server-only presentation service. It preserves the approved Signal Edition hierarchy while isolating repository DTOs from page composition.

## Data boundary

`getHomepageData(locale)` in `src/features/news/server/services/homepage.service.ts` is the homepage's only data entry point. It concurrently calls the existing `getStoriesByLanguage(locale)` and `getCategories(locale)` repositories. The UI never queries Supabase or imports repositories directly.

The service composes a stable view model with:

- the first featured story as Hero, falling back to the newest story;
- the newest non-Hero stories as Latest News;
- a breaking story, or otherwise the newest story, for the Signal Rail;
- localized category groupings for National, World, Business, Technology, Sports, Entertainment, and Opinion;
- featured stories other than the Hero as Editor's Picks;
- the newest published stories as Trending.

All repository story queries already enforce published-only visibility. The composer sorts stories by `publishedAt` so presentation remains deterministic.

## Media fallback

The current story DTO contains a media identifier but not a resolved media URL. Until the media pipeline milestone, every story uses `/images/news/story-fallback.svg`. The view model exposes an image object with `src` and `alt`, matching the existing story-card contract so resolved media URLs can replace the fallback without changing the homepage UI.

## Loading, empty, and error states

The page streams through a Suspense boundary with a homepage skeleton. Missing stories, categories, and individual category collections use the existing accessible `EmptyState`. A repository failure is converted at the page boundary into localized `ErrorState` copy without exposing database or PostgREST details.

Opinion remains in the approved hierarchy even when that category is absent; it renders its localized empty state.

## Localization

Homepage presentation copy is defined in `messages/en.json`, `messages/hi.json`, and `messages/mr.json`. Repository-provided story titles, summaries, and category names are already selected by locale through `getHomepageData(locale)`.

## Verification

Run:

```text
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --experimental-strip-types src/features/news/server/services/homepage.model.test.mjs
npx tsc --noEmit
npm run lint
npm run build
```
