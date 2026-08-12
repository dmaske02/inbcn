# INBCN Media Library Phase 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the existing Cloudinary-backed `public.media` implementation into INBCN's secure, reusable, searchable, usage-aware canonical asset library without breaking Stories or Homepage Builder.

**Architecture:** Extend `public.media` in place, retain Cloudinary for bytes and transformations, and preserve `stories.featured_media_id`. Add normalized metadata/lifecycle fields and a hybrid usage model: typed Story references plus `media_usages` for JSON or heterogeneous consumers. Keep provider operations server-only and make retirement/cleanup durable and database-authoritative.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/Postgres/RLS, Cloudinary Node SDK, Zod 4, Radix/shadcn UI, `next/image`, Node test runner.

---

## Plan constraints

- Read the relevant Next.js 16 guides under `node_modules/next/dist/docs/` before changing App Router, Server Action, caching, image, or form code.
- Use test-first development: add a failing focused test, observe the intended failure, implement the minimum change, and rerun focused tests.
- Do not install dependencies unless magic-byte inspection cannot be implemented safely with existing runtime APIs; obtain explicit approval before any installation.
- Keep existing media UUIDs and `stories.featured_media_id` values valid throughout rollout.
- Do not move objects from Cloudinary or add Supabase Storage in this phase.
- Run the full verification suite at every milestone boundary. Commit boundaries below are suggestions for the later implementation phase; this planning turn creates no commit.

## Milestone 1: Schema compatibility and canonical metadata

**Objective:** Extend the existing table without creating a parallel asset table and provide safe, indexed active-media queries.

**Files:**

- Create: `supabase/migrations/20260812090000_media_library_phase_5_foundation.sql`
- Modify: `src/lib/supabase/database.types.ts`
- Modify: `src/features/admin/media/media.types.ts`
- Modify: `src/features/admin/media/media.model.ts`
- Modify: `src/features/admin/media/media.repository.ts`
- Test: `src/features/admin/media/media-schema.contract.test.mjs`
- Test: `src/features/admin/media/media.model.test.mjs`
- Test: `src/features/admin/media/media.repository.test.mjs`
- Modify: `docs/database-schema.md`
- Modify: `docs/media-library.md`

**Database changes:**

- Add normalized `title`, `original_filename`, `credit`, `updated_by`, `deleted_at`, and `deleted_by` columns.
- Add profile FKs for updater/deleter with `ON DELETE SET NULL`.
- Backfill normalized values from `metadata` while retaining JSON compatibility.
- Add checks for trimmed required title and coherent deletion audit.
- Add active library index on `(media_type, deleted_at, created_at desc, id desc)`.
- Add an appropriate search index only after selecting PostgreSQL full-text or trigram based on a representative query plan.
- Keep `cloudinary_public_id`, `secure_url`, `story_id`, and `sort_order`; do not rename/drop them.

**Tasks:**

- [ ] Add a migration contract test that asserts additive columns, FKs, checks, backfill, active-page index, and no `media_assets` table.
- [ ] Run the focused contract test and confirm it fails because the migration does not exist.
- [ ] Write the additive/backfill migration with explicit comments and no destructive column changes.
- [ ] Generate/update database types with the project's established Supabase type workflow; inspect the diff for unrelated remote drift.
- [ ] Add failing mapper tests for normalized columns with legacy JSON fallback.
- [ ] Extend `MediaDto` and mapping code; write normalized values while continuing to parse legacy metadata.
- [ ] Add failing repository tests proving deleted rows are excluded and `(created_at, id)` ordering is stable.
- [ ] Update repository projections and filters minimally.
- [ ] Apply the migration to a disposable/local verification database and inspect backfilled rows before any linked deployment.

**Tests:** Schema contract, backfill fixtures with missing/malformed JSON keys, DTO compatibility, active-row filtering, stable ordering, database checks and FK deletion behavior.

**Dependencies:** Existing applied media migrations and generated Supabase types.

**Non-goals:** Usage table, new UI, uploads, policy changes, column removal, provider migration.

**Verification:**

```powershell
node --test src/features/admin/media/media-schema.contract.test.mjs src/features/admin/media/media.model.test.mjs src/features/admin/media/media.repository.test.mjs
npx tsc --noEmit
npm run lint
git diff --check
```

