# Homepage Builder Phase 2 Public Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the Phase 1 Homepage Builder to each localized public homepage through a disabled-by-default, server-first, all-or-nothing renderer with the existing homepage as the canonical fallback.

**Architecture:** The renderer service loads the cached legacy homepage once, exits immediately when the server feature flag is disabled, and otherwise coordinates the Phase 1 read-only repository, preview composer, strict runtime contract, locale-safe reference resolution, optional Live TV resolver, and the single renderer registry. It returns builder output only after every active section validates and every renderer completes; every failure records sanitized server metadata and returns the untouched legacy view.

**Tech Stack:** Next.js 16.3 App Router, React 19 server components, TypeScript, Zod 4, Supabase, next-intl, Node test runner, Tailwind CSS.

---

## Global constraints

- Treat `docs/superpowers/specs/2026-08-11-homepage-builder-phase-2-public-integration-design.md` as the source of truth.
- Do not modify Broadcast Studio, LiveKit, Live TV internals/CMS, RSS, Stories, Categories, metadata, OpenGraph, Twitter, JSON-LD, canonical URLs, layouts, routing, or SEO.
- Do not add packages, migrations, client fetching, or new client components.
- Do not commit or push.
- Preserve the complete legacy homepage whenever the flag is disabled or any builder stage fails.
- Follow red-green-refactor for each task.

### Task 1: Validated server feature flag

**Files:**
- Modify: `src/config/env.ts`
- Create: `src/features/homepage-renderer/homepage-renderer-env.contract.test.mjs`

- [ ] Write a contract test that asserts `HOMEPAGE_BUILDER_ENABLED` is parsed as `"true" | "false"`, defaults to `"false"`, is read from `process.env`, and is exposed only at `env.server.homepageBuilder.enabled`.
- [ ] Run `node --conditions=react-server --test src/features/homepage-renderer/homepage-renderer-env.contract.test.mjs` and verify it fails because the flag is absent.
- [ ] Extend `environmentSchema`, the parsed input, and the frozen server output with the boolean flag. Do not expose it in `env.public`.
- [ ] Run the focused test and `npx tsc --noEmit`; both must pass.

### Task 2: Renderer types, runtime contract, and failure model

**Files:**
- Create: `src/features/homepage-renderer/homepage-renderer.types.ts`
- Create: `src/features/homepage-renderer/homepage-renderer.contract.ts`
- Create: `src/features/homepage-renderer/homepage-renderer.model.ts`
- Create: `src/features/homepage-renderer/homepage-renderer.contract.test.mjs`
- Create: `src/features/homepage-renderer/homepage-renderer.model.test.mjs`

- [ ] Write failing tests for EN/HI/MR payload identity, non-empty ordered sections, unique positions, supported containers/widths, recognized renderer/type pairs, resolved story/category/Live TV data, and invalid payload rejection.
- [ ] Define discriminated preview renderer item types for all ten blocks, a `HomepageRenderResult` union (`legacy` or `builder`), prepared renderer nodes, safe diagnostic metadata, and injected pipeline dependencies.
- [ ] Implement a strict Zod contract that accepts only the ten approved block/renderer pairs and Phase 1 layout values. Require complete story models for story blocks, localized category/story collections for category blocks, and the existing Live TV view for Live TV blocks.
- [ ] Write failing tests for stable failure codes, message sanitization, optional block metadata, and all-or-nothing result selection.
- [ ] Implement `HomepageRendererError`, safe error normalization, diagnostic construction, ordering/layout validation, and a pure orchestration helper that never returns prepared partial output.
- [ ] Run both focused tests and TypeScript; all must pass.

### Task 3: Read-only public Homepage Builder repository

**Files:**
- Modify: `src/features/homepage-builder/homepage-builder.repository.ts`
- Create: `src/features/homepage-builder/homepage-builder-public.repository.test.mjs`

