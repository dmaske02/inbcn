# INBCN Editorial Ledger Redesign

**Date:** 2026-09-03
**Status:** Approved for implementation planning

## Objective

Refactor the public INBCN website into a cohesive editorial newspaper experience inspired by `daily-ledger-news.html`. Preserve all existing data contracts, server loaders, localization, Homepage Builder behavior, authentication behavior, media behavior, and public URLs.

The reference prototype is visual guidance only. This document records the approved INBCN implementation.

## Scope

The redesign covers:

- The shared public header, edition strip, navigation, search interaction, breaking-news surfaces, and footer on every public route.
- The homepage in both configured Homepage Builder mode and the legacy fallback mode.
- The localized Live TV page and the Homepage Builder Live TV block.
- Category and search result pages.
- Shared colors, typography, spacing, borders, focus states, responsive behavior, and empty/error presentation used by these routes.
- Editorial advertising on the homepage, category pages, and search pages.

The redesign does not change:

- Supabase schemas, repositories, queries, data mapping, or service contracts.
- CMS or reporter behavior.
- Homepage Builder block configuration or renderer identifiers.
- Locale routing, category slugs, search query parameters, story URLs, Live TV URLs, or metadata generation.
- Live TV providers, player internals, broadcast session behavior, or schedule selection.

## Visual System

The public site uses one restrained editorial token set:

| Role | Value |
| --- | --- |
| Page canvas | `oklch(98% 0.004 95)` |
| Surface | `oklch(100% 0.002 95)` |
| Primary ink | `oklch(20% 0.018 70)` |
| Muted ink | `oklch(48% 0.012 70)` |
| Soft tint | `oklch(96% 0.006 95)` |
| Hairline border | `oklch(90% 0.006 95)` |
| Brand accent | `oklch(45% 0.17 28)` |
| Inverted surface | `oklch(17% 0.018 70)` |

The token layer exposes semantic CSS custom properties rather than repeating color literals. Crisp one-pixel rules provide most grouping; cards, shadows, and rounded containers are used sparingly.

Typography roles are:

- Headlines: `Charter`, `Iowan Old Style`, `Georgia`, then a locale-compatible serif fallback. Headlines use balanced wrapping where supported.
- Body and controls: system UI sans-serif with the existing multilingual Noto fallback.
- Metadata, timestamps, kickers, edition data, live labels, and sponsor labels: `ui-monospace`, `JetBrains Mono`, `Menlo`, then monospace.

The content container is 1180px wide with responsive side gutters. Corners remain square or subtly rounded, and movement is limited to purposeful drawer, dialog, underline, and ticker transitions. Reduced-motion preferences disable nonessential animation.

## Shared Component Architecture

### Editorial shell

`PublicLayout` remains the server-rendered boundary responsible for localized labels, the server-formatted date, homepage breaking data, and route content. Its client-side chrome is refactored into an editorial shell without moving data fetching into the browser.

The shell contains:

1. A sticky, translucent masthead with 12px backdrop blur.
2. INBCN brand mark at left.
3. Existing localized category destinations centered on wide screens and horizontally scrollable on tablet.
4. Live TV status link, search trigger, and sign-in action at right.
5. A compact edition strip immediately below the primary masthead containing the date, edition descriptor, existing weather text, and locale controls.
6. Existing breaking ticker and pinned alert, restyled with the new token system and unchanged story destinations.
7. A compact editorial footer shared by all public pages.

Mobile replaces the desktop navigation with a menu trigger and drawer. Live TV remains the first prominent drawer destination. Locale switching continues to preserve the current pathname, search string, and hash.

### Search dialog

`SearchDialog` is a controlled client component opened by the masthead search icon. It provides:

- Native dialog semantics, focus containment, Escape dismissal, close button, backdrop dismissal, and focus restoration.
- A prominent search input with accessible label and submit control.
- Submission to the existing localized `/${locale}/search?q=...` route.
- No new search API, suggestions service, or client-side result fetching.

