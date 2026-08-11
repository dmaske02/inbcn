# INBCN Homepage Builder Phase 3 Editorial UX Design

## Status and decision

**Implementation status (2026-08-12): Complete.** Milestones 1–9 now provide the server-authoritative visual workspace, targeted discovery, typed mutations, accessible visual editors, section-scoped auto-save, atomic ordering, safe duplication/deletion, protected persisted preview, final route integration, and removal of the legacy developer editor. Phase 4 concerns remain excluded.

This document defines Phase 3 only. Homepage Builder persistence, repository operations, domain validation, renderer registration, public rendering, locale isolation, scheduling, ordering, and all-or-nothing public fallback remain authoritative.

Phase 3 adopts a **server-authoritative editorial workspace** with a focused client-side state machine. Editors use visual, block-specific controls; Server Actions authenticate and validate every read or mutation; existing services and repositories remain the only persistence boundary. The workspace optimistically reflects safe UI changes, but the server response is always the canonical saved state.

The visual preview uses a protected, same-origin preview route inside an iframe. It renders the persisted configuration through the existing Phase 1 preview composer and Phase 2 renderer registry. Desktop, tablet, and mobile modes change the iframe viewport rather than approximating responsive behavior with editor-only CSS.

## Goals

Phase 3 makes `/admin/homepage-builder` usable by newsroom editors who do not know internal identifiers or configuration formats. It provides:

- locale-aware searchable story and category selection;
- purpose-built editors for all ten registered block types;
- zero-configuration Live TV insertion;
- accessible drag-and-drop ordering with keyboard parity;
- an accurate visual, responsive homepage preview;
- duplicate and confirmed delete workflows;
- explicit unsaved, saving, saved, validation, conflict, and failure states;
- section-scoped auto-save without weakening server validation;
- predictable performance with paginated reads and no client Supabase access.

## Constraints inherited from Phases 1 and 2

- EN, HI, and MR each continue to have one directly managed live configuration.
- The persisted `homepage_configurations` and `homepage_sections` model remains unchanged.
- The existing block registry remains the source of truth for supported block type, renderer, defaults, and configuration validation.
- Existing authorization remains unchanged: writers are read-only; editors and administrators can mutate.
- Public output remains all-or-nothing and continues to use the complete legacy homepage when builder resolution fails.
- Phase 3 does not make the public renderer consume client state or incomplete edits.
- React components never query Supabase directly.
- No credentials, raw SQL, configuration JSON, or internal exception details are exposed to editors or public visitors.

## Considered approaches

### Recommended: server-authoritative workspace with protected iframe preview

The route loads a server view, hydrates a narrow client workspace, and performs authenticated searches and mutations through typed Server Actions. Valid changes auto-save section by section. On a successful save, the preview iframe refreshes and renders the same persisted data and renderer registry used by production.

This approach gives accurate rendering, preserves the current repository/service architecture, works when the public feature flag is disabled, and prevents previewing data the server would reject.

### Rejected: fully client-side builder and renderer

Keeping a complete homepage model in a global client store would make instant preview easy, but would duplicate Phase 1 validation and Phase 2 rendering contracts, ship unnecessary JavaScript, and risk differences between editor preview and public output.

### Rejected: edit directly on the public homepage

An overlay editor would couple public rendering to admin state, complicate authentication and fallback behavior, and create a larger regression surface for SEO, localization, and the existing public layout.

## User experience model

The primary workspace contains three regions:

1. **Toolbar:** locale tabs, preview viewport controls, save status, and “Add section.”
2. **Section rail:** ordered section cards with drag handles, status/schedule summaries, duplicate, enable/disable, edit, and delete controls.
3. **Inspector and preview:** a block-specific inspector and a persisted visual homepage preview. On wide screens they are side by side; on smaller admin screens they become tabs without changing the preview viewport selection.

The editor never displays UUIDs, renderer identifiers, block IDs, or JSON. Stable IDs and renderer values remain hidden and are generated or resolved on the server.

Selecting a locale navigates to the existing query-based locale route. If local work is dirty or a save is in flight, the workspace asks the editor to stay or discard the unsaved local changes before navigation.

