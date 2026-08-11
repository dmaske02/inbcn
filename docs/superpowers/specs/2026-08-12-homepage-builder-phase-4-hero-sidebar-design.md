# Homepage Builder Phase 4: Hero Sidebar Design

**Date:** 2026-08-12
**Status:** Approved

## Objective

Add an independent `hero-sidebar` Homepage Builder block that lets editors select one to three secondary stories. When it immediately follows `hero-story`, the layout composition layer renders both blocks as one responsive hero region. In every other position, the sidebar remains visible as a standalone full-width section.

## Invariants

- `hero-story` continues to persist and render exactly one story.
- `hero-story` does not import, reference, or depend on `hero-sidebar`.
- `hero-sidebar` does not import, reference, or depend on `hero-story`.
- Adjacency composition occurs only in `HomepageBuilderLayout`.
- The legacy homepage, `HomepageViewModel`, `composeHomepageData()`, and existing story allocation remain unchanged.
- Existing server ownership, permissions, optimistic concurrency, autosave, drag-and-drop, duplication, deletion, scheduling, preview, and locale isolation remain authoritative.

## Block Contract

The block is registered as:

- Block type: `hero-sidebar`
- Renderer: `hero-sidebar`
- Label: `Hero Sidebar`

Its configuration is strict and contains only:

```json
{
  "storyIds": ["story-uuid-1", "story-uuid-2", "story-uuid-3"]
}
```

Rules:

- Minimum one ID.
- Maximum three IDs.
- Every ID is a UUID.
- IDs are unique.
- Configured order is presentation order.

## Editorial Experience

`HeroSidebarEditor` uses the shared section fields and three labeled instances of the existing Story Picker. Editors never enter UUIDs, JSON, renderer names, block IDs, locale IDs, or audit data.

Each selection updates `storyIds` without changing the order of the remaining selections. Duplicate selections are rejected in editor validation and again on the server. Existing autosave serializes only the validated editor draft and reconciles the confirmed section DTO.

The existing sortable section card treats Hero Sidebar like every other block. Duplication copies the configuration but receives a server-generated block ID. Deletion, enablement, scheduling, and locale switching reuse existing pipelines.

## Server Validation

The service uses `findPublishedStoryForLocale()` for every configured ID. This retains the existing definition of published and currently publishable content and avoids page-limited discovery validation.

The service also loads the locale-owned section list to enforce cross-block uniqueness:

- Saving Hero Sidebar rejects the current Hero Story ID.
- Saving Hero Story rejects IDs configured in an immediately adjacent Hero Sidebar.
- Sidebar-internal duplicates are rejected before reference lookups.

Adjacency is evaluated from the server-confirmed section order. A newly created sidebar has no preceding persisted neighbor until insertion, so the service validates against the current locale Hero Story section that will precede its append position. Updates use the current ordered section list and the section's current position.

All failures use existing typed action results. Internal exceptions remain sanitized.

## Runtime Resolution

The reference resolver reads `storyIds`, looks up matching entries in `HomepageViewModel.all`, preserves configured order, and omits missing entries. Because `all` is already locale-scoped and currently publishable, no new query or model is introduced.

Runtime disappearance is fail-soft for this block:

- One unavailable story removes only that card.
- Zero available stories produce an empty Hero Sidebar node.
- Hero Story and all other Homepage Builder sections continue rendering.
- The sidebar never causes a legacy-homepage fallback solely because an externally changed story is no longer available.

The renderer contract adds a dedicated `hero-sidebar` payload kind containing `stories`. The renderer presents image, headline, summary, published date, category, and story link using existing homepage story image and date primitives.

## Layout Composition

Prepared sections retain their block type so the layout can recognize adjacency without inspecting React elements.

`HomepageBuilderLayout` performs a single ordered scan:

1. If the current non-empty section is `hero-story` and the next non-empty section is `hero-sidebar`, render both inside a `proto-hero-composition` region and advance by two.
2. Otherwise render the current section normally.
3. Empty Hero Sidebar nodes are omitted and do not consume or resize the Hero Story.

Desktop composition uses approximately 70%/30%. Tablet and mobile stack the two independent nodes. A non-adjacent Hero Sidebar is wrapped as a normal full-width section regardless of its stored width; its configured container and width remain persisted and editable for compatibility, while this block's standalone public presentation intentionally spans the available content width.

No renderer detects adjacency or imports the other renderer.

## Accessibility

- Each picker has a unique accessible name: Secondary Story 1, 2, and 3.
- Picker selection announcements reuse the existing accessible dialog/live-region behavior.
- Sidebar cards use semantic articles and linked headings.
- Story images retain editorial alt text.
- Links and picker controls retain visible focus styles.
- The composed region has an accessible hero-region label without duplicating heading semantics.

## Responsive Presentation

- Desktop: adjacent blocks use a 70/30 grid.
- Tablet: adjacent blocks stack with the sidebar beneath the hero.
- Mobile: single-column cards.
- Standalone: full-width section with a responsive one-to-three-card layout.

## Failure Handling

- Invalid editor configuration cannot autosave.
- Missing, unpublished, scheduled-future, or wrong-locale stories fail server mutation validation.
- Runtime-unavailable stories are omitted safely.
- Zero runtime stories render no sidebar markup and do not throw.
- Unexpected failures elsewhere retain the existing all-or-nothing legacy fallback.

## Testing Strategy

Focused tests cover:

- Registry and strict configuration contract.
- Draft mapping and editor validation.
- Duplicate prevention and targeted locale-aware validation.
- Hero/Sidebar cross-block conflicts in both mutation directions.
- Renderer payload ordering and unavailable-story omission.
- Dedicated renderer markup and accessibility.
- Adjacent composition and standalone rendering.
- Responsive CSS hooks.
- Preview, autosave, drag-and-drop, duplication, deletion, permissions, and locale regression contracts.
- Unchanged Hero Story and legacy homepage behavior.

## Non-goals

- Changing Hero Story.
- Changing the reducer contract or reducer behavior.
- Changing `HomepageViewModel` or `composeHomepageData()`.
- Changing Trending, Category, Breaking News, or Latest News allocation.
- Introducing client-side preview state, live preview, polling, or automatic refresh.
- Adding a database migration or new dependency.

