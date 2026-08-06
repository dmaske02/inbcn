# Premium Plain-Text Article Page Design

## Goal

Enhance the public story route into a production-quality long-form reading experience while preserving the existing plain-text `stories.content` model, server-first architecture, repository layer, publication flow, branding, and homepage/admin UI.

## Architecture

`getStoryReaderData(locale, slug)` remains the single server-side composition boundary. It continues to load the current story, categories, same-category stories, and language stories through existing repository methods. The service extends `StoryReaderViewModel` with deduplicated inline-related placements, previous/next navigation, and sidebar collections derived from those already-loaded records. No additional repository call, public API, schema, CMS, importer, or content parser is introduced.

The route remains a React Server Component. Two focused client islands provide scroll-dependent behavior: a reading progress indicator and responsive share controls. All article content, navigation, author information, sidebar collections, images, metadata, and JSON-LD remain server-rendered.

## Data Composition

- Current story is excluded from every related, navigation, and sidebar collection.
- Related selection continues to prefer the same category and fall back to newest published stories.
- One inline related card is placed after every sixth paragraph while related stories remain available.
- Articles shorter than six paragraphs render related stories only after the article body.
- Previous and next prefer adjacent same-category stories ordered by `publishedAt`; when an adjacent same-category story is unavailable, the language-wide publication order supplies the fallback.
- Sidebar groups are derived from the already-loaded language-wide collection: breaking from `isBreaking`, Editor's Picks from `isFeatured`, Latest by publication date, and Trending from the remaining newest deduplicated stories.
- A single assigned-ID set prevents duplicates across sidebar groups and excludes the current story.

## Presentation

The article header renders category, headline, standfirst, author, published date, conditionally distinct updated date, calculated reading time, and share controls. The existing resolved Hero image uses a stable responsive frame, centered `object-cover`, eager loading, and high fetch priority. Existing captions render beneath the image; unavailable caption and credit fields are omitted.

The body remains plain paragraphs. Typography changes are limited to measure, line-height, paragraph rhythm, link/focus treatment, and responsive sizing. No Markdown, HTML, heading, list, table, embed, or inline-image interpretation is added.

The desktop layout adds a sticky vertical share surface and sticky right sidebar. Mobile uses a fixed bottom share surface with safe-area spacing. Sidebar content is server-rendered and its images are lazy. Newsletter and advertisement surfaces are presentational only and preserve established INBCN styles.

The author card uses only the existing formatted author name plus publication/update/read-time values. It omits avatar, biography, counts, follow links, and social links.

## SEO and Performance

The existing canonical, OpenGraph, Twitter, and NewsArticle pipeline is retained. Metadata and JSON-LD include the available author, published timestamp, updated timestamp, Hero image, and ISO-8601 reading duration. No extra hydration or client data fetch is introduced.

Hero media is eager/high-priority. Related and sidebar media remain lazy with dimension-stable aspect-ratio containers. Client scroll listeners use passive events and animation-frame scheduling, introduce no document-flow element, and clean up on unmount.

## Accessibility

The page keeps one H1, labeled article and navigation regions, semantic `time`, `figure`, `figcaption`, `aside`, and `nav` elements, keyboard-operable share links/buttons, visible focus treatment, descriptive image alt text, and an ARIA-valued progress indicator. The mobile share surface reserves bottom content clearance.

## Out of Scope

Rich HTML, Markdown, headings/TOC, lists, tables, code, inline media, embeds, CMS/schema/importer changes, new repository methods, public APIs, homepage changes, and admin changes are excluded.

## Verification

TDD covers reading time, inline placement, previous/next ordering, sidebar exclusion/deduplication, metadata/JSON-LD duration, server-rendered page contracts, progress/share behavior contracts, loading priorities, and caption visibility. Final verification runs `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check`, followed by live desktop/mobile-oriented DOM and visual checks where the browser surface permits.