## Milestone 2: Secure upload and storage pipeline

**Objective:** Make upload acceptance depend on verified bytes/provider facts, use server-generated object names, and preserve durable cleanup evidence.

**Files:**

- Modify: `src/features/admin/media/media.model.ts`
- Modify: `src/features/admin/media/media.operations.ts`
- Modify: `src/features/admin/media/media.service.ts`
- Modify: `src/features/admin/media/cloudinary.server.ts`
- Modify: `src/features/admin/media/media.actions.ts`
- Test: `src/features/admin/media/media.model.test.mjs`
- Test: `src/features/admin/media/media.operations.test.mjs`
- Test: `src/features/admin/media/media-upload-security.test.mjs`
- Potentially create after approval: `src/features/admin/media/file-signature.ts`

**Database changes:** None beyond Milestone 1. If durable cleanup needs a table rather than fields, defer its migration to Milestone 8 so the lifecycle design remains cohesive.

**Tasks:**

- [ ] Add failing boundary tests for zero bytes, 10 MiB exactly, over-limit, supported signatures, spoofed MIME, malformed files, extension mismatch, path separators, control characters, and bidi controls.
- [ ] Run focused tests and confirm spoofed/malformed files currently pass client-MIME validation.
- [ ] Implement a bounded magic-byte detector for JPEG/PNG/WebP/AVIF using existing Node APIs; if robust AVIF detection cannot be achieved without a dependency, stop and request dependency approval.
- [ ] Compare detected type, allowlist, and provider-reported format; persist the detected/provider value, never `File.type` alone.
- [ ] Generate provider public IDs from UUID, type, UTC year/month, and a verified extension; keep sanitized original filename only as metadata.
- [ ] Add failing provider gateway tests for folder/path, unique immutable naming, image-only resource type, no overwrite, and delete invalidation.
- [ ] Update Cloudinary gateway to use `inbcn/media/image/YYYY/MM/<uuid>` and omit client-controlled filename overrides.
- [ ] Preserve SHA-256 duplicate checks and add a database-backed uniqueness strategy after auditing existing duplicate checksums.
- [ ] Add compensation tests for provider success/database failure and cleanup failure.
- [ ] Ensure cleanup failures retain enough provider identity for retry rather than only returning an error.

**Tests:** File signatures, MIME/extension mismatches, size limits, filename/path traversal, duplicates, provider contract, compensation, secret isolation, role enforcement.

**Dependencies:** Milestone 1 normalized filename/title fields; approval if an additional binary-inspection package is required.

**Non-goals:** Direct browser uploads, video/audio/documents, image editing, Supabase Storage.

**Verification:**

```powershell
node --test src/features/admin/media/media.model.test.mjs src/features/admin/media/media.operations.test.mjs src/features/admin/media/media-upload-security.test.mjs
npx tsc --noEmit
npm run lint
git diff --check
```

## Milestone 3: Scalable Media Library queries and grid UI

**Objective:** Upgrade `/admin/media` for thousands of assets with filters, stable pagination, minimal projections, dedicated thumbnails, and complete UI states.

**Files:**

- Modify: `src/app/admin/(protected)/media/page.tsx`
- Modify: `src/app/admin/(protected)/media/loading.tsx`
- Modify: `src/features/admin/media/media.types.ts`
- Modify: `src/features/admin/media/media.repository.ts`
- Modify: `src/features/admin/media/media.service.ts`
- Modify: `src/features/admin/media/media-library.tsx`
- Create: `src/features/admin/media/media-thumbnail.tsx`
- Create: `src/features/admin/media/media-library-filters.tsx`
- Test: `src/features/admin/media/media.repository.test.mjs`
- Test: `src/features/admin/media/media-library.contract.test.mjs`
- Test: `src/features/admin/media/media-library-query.test.mjs`

**Database changes:** Add search index chosen in Milestone 1 if query-plan evidence supports it.

**Tasks:**