The dialog is centered on desktop and becomes a full-width sheet on mobile. The standalone search page remains directly routable.

### Editorial primitives

The redesign introduces focused presentation components:

- `EditorialSectionHeader`: section title, optional kicker/action, and hairline rule.
- `LedgerStoryRow`: metadata column, fixed-ratio thumbnail, linked headline and summary, plus save/share actions.
- `EditorialSponsorRow`: reserved-ratio advertising surface with hairline borders, muted tint, and monospace `ADVERTISEMENT` or `SPONSORED` label.
- `RankedStoryList`: zero-padded ranks, story links, and divider rhythm.
- `StoryActionButtons`: accessible save and share controls shared by feeds where those actions are appropriate.

These primitives accept existing view models. They do not know about repositories, Supabase, Homepage Builder persistence, or route loading.

Save state is stored locally in the browser and keyed by stable story ID. It is progressive enhancement: a storage failure does not block navigation or reading. Share uses the existing share abstraction when available and falls back to copying the canonical story URL.

## Page Composition

### Homepage

The homepage keeps the existing renderer selection: configured Homepage Builder output when enabled and the legacy `Homepage` fallback otherwise. Both paths reuse the redesigned news-section components.

The preferred composition is:

1. Optional restrained sponsor row.
2. A 5:4 split hero with editorial copy and a 16:10 lead image on desktop.
3. Category filter links using existing localized destinations.
4. Latest/news sections expressed as horizontal ledger rows.
5. A 2:1 discovery region containing a numbered Most Read list and an Editor's Pick feature.
6. Category rails restyled within the same rule-based visual language.
7. An inverted Live TV briefing containing the existing player or stable offline state plus programme context.

Homepage Builder section order, widths, containers, and renderer IDs remain valid. Adjacent hero-story and hero-sidebar composition remains owned by the builder layout. When the configured block sequence differs from the preferred composition, each block retains the approved editorial presentation without silently reordering CMS configuration.

### Category pages

Category page loaders, filters, pagination, metadata, and URLs remain unchanged. Story results render as `LedgerStoryRow` entries separated by hairline rules. Existing advertising becomes `EditorialSponsorRow` entries placed within the feed rhythm rather than boxed banners.

Empty categories retain a stable heading and accessible empty-state message. Pagination remains beneath the ledger and adopts the shared typography and rule treatment.

### Search page

The existing search form, query parameters, filters, result counts, pagination, metadata, and structured data remain unchanged. Search results render through the same ledger primitive as category pages, with restrained sponsor rows placed in the result rhythm.

The initial search state, no-results state, and filtered results all reserve consistent page structure. The header search dialog and the page form submit to the same existing route contract.

### Live TV

The Live TV page preserves its current service, stream selection, internal broadcast viewer, provider player, schedule, related-story rails, metadata, and JSON-LD.

The player and programme context are wrapped in a single inverted charcoal briefing container. Live crimson labels, white editorial headlines, subdued metadata, and hairline separators maintain hierarchy. The schedule is integrated into the briefing presentation on wide screens and follows directly below the player on smaller screens.

Offline, next-scheduled, and player-error states reserve the same media geometry as the live player. The Homepage Builder Live TV renderer uses the same inverted visual boundary for live and offline states.

## Advertising and Layout Stability

Advertising remains present but no longer appears as a harsh boxed banner.

`EditorialSponsorRow` provides:

- Top and bottom `1px solid var(--border)` rules.
- A subtle surface or soft-ink tint.
- A monospace `ADVERTISEMENT` or `SPONSORED` label in muted ink.
- A reserved `8 / 1` aspect ratio on desktop and `3 / 1` on mobile before third-party scripts or creative media load.
- Accessible labeling and a stable fallback when no creative loads.

The component must not collapse after hydration or introduce content jumps. Category and search feeds use a deterministic insertion position so server and client markup agree.