## Feature folder structure

The implementation should extend the existing feature rather than create a competing builder:

```text
src/features/homepage-builder/
├── components/
│   ├── workspace/
│   │   ├── homepage-builder-workspace.tsx
│   │   ├── homepage-builder-toolbar.tsx
│   │   ├── homepage-editor-status.tsx
│   │   ├── homepage-inspector.tsx
│   │   └── homepage-preview-frame.tsx
│   ├── sections/
│   │   ├── section-list.tsx
│   │   ├── sortable-section-card.tsx
│   │   ├── section-summary.tsx
│   │   ├── duplicate-section-button.tsx
│   │   └── delete-section-dialog.tsx
│   ├── editors/
│   │   ├── block-editor-registry.ts
│   │   ├── shared-section-fields.tsx
│   │   ├── hero-story-editor.tsx
│   │   ├── category-section-editor.tsx
│   │   ├── list-block-editor.tsx
│   │   ├── live-tv-editor.tsx
│   │   ├── advertisement-editor.tsx
│   │   └── placeholder-editor.tsx
│   └── pickers/
│       ├── story-picker.tsx
│       ├── category-picker.tsx
│       ├── picker-dialog.tsx
│       ├── picker-results.tsx
│       └── picker-pagination.tsx
├── editor/
│   ├── homepage-editor.types.ts
│   ├── homepage-editor.reducer.ts
│   ├── homepage-editor.validation.ts
│   ├── use-homepage-autosave.ts
│   └── use-unsaved-changes-guard.ts
├── search/
│   ├── homepage-picker.types.ts
│   ├── homepage-picker.repository.ts
│   └── homepage-picker.service.ts
├── preview/
│   └── homepage-editor-preview.service.ts
├── homepage-builder.actions.ts
├── homepage-builder.repository.ts
├── homepage-builder.service.ts
└── existing Phase 1 files

src/app/(internal)/homepage-builder-preview/[locale]/
└── page.tsx
```

The exact route group name is internal and does not affect the URL. The preview URL must not live beneath the existing admin shell because the shell would distort viewport measurements inside the iframe. The preview page authenticates independently with `requireAdminUser()`, sets `robots: noindex, nofollow`, and has no public navigation entry.

## Component hierarchy

```text
HomepageBuilderPage (Server Component)
└── HomepageBuilderWorkspace (Client boundary)
    ├── HomepageBuilderToolbar
    │   ├── LocaleNavigation
    │   ├── HomepageEditorStatus
    │   ├── PreviewViewportSelector
    │   └── AddSectionMenu
    ├── SectionList
    │   └── SortableSectionCard[]
    │       ├── DragHandle
    │       ├── SectionSummary
    │       ├── EnableToggle
    │       ├── DuplicateSectionButton
    │       └── DeleteSectionDialog
    ├── HomepageInspector
    │   ├── SharedSectionFields
    │   └── RegisteredBlockEditor
    │       ├── StoryPicker | CategoryPicker
    │       ├── ListBlockEditor
    │       ├── LiveTvEditor
    │       ├── AdvertisementEditor
    │       └── PlaceholderEditor
    └── HomepagePreviewFrame
        └── protected preview route
            └── existing HomepageBuilderLayout + renderer registry
```

`block-editor-registry.ts` is the single mapping from block type to its visual editor and editor metadata. It complements rather than replaces `homepage-builder.registry.ts`: the existing registry owns persistence validation; the visual registry owns editor presentation. A contract test requires identical block-type membership so a registered persisted block cannot silently lack an editor.

## Editor state management

No application-wide state library is needed. One `useReducer` instance belongs to the workspace and contains only editorial UI state:

```text
baseSections         last server-confirmed DTOs
draftsBySectionId    normalized visual form values
selectedSectionId    active inspector selection
newSectionDraft      unsaved add-section form, if present
orderedIds           optimistic display order
dirtySectionIds      sections changed since server acknowledgement
validationById       field-level client validation messages
saveStateById        idle | dirty | saving | saved | error | conflict
previewRevision      incremented after confirmed mutations
viewport             desktop | tablet | mobile
pendingDeleteId      section awaiting confirmation
```

