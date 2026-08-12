# INBCN Homepage Builder Phase 3 Editorial UX Implementation Plan

**Implementation status (2026-08-12): Complete.** All nine milestones are integrated. The final route uses `HomepageBuilderWorkspace`, the legacy developer editor is removed, and the automated regression, type, lint, production-build, and whitespace checks pass. An authenticated Chromium session is still required for the operational keyboard-only and 200% zoom walkthrough; protected-route redirection was verified without exposing or creating credentials.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the developer-oriented Homepage Builder form with a visual, locale-aware, accessible newsroom workspace while preserving the existing persistence, validation, renderer, and public fallback architecture.

**Architecture:** Keep the server authoritative. Add authenticated paginated picker reads, typed interactive Server Actions, pure reducer-driven workspace state, block-specific visual editors, an additive atomic move-to-index operation, and a protected iframe preview that renders persisted data through the existing Phase 2 registry.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Server Actions, Supabase/PostgreSQL, Zod 4, React Hook Form, existing INBCN UI primitives, and—after explicit dependency approval—`@dnd-kit/core` plus `@dnd-kit/sortable`.

## Global constraints

- Do not redesign or weaken Homepage Builder Phases 1 or 2.
- Preserve one live configuration per locale for EN, HI, and MR.
- Preserve editor/admin mutation and writer read-only authorization.
- Never expose UUIDs, JSON configuration, renderer IDs, database IDs, or internal errors in the editorial UI.
- React components must not query Supabase.
- Existing registry schemas and server reference validation remain authoritative.
- Public rendering remains all-or-nothing with the complete legacy fallback.
- Do not implement drafts, publishing workflows, revisions, rollback, collaborative editing, scheduled whole-homepage publishing, analytics, or shareable previews.
- Read the relevant local Next.js 16 documentation in `node_modules/next/dist/docs/` immediately before implementation.
- Use test-first development and do not commit or push unless a later user request explicitly authorizes it.

## Planned file map

### Create

- `src/features/homepage-builder/editor/homepage-editor.types.ts` — normalized client workspace and action-result contracts.
- `src/features/homepage-builder/editor/homepage-editor.reducer.ts` — pure editor state transitions.
- `src/features/homepage-builder/editor/homepage-editor.validation.ts` — visual field validation and domain-input mapping.
- `src/features/homepage-builder/editor/use-homepage-autosave.ts` — debounced, stale-safe section saves.
- `src/features/homepage-builder/editor/use-unsaved-changes-guard.ts` — unload and internal-navigation protection.
- `src/features/homepage-builder/search/homepage-picker.types.ts` — picker input, page, story option, and category option contracts.
- `src/features/homepage-builder/search/homepage-picker.repository.ts` — paginated Supabase discovery queries and targeted lookups.
- `src/features/homepage-builder/search/homepage-picker.service.ts` — auth-aware locale mapping, input validation, counts, and option composition.
- `src/features/homepage-builder/preview/homepage-editor-preview.service.ts` — protected persisted preview composition using Phase 1/2 contracts.
- `src/features/homepage-builder/components/workspace/*` — toolbar, inspector, save status, workspace, and iframe.
- `src/features/homepage-builder/components/sections/*` — sortable list, cards, summaries, duplicate control, and confirmation dialog.
- `src/features/homepage-builder/components/editors/*` — visual editor registry and all block-specific editors.
- `src/features/homepage-builder/components/pickers/*` — reusable picker dialog, results, pagination, story picker, and category picker.
- `src/app/(internal)/homepage-builder-preview/[locale]/page.tsx` — authenticated, no-index preview canvas outside the admin shell.
- Focused `*.test.mjs` and `*.contract.test.mjs` files beside each new boundary.
- One additive Supabase migration for an atomic `move_homepage_section_to(section_id, target_position)` RPC, created only during implementation after approval.

### Modify