- [ ] Read the existing `/admin/media` page and loading boundary and record which shared admin-shell and error-boundary components they already use.
- [ ] Add failing query tests for title/filename/alt/caption/credit/tag search, media type, date bounds, deterministic pagination, and invalid query normalization.
- [ ] Replace the current broad `or(ilike...)` path with the indexed query and a minimal list projection.
- [ ] Replace per-page Story reference row loading with one grouped usage-count query/RPC.
- [ ] Add named Cloudinary thumbnail URL generation and tests proving list/grid views do not request original-size delivery.
- [ ] Add failing UI contracts for grid, optional list switch, filters, pagination links, loading skeleton, error retry, empty library, and no-results state.
- [ ] Implement the responsive grid using existing admin cards/buttons/inputs and `next/image` lazy loading.
- [ ] Keep list view optional; ship it only if it does not delay the canonical grid workflows.
- [ ] Preserve filters during paging and reset cursor/page when filters change.

**Tests:** Search, filter combinations, dates/time zones, pagination stability, result projection, thumbnail URL, loading/error/empty states, URL state, no N+1 query.

**Dependencies:** Milestone 1 schema/indexes and existing Cloudinary delivery helper.

**Non-goals:** Metadata edit dialog, reusable picker, usage detail, destructive lifecycle.

**Verification:**

```powershell
node --test src/features/admin/media/media.repository.test.mjs src/features/admin/media/media-library.contract.test.mjs src/features/admin/media/media-library-query.test.mjs
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

## Milestone 4: Preview and metadata editor

**Objective:** Separate editorial metadata edits from binary replacement and expose intrinsic/audit details safely.

**Files:**

- Create: `src/features/admin/media/media-detail-dialog.tsx`
- Create: `src/features/admin/media/media-metadata-form.tsx`
- Modify: `src/features/admin/media/media.actions.ts`
- Modify: `src/features/admin/media/media.service.ts`
- Modify: `src/features/admin/media/media.repository.ts`
- Modify: `src/features/admin/media/media.model.ts`
- Test: `src/features/admin/media/media-metadata.test.mjs`
- Test: `src/features/admin/media/media-detail.contract.test.mjs`

**Database changes:** None; use normalized fields and `updated_by/updated_at` from Milestone 1.

**Tasks:**

- [ ] Add failing validation tests for required title, image alt text, trimmed optional caption/credit, tag normalization/limits, and stale `updated_at`.
- [ ] Implement a metadata-only repository update with optimistic concurrency and updater audit.
- [ ] Add a typed Server Action result for success, validation error, stale edit, forbidden, and unexpected failure.
- [ ] Add failing UI contracts for preview, intrinsic facts, metadata form labels/descriptions, validation summary, success announcement, and conflict recovery.
- [ ] Implement detail and edit dialogs with focus management and focus restoration.
- [ ] Keep Replace binary as a distinct, explicitly warned action because it affects every usage.

**Tests:** Validation, optimistic concurrency, audit fields, role enforcement, server error sanitization, dialog keyboard behavior, accessible errors/status.

**Dependencies:** Milestones 1 and 3.

**Non-goals:** Per-locale metadata, usage replacement, hard delete.

**Verification:**

```powershell
node --test src/features/admin/media/media-metadata.test.mjs src/features/admin/media/media-detail.contract.test.mjs
npx tsc --noEmit
npm run lint
git diff --check
```

## Milestone 5: Reusable accessible Media Picker

**Objective:** Replace fixed 60-item inline selection with a controlled, searchable, paginated, keyboard-accessible dialog usable by any CMS module.

**Files:**

- Replace/refactor: `src/features/admin/media/media-picker.tsx`
- Create: `src/features/admin/media/media-picker.types.ts`
- Create: `src/features/admin/media/media-picker-dialog.tsx`
- Create: `src/features/admin/media/media-picker-grid.tsx`
- Create: `src/features/admin/media/media-picker.service.ts`
- Modify: `src/features/admin/media/media.repository.ts`
- Test: `src/features/admin/media/media-picker.model.test.mjs`
- Test: `src/features/admin/media/media-picker.contract.test.mjs`
- Test: `src/features/admin/media/media-picker.keyboard.test.mjs`

**Database changes:** None.

**Tasks:**

- [ ] Add failing type/model tests for allowed types, nullable/required selection, stale selected ID, filter/page state, and selected item mapping.
- [ ] Define a consumer-neutral controlled picker contract; do not embed Story form field names in the core picker.
- [ ] Add server-side picker query returning ID, type, title, alt text, thumbnail, dimensions, and date only.
- [ ] Add failing accessibility contracts for dialog naming, focus trap, initial focus, Escape cancel, trigger focus restoration, live result count, and selected state.
- [ ] Add failing keyboard model tests for arrow, Home/End, Enter, Space, and disabled options.
- [ ] Implement dialog, filters, stable pagination, grid roving focus, selection preview, cancel, clear, and confirm.
- [ ] Gate the Upload action by role and refresh results after successful upload without losing the invoking form.
- [ ] Ensure no manual UUID input is visible or required.

**Tests:** Search/filter/page, selection, clear/cancel/confirm, stale selection, keyboard navigation, focus management, screen-reader labels, loading/error/empty states.

**Dependencies:** Milestone 3 queries/thumbnails and Milestone 4 metadata view.

**Non-goals:** Consumer integrations beyond a harness/example, multi-select, crop editor.

**Verification:**

```powershell
node --test src/features/admin/media/media-picker.model.test.mjs src/features/admin/media/media-picker.contract.test.mjs src/features/admin/media/media-picker.keyboard.test.mjs
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