- [ ] Write a failing repository contract test proving the public method reads a locale configuration plus ordered sections, selects only approved fields, uses no mutation/RPC, and contains no feature-flag, renderer, fallback, or presentation logic.
- [ ] Add `getPublicHomepageConfiguration(locale)` using the existing server Supabase client and Phase 1 DTO mappers. Return `null` when no active-language configuration exists and return sections sorted by `position` otherwise.
- [ ] Ensure repository errors are thrown to the service without logging SQL or configuration JSON.
- [ ] Run the focused repository tests and TypeScript.

### Task 4: Complete preview reference resolution without duplicate story/category queries

**Files:**
- Modify: `src/features/homepage-builder/homepage-builder.types.ts`
- Modify: `src/features/homepage-builder/homepage-builder.preview.ts`
- Create: `src/features/homepage-renderer/homepage-renderer.references.ts`
- Create: `src/features/homepage-renderer/homepage-renderer.references.test.mjs`
- Modify: `src/features/homepage-builder/homepage-builder.preview.test.mjs`

- [ ] Write failing tests that resolve hero/story-list/category references from one existing `HomepageViewModel`, enforce exact locale ownership, apply configured limits, preserve Phase 1 scheduling/order/layout, and fail on missing or cross-locale references.
- [ ] Extend the Phase 1 preview reference/payload contracts additively with complete public story/category data required by renderers. Preserve existing Phase 1 CMS fields and tests.
- [ ] Implement pure resolution from the already loaded legacy model. Hero uses the configured story ID; category uses the configured category ID and its eligible stories; breaking/latest/trending/opinion derive bounded collections from the shared `all` dataset; placeholders require no references.
- [ ] Keep Live TV as an explicit unresolved requirement marker at this stage so the server service can resolve it only when an active Live TV section exists.
- [ ] Run reference, preview, registry, scheduling, and TypeScript tests.

### Task 5: Extract reusable legacy presentation components

**Files:**
- Create: `src/features/news/components/homepage-sections.tsx`
- Modify: `src/features/news/components/homepage.tsx`
- Create: `src/features/news/components/homepage-sections.contract.test.mjs`
- Modify: `src/features/news/components/homepage.backend-data.contract.test.mjs`
- Modify: `src/features/news/components/homepage.messages.test.mjs`

- [ ] Write a failing regression contract that captures the current legacy section order, CSS class names, headings, links, image behavior, advertisement slots, and story/category presentation.
- [ ] Extract existing `StoryImage`, hero, headline/breaking, latest, trending, category rail, editor/opinion, and advertisement presentation into focused server components without changing their markup or styles.
- [ ] Recompose `Homepage` from those components in the exact existing order with the exact existing conditions and data slices.
- [ ] Assert no duplicated StoryCard-like markup exists in the renderer feature and the legacy homepage contract remains byte/structure equivalent where practical.
- [ ] Run homepage component contracts, TypeScript, and lint.

### Task 6: Single renderer registry and all ten renderers

**Files:**
- Create: `src/features/homepage-renderer/homepage-renderer.registry.ts`
- Create: `src/features/homepage-renderer/components/homepage-builder-layout.tsx`
- Create: `src/features/homepage-renderer/components/homepage-block-renderers.tsx`
- Create: `src/features/homepage-renderer/homepage-renderer.registry.test.mjs`
- Create: `src/features/homepage-renderer/homepage-renderer.blocks.contract.test.mjs`

- [ ] Write failing registry tests for the exact ten Phase 1 block types, unique renderer IDs, exact type/renderer pairing, lookup behavior, and registration-only extensibility.
- [ ] Write failing renderer tests for hero, breaking, Live TV, latest, category, trending, opinion, advertisement, safe Custom HTML placeholder, and future placeholder.
- [ ] Implement renderer functions that accept only validated preview items and reuse the extracted news presentation components. Do not import Supabase, repositories, or service modules.
- [ ] Reuse the existing public Live TV presentation/player boundary through props prepared by the service; do not duplicate or change player logic.
- [ ] Implement Custom HTML as escaped text/placeholder metadata only and prohibit `dangerouslySetInnerHTML`.
- [ ] Implement one layout component that preserves position order and maps validated `main/sidebar/footer` plus `full/half/third/quarter` values to existing grid/layout classes.
- [ ] Run registry/block tests, TypeScript, lint, and the legacy appearance regression.