- `src/app/admin/(protected)/homepage-builder/page.tsx` — render the new server-loaded workspace.
- `src/features/homepage-builder/homepage-builder.actions.ts` — add typed search and mutation actions.
- `src/features/homepage-builder/homepage-builder.repository.ts` — add targeted conflict-aware writes and atomic reorder adapter.
- `src/features/homepage-builder/homepage-builder.operations.ts` — add duplicate, explicit enabled-state, move-to-index, and conflict semantics.
- `src/features/homepage-builder/homepage-builder.service.ts` — compose the lean editorial view and targeted reference validation.
- `src/features/homepage-builder/homepage-builder.types.ts` — add only shared server-facing editor contracts that do not belong in client state.
- `src/lib/supabase/database.types.ts` — regenerate after the approved additive RPC migration.
- Existing builder contract tests — replace developer-form expectations with visual-workspace expectations while retaining authorization and isolation assertions.

## Recommended implementation order

1. Contracts and pure editor state.
2. Search repository/service and targeted reference validation.
3. Typed Server Actions and conflict-aware mutations.
4. Visual block editors and pickers.
5. Auto-save and unsaved-change handling.
6. Atomic drag-and-drop ordering.
7. Duplicate and confirmed delete.
8. Protected visual responsive preview.
9. Workspace integration, accessibility hardening, and complete regression verification.

This order establishes typed server boundaries before UI, keeps each milestone independently reviewable, and delays the new drag dependency and SQL RPC until ordinary editing works.

---

## Milestone 1: Editor contracts and deterministic state

**Goal:** Define a framework-light state model that separates server-confirmed sections from local visual drafts and makes saving, stale responses, validation, conflicts, and rollback deterministic.

**Files:**

- Create `src/features/homepage-builder/editor/homepage-editor.types.ts`.
- Create `src/features/homepage-builder/editor/homepage-editor.reducer.ts`.
- Create `src/features/homepage-builder/editor/homepage-editor.validation.ts`.
- Create focused reducer and validation tests beside those files.
- Modify `src/features/homepage-builder/homepage-builder.types.ts` only for genuinely shared server contracts.

**Interfaces:**

- `HomepageEditorState` owns `baseSections`, `draftsBySectionId`, `orderedIds`, `dirtySectionIds`, `saveStateById`, selection, preview revision, and viewport.
- `HomepageEditorEvent` is a discriminated union for initialization, edits, validation, saves, reorder/rollback, duplicate, delete, and viewport changes.
- `toHomepageSectionInput(draft, registryDefinition)` produces the existing server input without exposing JSON.
- `EditorActionResult<T>` is `{ ok: true; data: T } | { ok: false; code: EditorErrorCode; message: string; fieldErrors?: Record<string,string> }`.

**Dependencies:** Existing `HomepageSectionDto`, locale/layout types, and block registry. No package changes.

**Risk:** A reducer that mirrors server domain logic could drift. Keep it limited to presentation state and basic field feedback; always revalidate on the server.

**Test-first steps:**

- [ ] Write failing tests for initialize/select/edit/dirty/save-start/save-success/save-failure/conflict events.
- [ ] Add tests proving stale save success cannot overwrite a newer draft.
- [ ] Add tests for optimistic reorder and exact rollback to the server-confirmed order.
- [ ] Add table-driven tests mapping all ten visual editor drafts to the current registry configuration shapes.
- [ ] Implement the minimal contracts, reducer, and mapping functions.
- [ ] Run the focused tests, TypeScript, and lint.

**Acceptance criteria:** Pure tests demonstrate deterministic state; no React component, repository, or Supabase dependency exists in the reducer; all ten block types map to existing schemas; UUID/renderer/configuration internals are absent from user-facing field definitions.

## Milestone 2: Paginated story and category discovery

**Goal:** Give editors authenticated, locale-scoped discovery data without loading bulk references or trusting search results as validation evidence.

**Files:**

- Create `src/features/homepage-builder/search/homepage-picker.types.ts`.
- Create `src/features/homepage-builder/search/homepage-picker.repository.ts`.
- Create `src/features/homepage-builder/search/homepage-picker.service.ts`.
- Create repository/service tests.
- Modify `src/features/homepage-builder/homepage-builder.service.ts` to validate selected references through targeted lookups.

**Interfaces:**