Reducer events are explicit: initialize, select, edit field, validate, save started, save succeeded, save failed, reorder optimistic, reorder reverted, duplicate succeeded, delete succeeded, and locale changed. Reducer functions are pure and tested without React.

Server DTOs remain canonical. A successful mutation replaces the affected draft and base DTO with the returned server DTO. A failed mutation keeps the draft, presents the error, and does not refresh the preview. Structural mutation failures roll the ordered list back to the last server-confirmed order.

## Auto-save and unsaved changes

Auto-save applies only to an existing section whose visual form is locally valid:

- debounce for 1,000 milliseconds after the most recent field change;
- save one section at a time, with changes to other sections queued independently;
- abort or ignore stale responses using a monotonically increasing request sequence per section;
- send the last known `updatedAt` value for optimistic concurrency;
- replace local state only with the returned, validated server DTO;
- retry only after another edit or an explicit “Retry” action; never loop automatically;
- refresh the preview only after a confirmed save.

Creating a section is explicit because a new Hero or Category block is incomplete until a reference is selected. Reorder, enable/disable, duplicate, and delete are deliberate immediate mutations and are not debounced.

The status indicator announces `Unsaved changes`, `Saving…`, `Saved at HH:MM`, `Could not save`, or `Changed elsewhere—reload required`. `beforeunload` is registered only while dirty or saving. Internal locale changes and section navigation preserve harmless drafts; leaving the builder or switching locale requires confirmation when unsaved work exists.

Optimistic concurrency uses the existing `updated_at` column and requires no schema change. Repository updates match both section ID and expected `updated_at`; a zero-row update becomes a stable `CONFLICT` domain error. This is overwrite protection, not collaborative editing.

## Visual block editors

All editors produce the existing `HomepageSectionInput` shape internally. The UI never exposes that shape directly.

### Hero Story

The Hero editor shows the chosen story card and a “Choose story” button. The picker returns a published story in the active locale. Clearing the choice makes the local form invalid and prevents auto-save. The stored configuration remains `{ storyId }`.

### Category Section

The editor shows the selected category, published story count, and a bounded item-count control. The stored configuration remains `{ categoryId, limit }`.

### Breaking News, Latest News, Trending, and Opinion

These blocks share `list-block-editor.tsx`. Editors choose the number of items with a labelled numeric control constrained by the existing registry schema. Content continues to resolve from the existing homepage datasets; Phase 3 does not introduce manual story pinning for these blocks.

### Live TV

Adding Live TV stores the existing empty configuration object. The inspector explains that the block automatically uses Live TV for the active locale and shows configuration availability as read-only status. No provider, stream, room, token, or URL control appears.

### Advertisement

The editor provides a human-readable label field with the existing length constraint. It remains the existing advertisement placeholder; Phase 3 does not introduce ad serving or campaign management.

### Placeholder blocks

Custom HTML Placeholder provides a plain editorial note field but never executes or visually injects HTML. Future Placeholder provides a note field. Both clearly indicate that they are safe placeholders. The registry’s existing configuration schemas remain authoritative.

### Shared section fields

Title, enabled state, schedule, container, and width use labelled visual controls. `blockId` is generated on the server from block type plus a collision-resistant suffix and never appears in the editor. Renderer selection is derived from the existing block registry and never submitted as an editor-controlled value.

## Story picker architecture

The story picker is an accessible modal dialog with a search field, results list, pagination controls, and selection summary.

The search service accepts only:

```text
locale: en | hi | mr
query: normalized string, 0–120 characters
page: positive integer
pageSize: fixed at 20
```

The repository resolves the locale to `language_id` server-side and queries `stories` with `status = published` and that exact language. Results order by `published_at DESC, id DESC`, use a stable range for the requested page, and request a count. Search matches the supported indexed editorial search path; it must not fetch all stories into the browser. Each result contains only ID, title, publication date, category summary, and resolved thumbnail presentation data. IDs are carried internally but never rendered as text.