## Milestone 6: Stories integration

**Objective:** Adopt the reusable picker in Stories while preserving the `featured_media_id` contract, writer workflow, and public fallback chain.

**Files:**

- Modify: `src/features/admin/stories/story-form.tsx`
- Modify: `src/features/admin/stories/story-editor.tsx`
- Modify: `src/features/admin/stories/story.service.ts`
- Modify: `src/features/admin/stories/story.workflow.ts`
- Modify: `src/features/admin/media/media.service.ts`
- Test: `src/features/admin/stories/story.workflow.test.mjs`
- Test: `src/features/admin/stories/story-media-picker.contract.test.mjs`
- Test: `src/features/news/server/stories.repository.test.mjs` (create if no focused equivalent exists)
- Test: `src/features/news/server/services/story-reader.service.contract.test.mjs`

**Database changes:** Adjust media SELECT RLS so writers can browse/select active library images for their own editable Stories; do not grant shared media update/delete rights.

**Tasks:**

- [ ] Add RLS tests for writer browse/select, editor/admin management, reader denial, deleted media exclusion, and shared mutation denial.
- [ ] Add failing Story form tests proving a selected UUID is submitted only through picker state and writers cannot overwrite prohibited selections.
- [ ] Replace Story's inline picker with the reusable controlled picker and preserve hidden form serialization.
- [ ] Validate selected media server-side as active, image type, and visible to the actor before Story mutation.
- [ ] Add integration tests for save/reload, removal, invalid/deleted IDs, and concurrent retirement.
- [ ] Assert public repositories still batch media IDs and preserve Cloudinary -> external URL -> fallback precedence.
- [ ] Assert Story Reader metadata/caption/alt behavior is unchanged.

**Tests:** RLS roles, form serialization, workflow permissions, selected-media validation, public Story rendering, external fallback, no N+1 regression.

**Dependencies:** Milestone 5 and an approved writer access decision.

**Non-goals:** Changing Story schema, importing external images automatically, localized asset metadata.

**Verification:**