- `searchStories({ locale, query, page, pageSize: 20 }): Promise<PickerPage<StoryPickerOption>>`.
- `searchCategories({ locale, query, page, pageSize: 20 }): Promise<PickerPage<CategoryPickerOption>>`.
- `findPublishedStoryForLocale(storyId, locale)` and `findActiveCategoryForLocale(categoryId, locale)` return one option or `null`.
- Story options expose title, publication date, category summary, and resolved thumbnail data; category options expose name and published story count.

**Dependencies:** Existing language, story, category, and media tables plus existing story image resolution helpers. No client database access and no new package.

**Risk:** Category counts can become N+1 queries. Use one aggregate/embedded count query or one bounded aggregate query per page, then map in the service. Verify generated Supabase semantics with repository contract tests.

**Test-first steps:**

- [ ] Write failing repository contract tests for `status = published`, exact language filtering, deterministic ordering, range pagination, safe selected columns, and counts.
- [ ] Write service tests for locale parsing, query normalization, page bounds, and same-locale mapping.
- [ ] Add regression tests showing a valid published story beyond the former 200-item discovery limit passes targeted validation.
- [ ] Implement the repository and service reads.
- [ ] Replace bulk candidate membership validation with targeted authoritative validation while preserving the existing error message and fail-closed behavior.
- [ ] Run focused tests, TypeScript, lint, and existing Homepage Builder service tests.

**Acceptance criteria:** Pickers can page through published same-locale stories and active same-locale categories; counts are server-calculated; targeted save validation cannot fail because an item is outside a discovery page; drafts and cross-locale records remain rejected.

## Milestone 3: Typed interactive Server Actions and mutation semantics

**Goal:** Provide non-redirecting authenticated actions suitable for auto-save while retaining server ownership of internal fields and audit data.

**Files:**

- Modify `src/features/homepage-builder/homepage-builder.actions.ts`.
- Modify `src/features/homepage-builder/homepage-builder.operations.ts`.
- Modify `src/features/homepage-builder/homepage-builder.repository.ts`.
- Modify `src/features/homepage-builder/homepage-builder.service.ts`.
- Add action, operation, service, and repository tests.

**Interfaces:**

- Add the read/mutation actions listed in the design document.
- `updateSectionIfCurrent(id, expectedUpdatedAt, values)` either returns the updated DTO or a stable conflict result.
- Creation derives configuration ID, renderer, block ID, next position, and audit identity server-side.
- Successful actions revalidate `/admin/homepage-builder` and `/${locale}`; failed actions revalidate nothing.

**Dependencies:** Milestones 1–2 and existing authentication, registry, validation, operations, repository, and revalidation utilities.

**Risk:** Server Action exceptions can leak framework error behavior or cause duplicate saves. Catch domain errors into a discriminated safe result and let unexpected errors reach only sanitized server logging.

**Test-first steps:**

- [ ] Write tests proving every action authenticates and rejects writer mutations.
- [ ] Write transport-schema tests rejecting client renderer, configuration ID, language ID, audit ID, and persisted block ID.
- [ ] Write repository tests for `id + updated_at` matching and zero-row conflict detection.
- [ ] Write revalidation tests for success-only admin and locale paths.
- [ ] Implement typed actions and conflict-aware repository/service paths.
- [ ] Keep or adapt legacy actions only until the new workspace replaces all callers; remove dead action paths in Milestone 9.
- [ ] Run focused tests, all Homepage Builder tests, TypeScript, and lint.

**Acceptance criteria:** Actions return safe typed results, internal persistence values are server-derived, writers remain denied, stale edits cannot silently overwrite newer data, and public/admin revalidation occurs only after success.

## Milestone 4: Visual editors and accessible pickers

**Goal:** Replace UUID and JSON entry with block-specific visual forms and searchable accessible dialogs.

**Files:**

- Create all files under `components/editors/` and `components/pickers/` from the file map.
- Add component and registry contract tests.
- Reuse existing UI primitives; add a shared accessible dialog primitive under `src/components/ui/` only if the project has no suitable Radix wrapper.

**Interfaces:**

- `BlockEditorProps` receives locale, normalized draft, field errors, and `onChange`; it never receives repository functions.
- `VISUAL_BLOCK_EDITOR_REGISTRY` maps each existing block type to one editor component and editor label.
- `StoryPicker` and `CategoryPicker` receive a selected typed option and return a typed option through `onSelect`.