The picker debounces search input by 300 milliseconds, rejects stale responses, resets to page 1 when the query changes, and keeps the previously selected story visible while a new page loads. Empty, loading, error, and no-results states are distinct. Selecting a result returns a typed option to the editor and moves focus back to the opener.

Validation on save performs a targeted authoritative lookup by selected story ID, locale language, and published status. Search results are discovery data, not authorization or validation evidence.

## Category picker architecture

The category picker uses the same dialog, query lifecycle, pagination, keyboard behavior, and stale-response protection. It queries active categories for the locale and returns each category’s count of published stories in that locale. Results order by configured category sort order and name, with ID as a deterministic tie-breaker.

Category counts are calculated server-side in the repository/service boundary. The browser never loads stories merely to count them. Save validation performs a targeted active-category lookup for the selected locale.

## Server Actions and service boundaries

Phase 3 adds typed, non-redirecting actions for the interactive workspace while retaining the existing redirecting actions until the old form components are removed in the same implementation milestone.

Read actions:

- `searchHomepageStories(input): Promise<PickerPage<StoryPickerOption>>`
- `searchHomepageCategories(input): Promise<PickerPage<CategoryPickerOption>>`

Mutation actions:

- `createVisualHomepageSection(input): Promise<EditorActionResult<HomepageSectionDto>>`
- `saveVisualHomepageSection(input): Promise<EditorActionResult<HomepageSectionDto>>`
- `moveHomepageSectionTo(input): Promise<EditorActionResult<readonly HomepageSectionDto[]>>`
- `duplicateVisualHomepageSection(input): Promise<EditorActionResult<HomepageSectionDto>>`
- `setVisualHomepageSectionEnabled(input): Promise<EditorActionResult<HomepageSectionDto>>`
- `deleteVisualHomepageSection(input): Promise<EditorActionResult<{ id: string }>>`

Every action calls `requireAdminUser()`, parses a Zod action schema, delegates to the service, returns a discriminated safe result, and revalidates only the admin builder and affected locale homepage after successful persistence. Public revalidation is appropriate because Phase 3 edits the one live configuration directly.

Actions never accept a client-controlled renderer, language ID, configuration ID, audit identity, position for creation, or persisted block ID. The service derives those values from locale, registry, authenticated identity, and current repository state.

Services own authorization, targeted reference validation, block-to-visual-input mapping, duplication semantics, conflict handling, and preview composition. Repositories own Supabase query construction, DTO mapping, targeted lookups, persistence, and ordering RPC calls. UI components know neither table names nor database fields.

## Drag-and-drop ordering

Use `@dnd-kit/core` and `@dnd-kit/sortable` during implementation, subject to explicit dependency approval. This provides pointer, touch, and keyboard sensors without relying on inaccessible native HTML drag-and-drop.

The persisted position remains contiguous and zero-based. Dropping sends section ID, locale, target index, and expected ordered IDs. The server reloads current sections, validates membership and target bounds, then performs one atomic move-to-index operation. The operation shifts the affected range and preserves the existing unique position constraint.

Production-safe drag ordering requires an additive database RPC accepting `section_id` and `target_position`; this extends the existing atomic ordering contract without altering either table. The implementation plan must not emulate a long move with repeated up/down network calls because that is non-atomic and can leave surprising intermediate public orders. The migration is future implementation work; this design task creates no migration.

The client optimistically reorders for responsiveness and rolls back on failure. Keyboard users focus the drag handle, press Space/Enter to lift, use arrow keys to move, and press Space/Enter to drop or Escape to cancel. A polite live region announces source and destination positions.

## Duplicate and delete

Duplicate is a server mutation. It reloads the source section in the locale configuration, copies its user-editable fields and validated configuration, generates a unique block ID, appends “Copy” to the editorial title within the existing length limit, inserts immediately after the source, and returns the new DTO. It does not copy audit fields, timestamps, or section ID.

Delete always opens a modal confirmation naming the section and locale. The destructive action receives focus only after the explanatory text. Cancel returns focus to the initiating button. A successful delete removes the card, selects the nearest remaining section, refreshes the preview, and announces completion. No deletion occurs from a single unconfirmed click.

## Preview architecture

