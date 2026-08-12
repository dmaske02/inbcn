# INBCN Homepage Builder Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved database, server, CMS, validation, and preview foundation for one directly managed localized homepage configuration without connecting it to the public homepage.

**Architecture:** A stable `homepage_configurations` row owns ordered `homepage_sections` block instances for each locale. Supabase repositories perform persistence only; pure models, registry, validation, operations, services, and preview composition enforce behavior; Server Actions are the authenticated mutation boundary; the protected admin route renders existing design-system components.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript, Zod 4, Supabase/PostgreSQL, Tailwind CSS, Node test runner.

## Global Constraints

- Do not modify or import the Homepage Builder from the public homepage route, service, renderer, metadata, caching, or layout.
- Support exactly EN, HI, and MR with one current configuration per locale.
- Editors and administrators have full management; writers have read-only access.
- Do not add drag-and-drop, public rendering, drafts, publishing, revisions, rollback, live preview, analytics, search, SEO, caching, or auto-save.
- Do not add packages.
- Do not commit or push.
- Follow test-first red-green-refactor cycles.

---

### Task 1: Database schema, RLS, and atomic ordering

**Files:**
- Create: `supabase/migrations/20260811090000_homepage_builder.sql`
- Create: `src/features/homepage-builder/homepage-builder-schema.contract.test.mjs`
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces tables `homepage_configurations`, `homepage_sections`.
- Produces RPC functions `move_homepage_section(section_id uuid, direction text)` and `delete_homepage_section(section_id uuid)`.
- Produces generated-style TypeScript row/insert/update/function definitions consumed by the repository.

- [ ] **Step 1: Write the failing migration contract test**

Assert both tables, every approved column, foreign keys, unique constraints, layout/JSON/schedule checks, indexes, updated-at triggers, grants, RLS policies, and both ordering functions. Assert the functions use a temporary negative sentinel during swaps and compact later positions after deletion.

- [ ] **Step 2: Run the contract test and verify RED**

Run `node --conditions=react-server --test src/features/homepage-builder/homepage-builder-schema.contract.test.mjs` and expect failure because the migration does not exist.

- [ ] **Step 3: Implement the migration**

Use UUID primary keys, `language_id` uniqueness, zero-based non-negative positions, JSON-object checks, and authenticated-role policies. `move_homepage_section` must lock the configuration's section rows, find the adjacent target, move the current row to `-1`, swap the adjacent row, then place the current row. `delete_homepage_section` must delete and decrement every greater position in the same configuration. Both functions reject roles outside `editor` and `admin`.

- [ ] **Step 4: Add exact database types**

Add both table definitions and RPC argument/return definitions to `Database["public"]` without changing unrelated generated definitions.

- [ ] **Step 5: Run the migration contract and TypeScript**

Run the focused contract test and `npx tsc --noEmit`; expect both to pass.

### Task 2: Types, DTOs, model invariants, registry, and validation

**Files:**
- Create: `src/features/homepage-builder/homepage-builder.types.ts`
- Create: `src/features/homepage-builder/homepage-builder.dto.ts`
- Create: `src/features/homepage-builder/homepage-builder.model.ts`
- Create: `src/features/homepage-builder/homepage-builder.registry.ts`
- Create: `src/features/homepage-builder/homepage-builder.validation.ts`
- Create: matching `*.test.mjs` files for DTO, model, registry, and validation

**Interfaces:**
- Produces `HomepageLocale = "en" | "hi" | "mr"`, block/container/width unions, section DTO/form/reference/preview contracts, `HomepageBuilderError`, permission/schedule/order helpers, `HOMEPAGE_BLOCK_REGISTRY`, `getHomepageBlockDefinition()`, and `parseHomepageSectionInput()`.
- Registry entries expose `{ id, type, renderer, schema, defaults, validate }`.

- [ ] **Step 1: Write failing type-behavior tests**

Cover row-to-DTO mapping, editor/admin management, writer read-only behavior, supported locales, contiguous unique positions, and active schedule boundaries (`startsAt <= now`, `endsAt > now`).

- [ ] **Step 2: Run tests and verify RED**

Expect module-not-found failures for the new production modules.

- [ ] **Step 3: Implement types, DTOs, and model**