**Dependencies:** Milestones 1–3, existing Radix package, React Hook Form if useful within inspector forms, existing Button/Card/Badge styles. No new production dependency is expected.

**Risk:** A custom dialog/listbox can introduce focus bugs. Prefer existing Radix dialog primitives and native result buttons unless a true listbox interaction is required.

**Test-first steps:**

- [ ] Write a registry contract test requiring one visual editor for each of the ten domain registry entries.
- [ ] Write tests showing Hero and Category editors display human-readable selected cards and no UUID inputs.
- [ ] Write tests for shared list editors, zero-configuration Live TV, Advertisement, and safe placeholders.
- [ ] Write picker tests for debounce, page reset, stale-response rejection, loading/empty/error states, keyboard selection, Escape, and focus restoration.
- [ ] Implement the reusable dialog/results/pagination components and block editors.
- [ ] Audit rendered markup to ensure no JSON textarea, block ID, renderer selector, or visible UUID remains.
- [ ] Run focused tests, TypeScript, lint, and accessibility assertions.

**Acceptance criteria:** Editors can configure all ten blocks visually; story/category search is locale-aware and paginated; modal focus and keyboard operation are correct; Live TV requires no configuration; no internal identifier or JSON editor is visible.

## Milestone 5: Workspace, auto-save, and navigation protection

**Goal:** Assemble a newsroom workspace with reliable section-scoped auto-save, explicit status, and protection against accidental loss.

**Files:**

- Create `components/workspace/homepage-builder-workspace.tsx`.
- Create toolbar, inspector, and status components.
- Create `editor/use-homepage-autosave.ts`.
- Create `editor/use-unsaved-changes-guard.ts`.
- Add fake-timer hook tests and workspace component tests.

**Interfaces:**

- Autosave receives editor state, dispatch, and `saveVisualHomepageSection`; it schedules only locally valid existing sections after 1,000ms.
- A per-section request sequence prevents stale responses from applying.
- The navigation guard activates only for dirty/saving state and supports locale links plus `beforeunload`.

**Dependencies:** Milestones 1, 3, and 4. No new package.

**Risk:** React Strict Mode can schedule duplicate saves or cleanup can unregister guards too early. Make timers and listeners idempotent and prove cleanup behavior in tests.

**Test-first steps:**

- [ ] Write fake-timer tests for debounce reset, independent section queues, valid-only save, retry behavior, and cleanup.
- [ ] Write tests proving stale responses do not clear newer dirty state.
- [ ] Write navigation tests for clean, dirty, and saving states plus focus-safe confirmation.
- [ ] Write status live-region tests that avoid announcing every keystroke.
- [ ] Implement hooks and workspace composition.
- [ ] Run focused tests, TypeScript, lint, and a Strict Mode regression test.

**Acceptance criteria:** Valid edits save after 1,000ms, errors retain drafts, stale responses cannot overwrite, status is persistent and accessible, preview revision changes only on confirmed saves, and leaving with unsaved work requires confirmation.

## Milestone 6: Atomic drag-and-drop ordering

**Goal:** Replace up/down controls with accessible pointer, touch, and keyboard reordering while preserving contiguous atomic positions.

**Files:**

- After explicit approval, modify `package.json` and lockfile for `@dnd-kit/core` and `@dnd-kit/sortable` only.
- Create `components/sections/section-list.tsx` and `sortable-section-card.tsx`.
- Create one additive Supabase migration defining `move_homepage_section_to`.
- Modify database types, repository, operations, service, and actions for target-index movement.
- Add migration, domain, repository, action, and component tests.

**Interfaces:**

- `moveHomepageSectionTo({ locale, sectionId, targetPosition, expectedOrder })` returns the full server-confirmed ordered DTO list.
- The RPC validates editor/admin authorization, configuration membership, bounds, and contiguous positions, then shifts the affected range in one transaction.

**Dependencies:** Milestones 1, 3, and 5; explicit approval for the two dnd-kit packages; Supabase migration tooling.

**Risk:** The unique `(configuration_id, position)` constraint can conflict during range shifts. Use a transaction-safe sentinel/range strategy consistent with the existing swap RPC and prove both move directions in database contract tests.