`homepage-editor-preview.service.ts` reuses:

- the locale’s persisted configuration and ordered sections;
- the Phase 1 preview composer and schedule rules;
- Phase 2 reference resolution, payload contract, renderer registry, and builder layout;
- existing homepage presentation components.

It does not use the public feature flag and does not silently render the legacy homepage. Because this is an authenticated editorial diagnostic surface, invalid configuration produces an editor-safe preview error with section title/type when available. It still logs only sanitized server metadata.

The preview route renders only the homepage canvas needed for fidelity, without the admin shell. It is authenticated on every request, same-origin, non-indexable, and frameable only by the same origin. The workspace iframe URL includes a non-sensitive `revision` query value after saves to force refresh; it never includes section configuration or credentials.

Viewport presets are fixed CSS pixel widths:

- desktop: 1440px;
- tablet: 768px;
- mobile: 390px.

The iframe scales within available editor space while retaining its internal viewport width, so existing media queries execute accurately. Preview controls expose their selected state with `aria-pressed`. Preview refresh does not steal focus or announce on every keystroke; it announces only confirmed refresh success or failure.

## Validation and error presentation

Validation occurs at three layers:

1. Visual editor validation gives immediate field-level guidance using the same bounds and requiredness as the block registry.
2. Server Action schemas reject malformed transport data and client-controlled internal fields.
3. Existing service/registry/reference validation remains authoritative before repository writes.

Field errors appear adjacent to controls and are connected with `aria-describedby`. A summary at the top of the inspector appears after an attempted create/save with invalid fields and links focus to the first invalid control.

Expected errors use stable codes: `VALIDATION`, `REFERENCE_MISSING`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `ORDERING`, and `PERSISTENCE`. Editors receive actionable, non-sensitive messages. Unexpected repository or runtime exceptions are logged server-side and become a generic retryable message. Toasts alone are insufficient; persistent inline status remains until resolved.

## Accessibility strategy

- Meet WCAG 2.2 AA for the editorial workflow.
- Preserve logical DOM order independently of visual pane placement.
- Use native buttons, inputs, headings, lists, and fieldsets before ARIA.
- Give dialogs an accessible name, description, focus trap, Escape behavior, and deterministic focus restoration.
- Provide complete keyboard parity for search, selection, reorder, duplicate, delete, viewport switching, and all form controls.
- Use roving focus or standard listbox behavior in picker results, not clickable `div` elements.
- Announce save status, validation failures, reorder results, deletion, preview refresh, and search result counts through appropriately scoped live regions.
- Never announce each autosave keystroke.
- Maintain visible focus indicators and existing design-system contrast.
- Pair icons with accessible names; do not rely on color, position, or drag visuals alone.
- Respect reduced motion for reorder and preview transitions.
- Preserve selected stories/categories when zoomed to 200% and at narrow admin widths.

## Performance strategy

- Keep the route and preview server-first; hydrate only the workspace controls.
- Do not preload the existing 200-story reference list into the client. Search and targeted validation replace bulk discovery reads.
- Use fixed 20-item picker pages and select only display fields.
- Debounce search by 300ms and section saves by 1,000ms.
- Ignore stale action responses; do not issue duplicate identical searches.
- Cache immutable-in-request locale mapping and renderer metadata on the server.
- Resolve category counts server-side and avoid N+1 story queries.
- Refresh only the preview iframe after confirmed writes rather than refreshing the entire admin route.
- Lazy-mount picker dialogs and keep preview iframe loading state explicit.
- Continue resolving Live TV only when a Live TV section exists.
- Keep public rendering and its caching behavior unchanged.

## Security and privacy

- All picker, preview, and mutation endpoints require an authenticated editorial session.
- Writers may search and preview but cannot receive mutation controls and remain denied by the service.
- Locale is validated against `en`, `hi`, and `mr`; language IDs come from the server.
- Search query length and page bounds are validated before repository access.
- Renderer and block IDs are derived from the registry.
- Preview routes are non-indexable, same-origin framed, and never accept serialized configuration in URLs.
- No raw HTML is executed by placeholder blocks.
- Logs contain only locale, block ID/type, safe error code, and sanitized message.

