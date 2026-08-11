# INBCN Homepage Builder Phase 2 Public Integration Design

## Scope

Phase 2 connects the Phase 1 Homepage Builder to the localized public homepage behind a disabled-by-default server feature flag. The existing homepage remains the canonical fallback and retains its current metadata, structured data, routes, layout, content behavior, and appearance.

The public homepage is always one complete implementation: either every active Homepage Builder section resolves and renders successfully, or the complete existing homepage renders. Partial CMS output, mixed CMS/legacy output, and public-facing builder errors are prohibited.

This phase does not redesign Phase 1, add publishing workflows, alter Live TV or LiveKit, change Broadcast Studio, or modify RSS, Stories, Categories, metadata, OpenGraph, Twitter, JSON-LD, canonical URLs, layouts, or routing.

## Feature flag and selection policy

`HOMEPAGE_BUILDER_ENABLED` is validated by the existing environment configuration as a server-only `"true" | "false"` value and defaults to `"false"`.

The localized homepage always loads the existing cached homepage dataset because it is both the canonical fallback and the reusable source for story/category renderer data. Builder resolution is attempted only when the flag is enabled. The builder is selected only when all of these conditions hold:

- the locale is `en`, `hi`, or `mr`;
- a homepage configuration exists for that locale;
- at least one section is enabled and active at the request time;
- stored ordering, container, width, block, renderer, configuration, and schedule contracts are valid;
- every required story, category, and Live TV reference exists in the same locale;
- every block has a registered renderer;
- every renderer completes successfully.

Any false condition or exception selects the complete existing homepage. The fallback is transparent and contains no public error notice.

## Public data flow

The localized route requests one public homepage result from `homepage-renderer.service.ts`:

1. Load the existing cached `HomepageViewModel` once.
2. If the feature flag is disabled, return the legacy result immediately without querying Homepage Builder tables.
3. Load the locale's builder configuration and ordered sections through a public read-only repository method.
4. If no configuration exists, return the legacy result.
5. Filter scheduling through the Phase 1 `buildHomepagePreview()` boundary and reject an empty active payload.
6. Resolve story and category references from the already loaded legacy dataset. Do not repeat story or category database queries.
7. If an active Live TV block exists, resolve its localized view through the existing Live TV service; otherwise do not query Live TV.
8. Validate the complete preview contract and eagerly invoke every registered block renderer in stored order.
9. Return the complete builder result only after every renderer succeeds.
10. On any failure, record sanitized server diagnostics and return the already loaded legacy result.

The public route renders the selected result. The route's existing `Suspense`, invalid-locale behavior, and legacy data-error presentation remain unchanged.

## Phase 1 integration

Phase 2 reuses the Phase 1 configuration, section DTO, registry, scheduling predicate, and preview composition model. Phase 1 CMS operations and database schema are not redesigned.

The public repository is a read-only addition to the existing Homepage Builder repository boundary. It selects configuration and ordered section fields permitted by public rendering. It contains no rendering, fallback, feature-flag, or presentation policy.

The Phase 1 preview contract is extended with resolved public renderer data while preserving its existing stable identity, renderer, position, container, width, and configuration fields. Resolution fails closed when a referenced record is absent or belongs to a different locale.

## Renderer architecture

The renderer feature contains exactly these architectural files:

- `homepage-renderer.types.ts`: result, render-context, diagnostic, layout, and block-renderer types.
- `homepage-renderer.contract.ts`: runtime validation of the complete preview payload and renderer output contract.
- `homepage-renderer.model.ts`: feature selection, all-or-nothing orchestration helpers, error normalization, and safe diagnostic metadata.
- `homepage-renderer.registry.ts`: the single mapping from block renderer identifiers to implementations.
- `homepage-renderer.service.ts`: server-only cached-data reuse, repository coordination, optional Live TV resolution, eager rendering, logging, and fallback selection.

The registry is the only renderer-selection mechanism. It exposes a stable registration record containing the renderer identifier, supported block type, and implementation. Adding a future block requires one Phase 1 schema/registry definition, one renderer implementation, and one renderer registration. Renderer selection is not duplicated through route or service switch statements.

Every renderer consumes only a validated preview item and a non-querying render context contained in the preview model. Renderer implementations never import Supabase or repositories.