**Test-first steps:**

- [ ] Write migration contract tests for authorization, bounds, same-configuration membership, both move directions, and contiguous results.
- [ ] Write operation/action tests for expected-order conflicts and safe error results.
- [ ] Write component tests for pointer reorder, keyboard lift/move/drop/cancel, live announcements, and rollback.
- [ ] Implement the atomic RPC and regenerate database types.
- [ ] Implement the repository/service/action adapter and sortable UI.
- [ ] Verify no repeated up/down network loop remains.
- [ ] Run focused tests, migration validation, TypeScript, lint, and build.

**Acceptance criteria:** One drop causes one atomic server mutation; positions remain unique and contiguous; optimistic ordering rolls back exactly on failure; keyboard users have complete parity; existing public ordering remains position-authoritative.

## Milestone 7: Duplicate section and confirmed deletion

**Goal:** Add safe newsroom shortcuts without risking accidental data loss.

**Files:**

- Create `components/sections/duplicate-section-button.tsx`.
- Create `components/sections/delete-section-dialog.tsx`.
- Modify operations/service/actions for duplication.
- Add domain, action, and component tests.

**Interfaces:**

- Duplicate derives a collision-resistant block ID, inserts after the source atomically, copies only editable values, appends a bounded “Copy” title suffix, and returns the new DTO plus confirmed order.
- Delete uses the existing compacting delete operation and only executes after dialog confirmation.

**Dependencies:** Milestones 3, 5, and 6; existing dialog primitive from Milestone 4.

**Risk:** Inserting a duplicate after the source can conflict with positions. Extend the atomic database ordering operation or add a focused insert-after RPC in the same additive migration if a transaction-safe repository insert is not possible.

**Test-first steps:**

- [ ] Write duplication tests for all editable fields, new identity/audit values, unique block ID, bounded title, schedule/configuration preservation, and adjacent position.
- [ ] Write delete-dialog tests proving no mutation before confirmation, Escape/cancel behavior, and focus restoration.
- [ ] Write success tests for nearest-section selection, announcement, and preview refresh.
- [ ] Implement service/action and UI behavior.
- [ ] Run focused tests, TypeScript, lint, and database ordering tests.

**Acceptance criteria:** Duplicate creates a valid independent adjacent section; delete cannot occur in one click; focus and announcements are correct; order remains contiguous after both operations.

## Milestone 8: Protected visual and responsive preview

**Goal:** Replace structured JSON preview with an accurate authenticated rendering of the persisted homepage configuration at desktop, tablet, and mobile widths.

**Files:**

- Create `preview/homepage-editor-preview.service.ts`.
- Create `components/workspace/homepage-preview-frame.tsx`.
- Create `src/app/(internal)/homepage-builder-preview/[locale]/page.tsx` and route-level tests.
- Reuse `homepage-renderer` contracts, registry, layout, and existing presentation components without modification unless a small shared extraction is proven necessary.

**Interfaces:**

- `renderHomepageEditorPreview(locale, admin)` returns a complete builder preview or an editor-safe diagnostic result; it never selects the public legacy fallback.
- Preview URL accepts only locale and non-sensitive revision; it authenticates from the session.
- Viewport modes use internal widths 1440, 768, and 390 pixels.

**Dependencies:** Persisted successful mutations from prior milestones and existing Phase 1/2 renderer pipeline. No new package.

**Risk:** Putting the preview under the admin layout would invalidate responsive fidelity. Keep it in a protected internal route outside the shell and verify authentication/noindex/same-origin framing.

**Test-first steps:**

- [ ] Write service tests for valid rendering, scheduling, unresolved references, unsupported blocks, and sanitized editor errors.
- [ ] Write route tests for authentication, locale validation, `noindex`, absence of admin shell, and no public feature-flag dependency.
- [ ] Write frame tests for preset widths, `aria-pressed`, loading/error states, revision refresh, and focus preservation.
- [ ] Implement preview service, protected route, and iframe component using the existing renderer registry.
- [ ] Browser-test actual media-query behavior at all three widths.
- [ ] Run focused tests, TypeScript, lint, and build.