## Testing strategy

### Unit tests

- editor reducer transitions, stale save handling, rollback, selection, and dirty tracking;
- visual-to-domain input mapping for every block type;
- client validation parity with existing registry bounds;
- picker query normalization, paging, locale mapping, and option mapping;
- duplicate naming/ID generation and optimistic concurrency;
- preview viewport state and autosave timing with fake timers.

### Service and repository contract tests

- published, same-locale story search and targeted validation;
- active, same-locale category search and published story counts;
- deterministic pagination and ordering;
- zero-configuration Live TV mapping;
- writer denial and editor/admin authorization;
- conflict detection through `updated_at`;
- atomic move-to-index and contiguous positions;
- duplicate insertion and delete compaction;
- safe action error contracts and revalidation scope.

### Component tests

- keyboard-accessible story and category pickers;
- camera-free visual block editors for all ten types;
- drag handle keyboard workflow and announcements;
- delete confirmation and focus restoration;
- dirty-navigation guard and save status announcements;
- field error association and focus management;
- desktop/tablet/mobile preview controls.

### Integration and regression tests

- an editor can add, configure, reorder, duplicate, disable, schedule, preview, and delete a section without seeing an ID or JSON;
- writers remain read-only;
- preview uses persisted validated data and the renderer registry;
- public builder remains all-or-nothing;
- feature flag behavior, legacy fallback, locale isolation, Live TV, SEO, Stories, Categories, RSS, Broadcast Studio, and public routing remain unchanged;
- all ten registered blocks have exactly one visual editor and one renderer.

### Verification

Every milestone ends with focused tests. Final verification remains:

```text
npm test
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

Browser verification covers Chromium keyboard-only operation, responsive iframe presets, focus restoration, auto-save status, and at least one successful story/category selection in EN, HI, and MR.

## Non-goals

Phase 3 does not include:

- draft or published homepage states;
- approval or publishing workflows;
- revision history, rollback, or restore;
- scheduled publication of a complete homepage configuration;
- preview links or externally shareable preview environments;
- collaborative presence, cursors, record locking, or merge resolution;
- analytics, experiments, personalization, or audience targeting;
- manual story pinning for Breaking, Latest, Trending, or Opinion blocks;
- advertisement campaigns, inventory, targeting, or analytics;
- custom HTML execution;
- changes to Live TV CMS, LiveKit, Broadcast Studio, public playback, Stories, Categories, RSS, SEO, metadata, or structured data.

## Future compatibility

The stable configuration row remains the future parent for revisions and publication records. Visual editors produce the same validated configuration objects already consumed by the renderer, so future revisions can snapshot sections without changing editor contracts. Typed action results can later add revision IDs, and the preview service can later accept a revision source, without changing individual block editors or renderers.

The client reducer deliberately distinguishes server-confirmed base state from local drafts. Future collaborative or draft workflows can replace the save transport and conflict policy while retaining visual editor components. Neither capability is implemented in Phase 3.

## Self-review

- **Architecture conflicts:** No client Supabase access, duplicate renderer registry, public preview bypass, or alternate persistence model is introduced. The only new SQL capability proposed for implementation is an additive atomic move-to-index RPC over the existing positions.
- **Repository conflicts:** Search and targeted reference reads are focused additions. Existing Phase 1 reads/writes remain valid; targeted validation removes dependence on the current 200-story discovery limit without weakening validation.
- **Performance:** Paginated discovery, targeted validation, server-side counts, delayed saves, and isolated iframe refresh prevent bulk client payloads and full route refreshes.
- **Maintainability:** Visual block editors are registered once, shared editors cover structurally identical blocks, reducer logic is pure, and services remain framework-independent where practical.
- **Extensibility:** A new block requires its existing domain registry entry, renderer registration, visual editor registration, and tests. No route or service switch statement is added.
- **Backward compatibility:** Persistence shapes, renderer contracts, public fallback, authorization roles, locales, and existing routes remain intact. The preview route is additive and protected.
- **Scope:** Drafts, revisions, publishing, collaboration, analytics, and shareable previews remain explicitly deferred.