## Block renderers

The registry supports all ten Phase 1 block types:

- Hero Story
- Breaking News
- Live TV
- Latest News
- Category Section
- Trending
- Opinion
- Advertisement Placeholder
- Custom HTML Placeholder
- Future Placeholder

Story-backed renderers receive complete locale-safe public story models. Category blocks receive the resolved category and its eligible stories. Live TV receives the existing localized Live TV view and renders through an extracted reusable Live TV presentation boundary without changing player or CMS logic.

Existing homepage presentation is decomposed only where necessary into shared server components for hero, story collections, category rails, breaking content, and advertisements. The legacy `Homepage` composes the same extracted components in the same order and with the same CSS classes, preserving its output. Builder renderers compose those same components according to stored order and layout metadata.

Custom HTML is never parsed, injected, or executed. Its renderer displays a safe editorial placeholder without using `dangerouslySetInnerHTML`. Future Placeholder also displays a non-interactive placeholder. These placeholders remain server-rendered.

## Layout contract

Sections render strictly by ascending stored position. The preview contract accepts only the Phase 1 values:

- containers: `main`, `sidebar`, `footer`;
- widths: `full`, `half`, `third`, `quarter`.

A single builder layout component maps these validated values to existing layout/CSS primitives. Invalid layout metadata fails the entire builder attempt. Container grouping never reorders sections; position remains authoritative. Width affects only the containing grid span and does not alter reused block presentation.

## All-or-nothing failure handling

Builder preparation completes before the route selects builder output. The orchestration boundary catches:

- repository errors;
- missing configuration;
- invalid or empty active previews;
- invalid schedules;
- unresolved or cross-locale references;
- unsupported blocks or renderers;
- invalid block configuration;
- invalid container or width values;
- renderer exceptions;
- Live TV resolution failures;
- unexpected runtime failures.

No prepared subset is returned. The service discards all builder output and returns the complete legacy result.

Diagnostics use one server-only logger call with safe fields only: locale, failure code, sanitized message, and optional block ID/type. Configuration JSON, SQL, tokens, secrets, credentials, stack traces containing sensitive values, and raw database errors are not logged. Diagnostics never appear in public markup.

## Performance and caching

Rendering remains server-first. No client fetching or new client boundary is introduced.

The existing React request cache for `getHomepageData(locale)` is retained. The same result feeds the fallback and builder reference resolution, preventing duplicate story/category queries. Builder configuration and sections are fetched together where the Supabase query contract permits. Live TV resolution occurs only when an active Live TV block is present and reuses the existing Live TV service/cache boundary.

The renderer registry and contract add no browser JavaScript. Existing interactive components retain their current client behavior without duplication.

## Public route and SEO isolation

The public route changes only at the homepage selection boundary. Metadata generation, localized alternates, canonical URLs, OpenGraph, Twitter, JSON-LD, breadcrumbs, locale routing, layout composition, and public chrome remain unchanged.

The fallback continues invoking the existing `Homepage` component with the existing `HomepageViewModel`. When the flag is disabled, the path is behaviorally equivalent to the pre-Phase 2 route and does not query Homepage Builder persistence.

## Testing

Tests cover:

- exact renderer registry membership and uniqueness;
- renderer contract validation;
- every one of the ten block types;
- story, category, breaking, advertisement, and Live TV component reuse;
- Custom HTML non-execution;
- stored ordering;
- containers and widths;
- EN, HI, and MR isolation;
- schedule boundaries inherited from Phase 1;
- Live TV lazy resolution;
- feature flag disabled selecting legacy without a builder query;
- missing configuration selecting legacy;
- empty active configuration selecting legacy;
- invalid block selecting legacy;
- missing or cross-locale reference selecting legacy;
- repository, preview, layout, renderer, and unexpected failures selecting legacy;
- successful complete configuration selecting builder output;
- no mixed or partial result under any failure;
- safe diagnostic metadata;
- regression that the disabled flag retains the existing homepage component and appearance contract;
- regression that metadata, routing, Live TV, Broadcast Studio, RSS, Stories, and Categories remain outside the change set.

Final verification is:

```text
npm test
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

No commit or push is performed.