**Acceptance criteria:** Preview matches persisted renderer output, works even when the public flag is disabled, accurately triggers responsive breakpoints, never exposes data publicly, and displays editor-safe failure states without silently mixing legacy content.

## Milestone 9: Route integration, cleanup, and regression hardening

**Goal:** Make the new workspace the only Homepage Builder editorial experience and prove no regression to previous phases or adjacent systems.

**Files:**

- Modify `src/app/admin/(protected)/homepage-builder/page.tsx`.
- Remove replaced developer-oriented components only after no callers remain: `homepage-section-form.tsx`, old section list, and structured preview component.
- Update admin route/design-system/feature-isolation contract tests.
- Add end-to-end workflow and accessibility regression tests.
- Do not modify public metadata, Live TV, LiveKit, Broadcast Studio, Stories, Categories, RSS, or unrelated routes.

**Interfaces:** The page continues accepting `locale`; server selection state may retain `section` for deep links. It loads a lean initial view and passes serializable DTOs into the client workspace.

**Dependencies:** All previous milestones.

**Risk:** Removing legacy components too early can hide missing workflows. First switch the route and prove parity, then delete only files with zero imports.

**Test-first steps:**

- [x] Add an integration contract covering add, story/category selection, visual edit, auto-save, reorder, duplicate, enable/disable, schedule, preview, and confirmed delete.
- [x] Add EN/HI/MR locale isolation tests and writer read-only tests.
- [x] Add assertions that the admin UI contains no JSON editor, UUID field, block ID field, or renderer selector.
- [x] Add regression tests for all ten visual editor/domain registry/renderer memberships.
- [x] Add public regression tests for feature flag disabled, invalid builder fallback, successful builder, SEO/metadata, Live TV, Broadcast Studio, Stories, Categories, and RSS isolation.
- [x] Switch the route to the workspace and remove dead developer-form files/actions.
- [ ] Perform keyboard-only and 200% zoom browser verification in an authenticated Chromium session.
- [x] Run the complete automated verification suite.

**Acceptance criteria:** The newsroom workflow is complete without internal configuration knowledge; writers remain read-only; every required accessibility flow works; the public homepage remains either 100% builder or 100% legacy; all existing system boundaries pass regression checks.

## Final verification checklist

- [x] `npm test` reports zero failures.
- [x] `npx tsc --noEmit` exits successfully.
- [x] `npm run lint` exits successfully.
- [x] `npm run build` completes with the expected admin, preview, and public routes.
- [x] `git diff --check` reports no whitespace errors.
- [ ] Browser verification confirms story/category search, selection, auto-save, drag keyboard parity, duplicate, confirmed delete, and preview at 1440/768/390 in an authenticated editorial session.
- [x] EN, HI, and MR each read and mutate only their own live configuration.
- [x] No user-facing UUID, JSON, block ID, renderer ID, raw database error, token, or secret is present.
- [x] No Phase 4 concern—drafts, publishing, revisions, rollback, collaboration, analytics, or shareable previews—was introduced.

## Plan self-review

- **Specification coverage:** All twenty requested UX capabilities map to Milestones 2–9; state, actions, repository/service boundaries, preview, search, drag-and-drop, accessibility, performance, and testing are explicit.
- **Dependency discipline:** Only the two dnd-kit packages are proposed, behind an explicit approval gate. Existing Radix, React Hook Form, Zod, and UI primitives are reused.
- **Type consistency:** Picker, action-result, reducer, preview, and movement contracts are defined before their consumers. Existing `HomepageSectionDto`, `HomepageSectionInput`, locale, registry, and renderer contracts remain canonical.
- **Repository safety:** Queries are paginated and locale-scoped; save validation is targeted and fail-closed; ordering is atomic; optimistic concurrency uses the existing timestamp.
- **Backward compatibility:** The database tables and public renderer contract are unchanged. The only persistence addition is an atomic ordering RPC; the preview route is authenticated and additive.
- **Scope control:** No draft, publishing, revision, rollback, collaboration, analytics, ad-serving, or public-preview capability is included.
- **Ambiguity resolved:** Auto-save applies to valid existing-section field edits; creation and structural/destructive changes remain explicit immediate actions; preview always shows server-confirmed persisted state.
