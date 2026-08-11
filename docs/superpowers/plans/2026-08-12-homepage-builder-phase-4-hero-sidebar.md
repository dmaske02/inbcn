# Homepage Builder Phase 4 Hero Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent Hero Sidebar block that composes with an immediately preceding Hero Story only in the Homepage Builder layout layer and otherwise renders standalone.

**Architecture:** Extend the existing block, editor, action, validation, reference-resolution, and renderer registries with `hero-sidebar`. Preserve configured story order and resolve runtime stories from the existing locale-scoped `HomepageViewModel.all`; expose block type metadata to `HomepageBuilderLayout`, which alone detects adjacent Hero Story and Hero Sidebar nodes and creates the responsive composition.

**Tech Stack:** Next.js 16 App Router, React 19 Server/Client Components, TypeScript, Zod, Node test runner, Tailwind CSS and existing global prototype CSS.

---

### Task 1: Register the strict block and editor draft contract

**Files:**
- Modify: `src/features/homepage-builder/homepage-builder.registry.ts`
- Modify: `src/features/homepage-builder/editor/homepage-editor.types.ts`
- Modify: `src/features/homepage-builder/editor/homepage-editor.validation.ts`
- Modify: `src/features/homepage-builder/homepage-builder.actions.ts`
- Test: `src/features/homepage-builder/homepage-builder.registry.test.mjs`
- Test: `src/features/homepage-builder/editor/homepage-editor.validation.test.mjs`
- Test: `src/features/homepage-builder/homepage-builder.actions.test.mjs`

- [ ] Add failing tests asserting `hero-sidebar` is registered with renderer `hero-sidebar`, accepts one to three unique UUIDs, and rejects zero, four, duplicate, malformed, or additional configuration fields.
- [ ] Run the focused tests and confirm they fail because `hero-sidebar` is not registered.
- [ ] Add the strict Zod configuration schema and default `{ storyIds: [] }` to the block registry.
- [ ] Extend `HomepageEditorDraft` with `HomepageEditorDraftBase<"hero-sidebar"> & { storyIds: readonly string[] }`.
- [ ] Extend DTO-to-draft and draft-to-configuration mapping with only `{ storyIds }`.
- [ ] Extend editor validation with `storyIds` length, UUID, and uniqueness errors.
- [ ] Extend the visual Server Action discriminated union with `blockType: "hero-sidebar"` and one-to-three unique IDs.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Add the visual editor using existing Story Pickers

**Files:**
- Create: `src/features/homepage-builder/components/editors/hero-sidebar-editor.tsx`
- Modify: `src/features/homepage-builder/components/editors/block-editor-registry.ts`
- Modify: `src/features/homepage-builder/components/pickers/story-picker.tsx`
- Test: `src/features/homepage-builder/components/editors/block-editor-registry.test.mjs`
- Test: `src/features/homepage-builder/components/editors/block-editors.contract.test.mjs`
- Test: `src/features/homepage-builder/components/pickers/picker-components.contract.test.mjs`

- [ ] Add failing contract tests for the registry entry, three labeled Story Pickers, selected-story updates, duplicate feedback, and accessible names.
- [ ] Run the focused tests and confirm failure due to the missing editor.
- [ ] Add optional presentation props to `StoryPicker` for title, trigger label, and accessible search context while preserving Hero Story defaults.
- [ ] Implement `HeroSidebarEditor` with `SharedSectionFields`, three indexed selections, existing picker options, duplicate prevention, and field errors.
- [ ] Register the editor as `Hero Sidebar`.
- [ ] Run focused editor and picker tests.

### Task 3: Enforce targeted references and Hero/Sidebar conflicts server-side

**Files:**
- Modify: `src/features/homepage-builder/homepage-builder.service.ts`
- Test: `src/features/homepage-builder/homepage-builder.actions.test.mjs`
- Test: `src/features/homepage-builder/homepage-builder.operations.test.mjs`

- [ ] Add failing service/action tests proving every sidebar ID uses targeted published-story validation, wrong-locale/unpublished stories fail, duplicate IDs fail, and writers remain forbidden.
- [ ] Add failing tests proving an adjacent Hero Story cannot be selected in Hero Sidebar and Hero Story cannot be changed to an ID used by its adjacent sidebar.
- [ ] Run focused tests and verify the expected missing-validation failures.
- [ ] Add a pure adjacency helper over ordered section DTOs and use it only from visual mutation validation.
- [ ] Extend targeted reference validation to validate each unique sidebar ID with `findPublishedStoryForLocale()`.
- [ ] Load the locale-owned ordered sections and enforce the conflict in both mutation directions without changing Hero Story persistence or its one-story contract.
- [ ] Run focused tests and confirm typed failures and success paths.

### Task 4: Add renderer contracts and fail-soft story resolution

**Files:**
- Modify: `src/features/homepage-renderer/homepage-renderer.types.ts`
- Modify: `src/features/homepage-renderer/homepage-renderer.contract.ts`
- Modify: `src/features/homepage-renderer/homepage-renderer.references.ts`
- Test: `src/features/homepage-renderer/homepage-renderer.contract.test.mjs`
- Test: `src/features/homepage-renderer/homepage-renderer.references.test.mjs`
- Test: `src/features/homepage-builder/homepage-builder.preview.test.mjs`