Map snake_case persistence rows to immutable camelCase DTOs. Use stable errors `FORBIDDEN`, `VALIDATION`, `NOT_FOUND`, `REFERENCE_MISSING`, and `ORDERING`.

- [ ] **Step 4: Write failing registry tests**

Assert the exact ten machine IDs, display types, renderer IDs, schemas, defaults, and validation behavior. Assert an unknown type returns no definition and no database enum is introduced.

- [ ] **Step 5: Implement the block registry**

Use Zod object schemas. Hero requires `storyId`; category requires `categoryId`; list blocks accept bounded `limit`; Live TV uses an empty object; placeholders accept safe editorial metadata; Custom HTML stores placeholder content but has a non-public renderer ID.

- [ ] **Step 6: Write failing section validation tests**

Cover invalid JSON, mismatched renderer, invalid schedule, layout values, missing required references, malformed UUIDs, and normalized optional dates.

- [ ] **Step 7: Implement validation and run all Task 2 tests**

`parseHomepageSectionInput()` must select the registry schema, parse JSON text or objects, apply registry validation, and return a normalized write model. Run all focused tests and TypeScript.

### Task 3: Pure preview payload

**Files:**
- Create: `src/features/homepage-builder/homepage-builder.preview.ts`
- Create: `src/features/homepage-builder/homepage-builder.preview.test.mjs`

**Interfaces:**
- Consumes section DTOs and resolved locale references.
- Produces `buildHomepagePreview(locale, sections, references, now): HomepagePreviewPayload`.

- [ ] **Step 1: Write failing preview tests**

Use literal fixtures to prove position ordering, renderer/layout preservation, story/category/Live TV resolution, disabled exclusion, future-start exclusion, end-boundary exclusion, and locale identity.

- [ ] **Step 2: Run and verify RED**

Expect failure because `buildHomepagePreview` is absent.

- [ ] **Step 3: Implement pure preview composition**

Filter through the model's schedule predicate, validate each registry configuration, resolve its references, and return immutable ordered items. Do not import Supabase, React, Next.js, or the public homepage.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the preview/model/registry tests together.

### Task 4: Persistence-only repository

**Files:**
- Create: `src/features/homepage-builder/homepage-builder.repository.ts`
- Create: `src/features/homepage-builder/homepage-builder.repository-core.ts`
- Create: `src/features/homepage-builder/homepage-builder.repository.test.mjs`

**Interfaces:**
- Produces `getConfigurationByLocale`, `ensureConfiguration`, `listSections`, `getSection`, `createSection`, `updateSection`, `deleteSection`, `moveSectionUp`, and `moveSectionDown`.
- Repository core consumes an injected adapter so query delegation is testable without Supabase.

- [ ] **Step 1: Write failing repository-core tests**

Assert exact adapter delegation, append position retrieval, locale/configuration filters, ordered reads, writes, and correct RPC names/directions.

- [ ] **Step 2: Run and verify RED**

Expect missing repository-core module.

- [ ] **Step 3: Implement repository core**

Keep it free of authorization, reference validation, preview composition, and UI messages.

- [ ] **Step 4: Implement the Supabase adapter**

Use the authenticated server client. Select only approved columns, join `languages` for locale lookup, order sections ascending by position, append with the current maximum plus one, and call the ordering RPCs. Convert Supabase errors into thrown repository errors without logging configuration JSON.

- [ ] **Step 5: Run repository tests and TypeScript**

Expect focused tests and `npx tsc --noEmit` to pass.

### Task 5: Authorized operations, reference validation, and CMS service

**Files:**
- Create: `src/features/homepage-builder/homepage-builder.operations.ts`
- Create: `src/features/homepage-builder/homepage-builder.operations.test.mjs`
- Create: `src/features/homepage-builder/homepage-builder.service.ts`
- Create: `src/features/homepage-builder/homepage-builder.service-core.ts`
- Create: `src/features/homepage-builder/homepage-builder.service.test.mjs`

**Interfaces:**
- Operations expose `createManagedSection`, `updateManagedSection`, `deleteManagedSection`, `moveManagedSection`, and `toggleManagedSection` against an injected repository.
- Service exposes `getHomepageBuilderView(admin, locale, selectedId?)` plus mutation methods used by actions.
- View contains configuration, all persisted sections, registry options, language/story/category/Live TV references, permissions, and `previewPayload`.