```powershell
node --test src/features/admin/stories/story.workflow.test.mjs src/features/admin/stories/story-media-picker.contract.test.mjs src/features/news/server/services/story-reader.service.contract.test.mjs
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

## Milestone 7: Homepage Builder compatibility and future direct selection seam

**Objective:** Prove all Story-backed blocks retain canonical Story image resolution and define, but do not prematurely add, direct media selection for future blocks.

**Files:**

- Modify tests only unless a defect is found: `src/features/news/server/services/homepage.model.test.mjs`
- Modify: `src/features/homepage-renderer/homepage-renderer.references.test.mjs`
- Modify: `src/features/homepage-renderer/homepage-renderer.integration.contract.test.mjs`
- Modify: `src/features/homepage-builder/search/homepage-picker.repository.test.mjs`
- Modify: `src/features/homepage-builder/search/homepage-picker.service.test.mjs`
- Create: `src/features/homepage-builder/homepage-media-compatibility.contract.test.mjs`
- Document future seam in: `docs/media-library.md`

**Database changes:** None. Homepage Builder sections continue storing Story/category IDs, not media IDs.

**Tasks:**

- [ ] Add failing/locking regression tests for Hero Story, Hero Sidebar, Category, Latest, Breaking, Trending, Opinion, and legacy homepage image precedence.
- [ ] Assert Homepage Builder story search prefers featured media, then external image, and never stores direct image URLs in section configuration.
- [ ] Assert Homepage Renderer consumes `HomepageStory.image` without its own media query or provider logic.
- [ ] Assert advertisement and Live TV blocks remain unchanged and do not claim media usage until direct media fields are introduced.
- [ ] If regressions are found, fix only the shared Story image pipeline; do not add per-block media infrastructure.
- [ ] Document how a future direct-media block must use `MediaPicker` and transactionally register `media_usages`.

**Tests:** All current Homepage Builder/rendering regressions, locale isolation, Hero/Sidebar ordering, missing featured media fallback, external URL fallback, local fallback.

**Dependencies:** Milestone 6 public pipeline verification.

**Non-goals:** Media overrides for Story-backed blocks, modifying Homepage Builder schema/configuration, advertisement asset implementation, Live TV poster implementation.

**Verification:**

```powershell
node --test src/features/news/server/services/homepage.model.test.mjs src/features/homepage-renderer/homepage-renderer.references.test.mjs src/features/homepage-renderer/homepage-renderer.integration.contract.test.mjs src/features/homepage-builder/search/homepage-picker.repository.test.mjs src/features/homepage-builder/search/homepage-picker.service.test.mjs src/features/homepage-builder/homepage-media-compatibility.contract.test.mjs
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

## Milestone 8: Usage tracking, retirement, restore, and cleanup

**Objective:** Answer “where is this used?” reliably and prevent accidental deletion or untracked provider orphans.

**Files:**

- Create: `supabase/migrations/20260812100000_media_usage_and_retirement.sql`
- Modify: `src/lib/supabase/database.types.ts`
- Create: `src/features/admin/media/media-usage.types.ts`
- Create: `src/features/admin/media/media-usage.repository.ts`
- Create: `src/features/admin/media/media-lifecycle.service.ts`
- Modify: `src/features/admin/media/media.operations.ts`
- Modify: `src/features/admin/media/media.actions.ts`
- Modify: `src/features/admin/media/media-detail-dialog.tsx`
- Create: `src/features/admin/media/media-usage-list.tsx`
- Test: `src/features/admin/media/media-usage-schema.contract.test.mjs`
- Test: `src/features/admin/media/media-lifecycle.test.mjs`
- Test: `src/features/admin/media/media-usage.contract.test.mjs`

**Database changes:**

- Add `media_usages` with constrained consumer types, uniqueness, FK to media with `ON DELETE RESTRICT`, and bidirectional indexes.
- Add a normalized usage query/view/function that unions Stories with explicit usages.
- Add atomic `retire_media_asset` and `restore_media_asset` functions with fixed search path and explicit grants.
- Add durable provider cleanup state (columns or a small cleanup-jobs table) before changing delete behavior.
- Tighten direct `DELETE` grants/policies so UI workflows cannot bypass retirement.

**Tasks:**

- [ ] Add migration tests for usage table constraints/indexes/RLS, Story usage union, retirement functions, fixed search paths, explicit grants, and direct-delete denial.
- [ ] Add database concurrency tests: a usage inserted concurrently with retirement must result in either a committed usage with retirement blocked or a committed retirement with usage insertion rejected.
- [ ] Implement repository queries returning consumer type, ID, field, title, locale/status, and admin href.
- [ ] Add failing service tests for unused, draft-used, published-used, missing, already-retired, restore, cleanup-success, and cleanup-failure cases.
- [ ] Replace hard-delete-first logic with atomic tombstone then retryable Cloudinary cleanup.
- [ ] Preserve public ID/secure URL until cleanup succeeds; record attempts and last sanitized error.
- [ ] Add UI usage list and Retire/Restore states; published usage must never expose a destructive override that silently breaks content.
- [ ] Add an admin “create replacement and move selected usages” design before implementing any bulk replacement mutation.
- [ ] Add a read-only reconciliation command/service that reports stale usage rows, missing DB objects, and Cloudinary orphans; deletion remains a separate admin-confirmed action.