## Responsive Behavior

### Desktop

- Maximum 1180px editorial grid.
- Sticky three-zone navigation.
- 5:4 split hero with copy and 16:10 image.
- Ledger rows with metadata, thumbnail, copy, and actions in distinct columns.
- 2:1 Most Read and Editor's Pick discovery region.
- Live TV player and programme/schedule context share the inverted briefing block.

### Tablet

- Hero stacks into one column.
- Category navigation becomes horizontally scrollable without changing destinations.
- Discovery becomes one column.
- Ledger metadata and action columns compact while preserving readable headlines.
- Live TV briefing stacks player above programme context.

### Mobile

- Compact sticky masthead and drawer navigation.
- Search dialog becomes a full-width sheet.
- Hero becomes image-first.
- Ledger rows use compact metadata and thumbnails; summaries may be shortened or hidden visually but remain available on destination pages.
- Story actions remain finger-sized and do not displace the headline.
- Sponsor rows retain their reserved aspect ratio.

## Data Flow and Failure Handling

Server data continues through the existing route loader and view-model boundaries. Presentation components receive already-mapped data and produce links from existing `href` fields.

The UI handles degraded content as follows:

- Missing story image: preserve thumbnail/hero geometry and render the existing image fallback treatment.
- Empty story list: render an accessible empty state without collapsing the surrounding section.
- Search dialog JavaScript failure: direct links and the standalone localized search route remain usable.
- Local storage failure: save controls continue in memory for the current session.
- Web Share API failure or absence: copy the existing story URL when possible and expose status text.
- Live TV offline/error: preserve the player aspect ratio and show the current offline or next-scheduled content.
- Advertisement failure: retain the reserved sponsor row with neutral labeling so surrounding content does not shift.

## Accessibility

- Preserve the skip link and logical heading order.
- Use landmarks and explicit labels for navigation, search, breaking news, story actions, Live TV, and advertising.
- Provide visible keyboard focus using the brand accent and sufficient offset.
- Ensure the dialog traps focus and restores it to its trigger.
- Keep minimum touch targets appropriate for mobile controls.
- Maintain readable contrast across paper, surface, crimson, and inverted states.
- Respect reduced-motion settings.

## Testing and Verification

Implementation is complete only when all of the following pass:

1. Component contract tests for the shared shell, search dialog route submission, ledger rows, sponsor geometry, ranked list, and Live TV briefing wrapper.
2. Existing Homepage Builder registry, renderer, adjacency, data-contract, localization, category, search, metadata, Live TV, and routing tests.
3. Type checking, linting, the complete automated test suite, and a production build.
4. Browser verification against hosted development data at:
   - Desktop width for homepage, category, search results, and Live TV.
   - Tablet width for hero/navigation/discovery stacking.
   - Mobile width for masthead, drawer, search sheet, image-first hero, ledger rows, sponsor stability, and Live TV stacking.
5. Keyboard checks for skip navigation, drawer, search dialog, save/share actions, pagination, and Live TV controls.
6. Console and runtime checks confirming no hydration errors, uncaught exceptions, broken routes, or unexpected layout overlays.

## Acceptance Criteria

- Every public route uses the new paper, ink, surface, border, crimson, and typography system.
- The universal shell provides the approved sticky navbar, edition strip, search dialog, Live TV link, mobile drawer, and footer.
- Homepage Builder and fallback homepages present the same editorial component language without changing their data contracts.
- Homepage hero, feed, discovery, and Live TV surfaces match the approved composition at their applicable breakpoints.
- Category and search listings use shared ledger rows and no harsh boxed banner ads.
- Advertising uses stable fixed-ratio sponsor rows and does not cause avoidable CLS.
- Live TV uses an inverted briefing container while preserving all player, schedule, fallback, metadata, and structured-data behavior.
- Existing localized paths, filters, pagination, search parameters, story links, and loaders continue to work.
- All automated and browser verification requirements pass.