- [ ] **Step 1: Write failing operations tests**

Assert editor/admin success, writer rejection, actor audit fields, append-at-end behavior, toggle semantics, ownership checks, move direction, and delete compaction delegation.

- [ ] **Step 2: Implement operations and verify GREEN**

Use `canManageHomepageBuilder` on every mutation regardless of UI visibility.

- [ ] **Step 3: Write failing service/reference tests**

Cover EN/HI/MR provisioning, unsupported locale rejection, cross-locale stories/categories, missing records, absent Live TV, selected-section not found, writer read-only view, and preview payload composition.

- [ ] **Step 4: Implement service core and production service**

Query active languages, relevant stories/categories, and existing Live TV through server repositories. Validate references before mutation. Provision a missing locale configuration only for editor/admin mutation flows; read-only writer views report an empty configuration without writing.

- [ ] **Step 5: Run Task 5 tests and TypeScript**

Expect all operation/service tests to pass.

### Task 6: Server Actions and protected CMS

**Files:**
- Create: `src/features/homepage-builder/homepage-builder.actions.ts`
- Create: `src/features/homepage-builder/homepage-builder.actions-core.ts`
- Create: `src/features/homepage-builder/homepage-builder.actions.test.mjs`
- Create: `src/features/homepage-builder/components/homepage-builder-editor.tsx`
- Create: `src/features/homepage-builder/components/homepage-section-form.tsx`
- Create: `src/features/homepage-builder/components/homepage-section-list.tsx`
- Create: `src/features/homepage-builder/components/homepage-preview-data.tsx`
- Create: `src/features/homepage-builder/homepage-builder-admin.contract.test.mjs`
- Create: `src/app/admin/(protected)/homepage-builder/page.tsx`
- Modify: `src/app/admin/(protected)/layout.tsx`

**Interfaces:**
- Server Actions are exactly `createHomepageSection`, `updateHomepageSection`, `deleteHomepageSection`, `moveSectionUp`, `moveSectionDown`, and `toggleSection`.
- Actions authenticate via `requireAdminUser`, parse FormData, invoke service mutations, revalidate `/admin/homepage-builder`, and redirect with locale/selection/notices.

- [ ] **Step 1: Write failing action tests**

Test the action core with injected authentication/mutations/revalidation. Assert writer denial, exact delegation, validation states, admin-only server trust boundary, and no public path revalidation.

- [ ] **Step 2: Implement action core and Server Actions**

Return serializable field errors for create/update. Use hidden IDs/locales only as untrusted values that services revalidate. Do not export non-async values from the `"use server"` file.

- [ ] **Step 3: Write failing admin contracts**

Assert the route uses the protected shell/service, the admin navigation links to `/admin/homepage-builder`, components reuse Card/Button/Badge/Typography, writers have no mutation controls, and no component imports Supabase.

- [ ] **Step 4: Implement the protected page and CMS components**

Build locale tabs, ordered section cards, move/toggle/delete forms, registry-driven create/edit form, persisted container/width/schedule inputs, and a `<pre>` structured preview payload. Use server-rendered data and small client form state only where registry-dependent fields require it.

- [ ] **Step 5: Run action/admin tests, lint, and TypeScript**

Expect focused tests, `npm run lint`, and `npx tsc --noEmit` to pass.

### Task 7: Public isolation regression and final verification

**Files:**
- Create: `src/features/homepage-builder/homepage-builder-public-isolation.contract.test.mjs`
- Modify only Homepage Builder files if verification exposes a defect.

**Interfaces:**
- Proves `src/app/[locale]/page.tsx`, current homepage service/model/component, metadata, and layouts contain no `homepage-builder` import.

- [ ] **Step 1: Write the public-isolation regression**

Read the existing public homepage boundary files and assert none imports or references the Homepage Builder feature.

- [ ] **Step 2: Run the focused regression**

Expect it to pass without modifying public homepage code.

- [ ] **Step 3: Run the complete verification suite**

Run, in order: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check`. Stop on the first failure, correct only Homepage Builder defects, and rerun the failed command plus all subsequent commands.

- [ ] **Step 4: Audit scope**

Use `git status --short` and `git diff --name-only` to confirm no public homepage, unrelated feature, environment, dependency, build, or secret file changed. Do not commit or push.