**Tests:** Usage discovery, direct/explicit union, RLS, transaction race, soft delete, public protection, restore, provider retry, orphan reporting, admin/editor permissions.

**Dependencies:** Milestones 1-6 and approved retention/cleanup policy.

**Non-goals:** Automatic destructive orphan cleanup, generic database triggers parsing arbitrary JSON, silent admin override of published usage.

**Verification:**

```powershell
node --test src/features/admin/media/media-usage-schema.contract.test.mjs src/features/admin/media/media-lifecycle.test.mjs src/features/admin/media/media-usage.contract.test.mjs
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

## Milestone 9: Security, accessibility, performance, and operational hardening

**Objective:** Validate the complete system under real roles, high asset counts, keyboard-only use, failures, and deployment conditions.

**Files:**

- Modify/add focused tests under `src/features/admin/media/`
- Modify: `src/production-readiness.contract.test.mjs`
- Modify: `docs/media-library.md`
- Modify: `docs/row-level-security.md`
- Create: `docs/media-library-operations.md`
- Add SQL verification script: `supabase/verification/media-library-phase-5-verification.sql`

**Database changes:** Only index/policy corrections justified by test/query-plan evidence.

**Tasks:**

- [ ] Run role-matrix SQL verification as anon, reader, writer, editor, and admin against a disposable environment.
- [ ] Inspect `EXPLAIN (ANALYZE, BUFFERS)` for default page, text search, filtered page, usage count, and usage detail with representative thousands-of-assets fixtures.
- [ ] Add performance thresholds/contracts for bounded projections, query count, page size, and thumbnail transforms.
- [ ] Run automated accessibility checks and manual keyboard scripts for library, upload, detail, metadata editor, retire dialog, and picker.
- [ ] Verify focus restoration, reduced motion, zoom/reflow, high contrast, live progress, error association, and selected state.
- [ ] Exercise provider/database failure drills and cleanup retry; verify logs redact secrets and user messages omit provider internals.
- [ ] Verify Cloudinary folder, invalidation, immutable URL/cache behavior, backup/version settings, quota alerts, and operational credentials outside source control.
- [ ] Document orphan reconciliation, cleanup retry, restore window, replacement implications, incident rollback, and migration rollback.
- [ ] Run the complete suite and review all diffs for unrelated production changes or secrets.

**Tests:** Full schema/RLS/storage/provider matrix, security abuse cases, accessibility, performance, cleanup operations, Stories/Homepage regressions, production build.

**Dependencies:** All previous milestones and access to a disposable Supabase/Cloudinary environment.

**Non-goals:** New media types, new consumer features, provider migration.

**Verification:**

```powershell
npm test
npx tsc --noEmit
npm run lint
npm run build
npx --no-install supabase migration list --linked
git diff --check
git status --short
```

## Release and rollback sequence

1. Deploy additive schema and compatibility reads before new UI behavior.
2. Audit/backfill metadata and duplicate checksums in a disposable environment, then linked staging.
3. Deploy secure upload changes and observe provider/database compensation metrics.
4. Deploy scalable library and metadata editor.
5. Deploy picker, then Stories adoption behind the existing route deployment boundary.
6. Deploy usage/retirement primitives before exposing Retire.
7. Run Homepage Builder and public Story smoke tests in all locales after each relevant deployment.
8. Roll back application versions independently while additive columns remain. Do not reverse/drop columns until all deployed versions no longer depend on them.

## Approval gates before implementation

- Cloudinary remains the provider.
- `public.media` remains canonical.
- Writers may browse/select but not mutate shared assets.
- Normalized columns and hybrid `media_usages` are approved.
- Retention period and cleanup retry ownership are defined.
- Initial type/size policy is confirmed.
- Any proposed new dependency for signature/decoding validation receives explicit approval.

## Plan self-review

- Every design requirement maps to a milestone.
- Stories and Homepage Builder compatibility receive dedicated regression milestones.
- No migration renames/drops existing media identifiers.
- Storage, metadata, selection UI, usage, and deletion are separate responsibilities.
- Security is enforced at service, RLS, and database lifecycle layers.
- Migration filenames use the next reserved Phase 5 timestamps and must be checked against the migration ledger immediately before implementation.