### Task 7: Server-side all-or-nothing renderer service

**Files:**
- Create: `src/features/homepage-renderer/homepage-renderer.service.ts`
- Create: `src/features/homepage-renderer/homepage-renderer.service-core.ts`
- Create: `src/features/homepage-renderer/homepage-renderer.service.test.mjs`

- [ ] Write failing service-core tests using injected dependencies for: flag disabled; missing configuration; empty active sections; invalid schedule/config/layout/block; missing/cross-locale reference; repository/preview/renderer/unexpected exception; and complete builder success.
- [ ] Assert disabled mode never calls the builder repository and no failure returns mixed or partial nodes.
- [ ] Assert story/category data is supplied once from the cached legacy model and Live TV resolution is called zero times without a Live TV block and exactly once when required.
- [ ] Implement the pure service core: always accept the legacy view, short-circuit on a disabled flag, build and validate the complete payload, resolve optional Live TV, invoke every registry renderer eagerly, and return `builder` only after all succeed.
- [ ] Implement the server service with `getHomepageData(locale)`, `env.server.homepageBuilder.enabled`, the public builder repository, existing Live TV service, and one injected safe logger.
- [ ] Log only locale, code, sanitized message, and optional block ID/type. Never pass raw errors, stacks, configuration, SQL, tokens, or credentials to the logger.
- [ ] Run service tests, all renderer tests, and TypeScript.

### Task 8: Localized public homepage selection boundary

**Files:**
- Modify: `src/app/[locale]/page.tsx`
- Create: `src/features/homepage-renderer/homepage-renderer.integration.contract.test.mjs`
- Create: `src/features/homepage-renderer/homepage-renderer-disabled.regression.test.mjs`

- [ ] Write failing contracts proving the route invokes the renderer service, uses the existing `Homepage` component for `legacy`, uses the complete builder layout for `builder`, retains `Suspense`/skeleton/notFound/request-locale behavior, and does not alter metadata or layout files.
- [ ] Add the minimal result-selection branch to `HomepageContent`. Keep the existing legacy load-error path unchanged.
- [ ] Add a disabled-flag regression proving the builder repository is not queried and the existing homepage component receives the same `HomepageViewModel`.
- [ ] Add successful EN/HI/MR integration fixtures proving strict localization, scheduling, ordering, containers, and widths.
- [ ] Run integration, disabled regression, public homepage, localization, and TypeScript tests.

### Task 9: Scope regression and complete verification

**Files:**
- Create: `src/features/homepage-renderer/homepage-renderer-scope.contract.test.mjs`
- Modify only Phase 2 files if verification finds a defect.

- [ ] Write a scope contract that verifies no Phase 2 imports or edits appear in metadata, OpenGraph, Twitter, JSON-LD, canonical, layout, routing, Live TV internals/CMS, Broadcast Studio, LiveKit, RSS, Stories, or Categories boundaries.
- [ ] Run all Homepage Builder/renderer and existing homepage focused tests.
- [ ] Run `npm test` and require zero failures.
- [ ] Run `npx tsc --noEmit` and require exit code zero.
- [ ] Run `npm run lint` and require zero errors or warnings.
- [ ] Run `npm run build` and require a successful production build.
- [ ] Run `git diff --check` and require no whitespace errors.
- [ ] Audit `git status --short` and `git diff --name-only` to confirm no environment files, secrets, dependencies, generated build artifacts, or unrelated application files changed.
- [ ] Leave all work uncommitted and unpushed.