- [ ] Add failing tests for the `hero-sidebar` block/renderer pair and dedicated `{ kind: "hero-sidebar", stories }` payload.
- [ ] Add failing reference tests proving configured order, omission of unavailable IDs, locale isolation through `legacy.all`, and an empty non-throwing result.
- [ ] Run focused tests and confirm failures because the pair and resolver branch are absent.
- [ ] Register the pair in `HOMEPAGE_RENDERER_PAIRS`, extend the renderer data union, and extend the Zod renderer contract.
- [ ] Resolve configured IDs through a map of `legacy.all`, preserve ID order, omit missing entries, and never throw for an empty resolved sidebar.
- [ ] Extend preview composition to recognize the strict block through the existing registry path.
- [ ] Run focused contract, reference, and preview tests.

### Task 5: Implement the independent Hero Sidebar renderer

**Files:**
- Create: `src/features/homepage-renderer/components/hero-sidebar-renderer.tsx`
- Modify: `src/features/homepage-renderer/components/homepage-block-renderers.tsx`
- Modify: `src/features/homepage-renderer/homepage-renderer.registry.ts`
- Test: `src/features/homepage-renderer/homepage-renderer.registry.test.mjs`
- Test: `src/features/homepage-renderer/homepage-renderer.blocks.contract.test.mjs`

- [ ] Add failing tests for renderer registration, empty output, semantic articles, story images, linked headlines, summaries, dates, categories, and accessible section naming.
- [ ] Run focused tests and verify failure because the renderer is missing.
- [ ] Implement a dedicated renderer component that imports only shared story presentation primitives and its own payload types.
- [ ] Return `null` for zero stories and render one to three cards otherwise.
- [ ] Register `renderHeroSidebar` without changing `renderHeroStory`.
- [ ] Run focused renderer tests.

### Task 6: Compose adjacent blocks only in HomepageBuilderLayout

**Files:**
- Modify: `src/features/homepage-renderer/homepage-renderer.types.ts`
- Modify: `src/features/homepage-renderer/homepage-renderer.service-core.ts`
- Modify: `src/features/homepage-renderer/components/homepage-builder-layout.tsx`
- Modify: `src/app/globals.css`
- Test: `src/features/homepage-renderer/homepage-renderer.service.test.mjs`
- Create: `src/features/homepage-renderer/components/homepage-builder-layout.test.mjs`

- [ ] Add failing tests proving prepared sections expose type metadata without changing renderer nodes.
- [ ] Add failing layout tests for adjacent pairing, non-adjacent standalone rendering, empty-sidebar omission, ordering preservation, and no renderer cross-imports.
- [ ] Add failing CSS contract assertions for desktop 70/30 composition and tablet/mobile stacking.
- [ ] Run focused tests and confirm the layout currently renders sections independently.
- [ ] Add `type` to `PreparedHomepageSection` and populate it in the preparation layer.
- [ ] Implement an ordered layout scan that pairs only an immediately adjacent non-empty `hero-story` then `hero-sidebar`; render all other sections independently and force standalone sidebar width to full.
- [ ] Add `.proto-hero-composition` and standalone sidebar responsive styles without modifying existing Hero Story selectors or legacy markup.
- [ ] Run focused preparation, layout, and CSS contract tests.

### Task 7: Regression hardening for workspace behavior and compatibility

**Files:**
- Modify: `src/features/homepage-builder/components/workspace/homepage-workspace.contract.test.mjs`
- Modify: `src/features/homepage-builder/editor/use-homepage-autosave.test.mjs`
- Modify: `src/features/homepage-builder/components/sections/section-ordering.contract.test.mjs`
- Modify: `src/features/homepage-builder/components/sections/section-mutations.contract.test.mjs`
- Modify: `src/features/homepage-renderer/homepage-renderer.integration.contract.test.mjs`
- Modify: `src/features/homepage-renderer/homepage-renderer-scope.contract.test.mjs`

- [ ] Add failing regression assertions showing Hero Sidebar flows through existing autosave, drag-and-drop, duplication, deletion, locale switching, permission, and persisted-preview paths.
- [ ] Add assertions that Hero Story contract and renderer source remain unchanged and that no changes occur to legacy homepage, `HomepageViewModel`, or `composeHomepageData()`.
- [ ] Run focused regression tests and verify any missing registry-path behavior fails for the intended reason.
- [ ] Make only the minimal wiring adjustments required for the shared pipelines to accept the registered block.
- [ ] Run all Homepage Builder and Homepage Renderer tests.

### Task 8: Full verification and cleanup

**Files:**
- Review all files changed in Tasks 1-7.

- [ ] Remove temporary diagnostics and unused imports.
- [ ] Run `npm test` and require all tests to pass.
- [ ] Run `npx tsc --noEmit` and require zero diagnostics.
- [ ] Run `npm run lint` and require zero lint errors.
- [ ] Run `npm run build` and require a successful production build.
- [ ] Run `git diff --check` and require no whitespace errors.
- [ ] Review `git diff --name-only` to confirm no environment files, secrets, generated output, Phase 4 non-goals, or unrelated files were changed.
- [ ] Do not commit or push.

