# INBCN Media Library Phase 5 Design

**Date:** 2026-08-12
**Status:** Proposed for approval
**Scope:** Investigation and design only; no production code, migration, storage, or dependency changes are part of this document.

## Objective

Evolve INBCN's existing Cloudinary-backed image library into the canonical reusable asset system for Stories, Homepage Builder, Hero Story, Hero Sidebar, Live TV, advertisements, and future CMS modules. Images remain the first supported upload type, while contracts and metadata must accommodate video, audio, and documents without creating a second media stack.

## Investigation Basis

The entire repository was searched for media schema, migrations, repositories, services, upload code, image rendering, URL generation, thumbnails, permissions, deletion, Cloudinary, Supabase Storage, and Homepage Builder references.

The linked Supabase project is `uoykitlsdawvpqfjeuqm`. `npx --no-install supabase migration list --linked` confirmed that all 21 repository migrations through `20260811160000_homepage_builder_structural_mutations.sql` are applied remotely. A remote schema dump could not be produced because the installed Supabase CLI requires Docker for that operation and Docker is unavailable. Therefore:

- table, foreign-key, index, grant, and RLS conclusions below are verified from migrations known to be applied remotely;
- application behavior is verified from the current source tree;
- live row contents, Cloudinary account configuration, derived Cloudinary settings, and any out-of-band database changes remain unverified.

No Supabase Storage integration exists in repository code or migrations. INBCN currently uses Cloudinary, not Supabase Storage, for media objects.

## Existing Architecture Discovered

```text
/admin/media and Stories MediaPicker
  -> authenticated Server Actions
  -> media.service.ts
  -> media.operations.ts
  -> media.repository.ts + cloudinary.server.ts
  -> user-scoped Supabase client/RLS + Cloudinary image API

Public stories
  -> stories.featured_media_id
  -> batched public.media lookup
  -> FeaturedMediaDto
  -> resolvePublicStoryImage()
  -> HomepageViewModel / Story Reader
  -> Homepage Renderer / story cards
```

This is already most of the desired conceptual architecture. Phase 5 should consolidate and harden it rather than replace it.

### Existing routes and components

- `/admin/media` renders the existing library.
- `media-library.tsx` provides an image grid, search, sort, pagination, preview details, replace, delete, empty state, and server-rendered loading/error behavior.
- `media-upload-form.tsx` uploads and replaces images with accessible pending and error announcements.
- `media-picker.tsx` lets Stories select an existing image. It is an inline expander, not an accessible modal library picker; it loads only the newest 60 options and has no search or pagination.
- There is no general picker used by Homepage Builder, Live TV, or advertisements.

### Existing application layers

- `media.model.ts`: image validation, metadata normalization, role helpers, record mapping, Cloudinary delivery URL export.
- `media.repository.ts`: page/search/sort queries, checksum lookup, CRUD, and Story reference counting.
- `media.service.ts`: authorization, view models, hashing, page size, picker options, and orchestration.
- `media.operations.ts`: provider/database compensation for upload and replacement and application-level delete protection.
- `cloudinary.server.ts`: server-only Cloudinary upload/destroy gateway.
- `media.actions.ts`: authenticated Server Actions and cache revalidation.

### Existing upload and validation behavior

- Server-side upload through the official Cloudinary SDK; no direct browser upload or signed upload credential.
- Folder: `inbcn/media`.
- Naming: `use_filename: true`, `unique_filename: true`, `overwrite: false`, with the original name supplied as `filename_override`.
- Accepted client and server MIME values: JPEG, PNG, WebP, AVIF.
- Maximum size: 10 MiB.
- Required metadata: title and image alt text.
- SHA-256 checksum is computed from bytes and used for duplicate detection.
- Cloudinary-returned public ID, URL, dimensions, format, asset ID, and byte count are persisted.
- A database insert/update failure triggers best-effort deletion of the newly uploaded Cloudinary object.

The current server trusts `File.type` when accepting the upload and persists that value as `mime_type`. Cloudinary restricts the resource to an image, but the application does not inspect magic bytes or compare detected type with provider output. This is the most important upload-validation gap.

## Existing Database Model and Relationships

### `public.media`

The applied baseline and relationship migrations define one canonical table named `media`; there is no `media_assets` table.

| Column | Current behavior |
| --- | --- |
| `id uuid` | Primary key, generated UUID. |
| `story_id uuid null` | Optional originating Story; changed from required/cascading to nullable/`ON DELETE SET NULL`. |
| `created_by uuid null` | References `profiles(id)`, `ON DELETE SET NULL`. |
| `media_type media_type` | Enum already contains `image`, `video`, `audio`, `document`. Current repository filters and inserts only `image`. |
| `cloudinary_public_id text` | Required, unique provider identifier. |
| `secure_url text` | Required HTTPS source URL. |
| `resource_format text null` | Provider format. |
| `mime_type text null` | MIME type; currently sourced from client `File.type`. |
| `alt_text text null` | Required by a database check for images. |
| `caption text null` | Editorial caption. |
| `width`, `height integer null` | Positive dimensions. |
| `duration_seconds numeric null` | Non-negative duration; not exposed by current DTOs. |
| `bytes bigint null` | Non-negative file size. |
| `sort_order integer` | Non-negative; legacy story-gallery field, unused by library UI. |
| `metadata jsonb` | Required JSON object. Current keys: title, credit, tags, uploader label, checksum, original filename, Cloudinary asset ID. |
| `created_at`, `updated_at` | Timestamps; `updated_at` is application-managed. |

Indexes are `media_story_id_sort_order_idx` and partial `media_created_by_idx`; uniqueness on `cloudinary_public_id` also creates an index. There is no index for library date ordering, media-type filtering, checksum lookup, title/tag search, soft deletion, or usage queries.

### Story relationships

- `stories.featured_media_id` is nullable and indexed with `stories_featured_media_id_idx`.
- It references `media(id) ON DELETE SET NULL`, allowing one media row to be reused by many stories.
- `media.story_id` is optional provenance/ownership, not exclusive attachment.
- Media has no `language_id`. Files and metadata are reusable across locales today.
- Translated Stories can point to the same media UUID independently.
- Imported Stories may have `external_image_url`, `external_image_width`, and `external_image_height` without a media row.

### Existing RLS and roles

RLS is enabled on `media`.

- Anonymous/authenticated public users can read media referenced by a published Story either through `media.story_id` or `stories.featured_media_id`.
- Writers can read media belonging to their own Stories and insert/update/delete media only for their own draft Stories.
- Editors and admins can perform all media operations.
- The Phase 5 library service intentionally allows only editor/admin because reusable rows use `story_id = null`; current writer RLS cannot manage those rows.
- App authorization uses signed `app_metadata.role`, not user-editable metadata.

The code uses the authenticated Supabase SSR client, so RLS remains the final database boundary. No service-role client is used for media mutations.

## Existing Storage Architecture

### Provider and visibility

Cloudinary is the sole discovered asset provider. Uploaded objects are delivery-addressable via public HTTPS URLs. The database stores both the stable `cloudinary_public_id` and the original `secure_url`; transformed URLs are generated at read time.

There are no repository-defined Supabase Storage buckets, object paths, signed URLs, `storage.objects` policies, `storage.buckets` policies, or bucket visibility settings. Consequently, no Supabase Storage bucket or policy should be added in Phase 5 unless the provider strategy is deliberately changed.

### URLs, thumbnails, and caching

- `buildCloudinaryDeliveryUrl()` builds transformed delivery URLs from cloud name and public ID.
- Public image resolution prefers featured Cloudinary media, then `external_image_url`, then `/images/news/story-fallback.svg`.
- Cloudinary media uses `f_auto,q_auto`; external URLs are marked unoptimized.
- The application uses `next/image` with responsive `sizes`; library and picker thumbnails use the same delivery URL rather than a dedicated persisted thumbnail.
- Upload code does not set a custom Cloudinary cache-control value. CDN behavior is therefore Cloudinary delivery behavior; deletion/replacement calls use `invalidate: true`.
- No signed delivery URL is used because current media is public editorial content.

### Cleanup behavior

- Failed metadata persistence after upload: best-effort deletion of the new Cloudinary resource.
- Replacement: upload new, update the same media row, delete old object last. All Story references keep the same UUID.
- Deletion: count Story featured references, delete metadata, then destroy the Cloudinary object.
- A remote delete failure after database deletion leaves an untracked Cloudinary orphan and only returns an operator-facing failure; there is no cleanup queue or tombstone.

## Stories and Homepage Image Flow

### Stories CMS to public Story

1. The Story form submits `featuredMediaId` through the existing `MediaPicker`.
2. The Story workflow preserves the current ID for writers and permits editor/admin selection after `isSelectableMedia()` verifies the media row.
3. `stories.featured_media_id` stores the reusable UUID.
4. Public Story repository queries load Stories, collect distinct media IDs, and batch-fetch the minimal media projection.
5. `FeaturedMediaDto` carries public ID, source URL, alt text, caption, width, and height.
6. `resolvePublicStoryImage()` chooses Cloudinary transformed URL first, imported external URL second, fallback SVG last.
7. Story Reader uses that image for the article, Open Graph, Twitter, JSON-LD, related content, and sidebar cards.

### Homepage and Homepage Builder

1. `getStoriesByLanguage()` returns currently published locale-scoped Stories and batch-attaches featured media.
2. `composeHomepageData()` converts every Story to `HomepageStory`, resolving the same featured/external/fallback image chain.
3. The legacy homepage consumes `HomepageViewModel` directly.
4. Homepage Builder stores Story IDs for Hero Story and Hero Sidebar, a category ID for Category Section, and limits for list blocks. It stores no image UUID or direct image URL.
5. Homepage Renderer resolves configured Story IDs against `HomepageViewModel.all`; Breaking, Latest, Trending, Category, Hero Story, and Hero Sidebar all receive the already-resolved `HomepageStory.image`.
6. Story cards and Hero Sidebar render with `next/image` and editorial alt text.

Therefore all Story-backed Homepage Builder images ultimately use `featured_media_id`, falling back to `external_image_url`, then the local fallback. Advertisement placeholders have no asset today. Live TV imagery is provider/backdrop-specific and is not integrated with `media`.

## Options Considered

### A. Extend `public.media` in place — recommended

Preserve IDs, foreign keys, public readers, Story integration, Cloudinary delivery, and existing code. Normalize only fields that need indexing or lifecycle guarantees and add usage/deletion primitives.

Advantages: smallest migration risk, no backfill of Story foreign keys, no compatibility layer, immediate Homepage compatibility. Disadvantage: provider-specific column names remain unless renamed later; a rename is not necessary for Phase 5.

### B. Create `media_assets` and migrate compatibility

This would offer cleaner provider-neutral names but duplicate the canonical concept, require backfill and dual reads, and risk breaking `stories.featured_media_id` and RLS. It is rejected.

### C. Move objects to Supabase Storage

This would introduce bucket and Storage policy work without solving a current provider problem, discard working Cloudinary transforms/CDN behavior, and create migration/orphan risk. It is rejected for Phase 5.

## Recommended Architecture

```text
Cloudinary object storage and transformations
  -> public.media canonical metadata row
  -> media repository (queries and atomic lifecycle RPCs)
  -> media service (authorization, validation, provider orchestration)
  -> /admin/media library and reusable MediaPicker
  -> Stories / Homepage Builder / Ads / Live TV / future modules

References
  -> direct typed FK for Stories featured image
  -> media_usages for JSON/configuration or polymorphic module references
```

Key boundaries:

- Storage owns bytes, delivery, transformations, and invalidation.
- `public.media` owns provider identity, intrinsic properties, editorial metadata, audit, and lifecycle state.
- Consumer tables own their selected media IDs where a stable typed FK is practical.
- `media_usages` provides indexed discovery and deletion protection for references that live in JSON or heterogeneous modules.
- UI never writes storage/provider identifiers directly and never accepts manual UUID entry.

## Proposed Media Asset Model

Keep current columns unless noted. Add or normalize only what is needed.

| Field | Decision and purpose |
| --- | --- |
| `id` | Keep. Stable reusable application identity. |
| `media_type` | Keep enum. Enables future type-specific validation and filters. |
| `cloudinary_public_id` | Keep for Phase 5 as the storage key; treat it as server-owned. A generic `storage_path` would duplicate it while Cloudinary remains the only provider. |
| `secure_url` | Keep as provider fallback and operational evidence; generate transformed/public URLs at read time. |
| `original_filename` | Promote from JSON to nullable text for display/search and sanitize before provider use. Backfill from metadata. |
| `mime_type` | Keep, but populate from server-side signature/provider verification rather than client MIME. |
| `resource_format` | Keep provider-reported format. |
| `bytes` | Keep as file size. |
| `width`, `height` | Keep for image/video layout and aspect ratio. |
| `duration_seconds` | Keep for future audio/video. |
| `title` | Promote from JSON to required text for indexed editorial search. |
| `alt_text` | Keep. Required for images at publish/selection boundaries; empty is valid for non-image media where an alternative is not applicable. |
| `caption` | Keep optional. |
| `credit` | Promote from JSON to nullable text for search and consistent display. |
| `description` | Do not add initially; title, caption, alt text, and credit cover the image milestone. Reconsider for documents/video only when a workflow needs it. |
| `metadata` | Keep JSON for provider asset ID, tags, detected technical facts, and future type-specific properties. Remove duplicated promoted keys after a safe compatibility period. |
| `created_by` | Keep. Original uploader identity. |
| `updated_by` | Add nullable FK to profiles for metadata/lifecycle audit. |
| `created_at`, `updated_at` | Keep; use a database trigger or explicit RPC assignment for reliable update time. |
| `deleted_at`, `deleted_by` | Add nullable soft-delete audit fields. Active queries exclude deleted rows. |
| `story_id` | Keep temporarily as nullable origin provenance for compatibility. Do not use it as the canonical usage mechanism. |
| `sort_order` | Keep for compatibility but deprecate; ordering belongs to a consumer usage/gallery relationship. |

Do not add locale to `media`. Binary assets and default metadata remain global/reusable. If localized alt text or captions become a real requirement, add a separate `media_localizations(media_id, language_id, ...)` table later rather than duplicating assets.

### Proposed `media_usages`

Use an explicit, compact usage registry for references not represented by a direct SQL foreign key:

- `id uuid primary key`
- `media_id uuid not null references media(id) on delete restrict`
- `consumer_type text not null` constrained to registered values
- `consumer_id uuid not null`
- `field_name text not null`
- `created_at timestamptz not null`
- unique `(media_id, consumer_type, consumer_id, field_name)`
- indexes on `(media_id)` and `(consumer_type, consumer_id)`

Stories remain authoritative through `stories.featured_media_id`; a read-only usage query unions Story references with `media_usages`. When Homepage Builder or Ads begin selecting media directly, their mutation transaction must update configuration and usage rows together. Do not populate usage rows by client request alone.

## Security Model

### Authentication and roles

- All mutations begin with `requireAdminUser()` and use authenticated, user-scoped Supabase clients.
- Editors and admins may upload and edit metadata.
- Only admins may force retirement, restore, or request destructive cleanup.
- Writers may browse and select active image assets for their own editable Stories, but may not replace/delete shared assets. This requires new read/select policy behavior; it must not reuse the legacy story-owned write policies.
- RLS must mirror service authorization; UI hiding is not authorization.

### Upload validation

- Enforce per-media-type allowlists and size limits on the server.
- Images initially: JPEG, PNG, WebP, AVIF; 10 MiB unless product approval changes it.
- Inspect magic bytes with a bounded server-side detector and reject mismatch with client MIME/extension.
- Decode the image or rely on verified provider response to confirm dimensions and format; reject malformed/polyglot inputs.
- Generate the provider filename/path server-side from a UUID plus sanitized extension. Keep the original filename only as metadata.
- Strip path separators, control characters, bidi overrides, and reserved path components from display filenames; never concatenate client filenames into a storage path.
- Do not accept public IDs, secure URLs, dimensions, byte counts, or checksums from the browser.
- Rate and concurrency limits should be enforced at the upload action or infrastructure boundary before direct uploads are considered.

### Database and storage policy

- Public can select only active media referenced by currently published content.
- Authenticated editorial users can select active media according to role.
- Only editor/admin can insert or edit canonical library metadata; admin alone can restore/override deletion.
- Add database functions for atomic usage registration and retirement checks, with fixed `search_path`, explicit grants, and RLS-aware callers.
- Cloudinary API secret remains server-only. No unsigned destructive provider call is exposed.
- If direct browser uploads are introduced later, use short-lived signed parameters constrained by folder, resource type, size, and allowed formats, followed by server verification before a media row becomes selectable.

## Storage Model

- Continue Cloudinary for Phase 5.
- Canonical folder convention for new objects: `inbcn/media/<media-type>/<yyyy>/<mm>/<uuid>`; never derive folders from user input or locale.
- Store original provider public ID and secure URL; generate transforms at read time.
- Centralize named transformation builders for `thumb` (small square/grid), `card` (responsive editorial crop), and `original` rather than persisting derivative rows.
- Prefer immutable public IDs for new binary replacements. Replacement keeps the media UUID but points it at a newly generated public ID, then retires the old object after durable metadata change.
- Use long-lived CDN caching for versioned/immutable transformed URLs. Provider invalidation remains a cleanup safety net rather than the normal cache-update mechanism.
- External imported images remain external fallbacks until an editor explicitly ingests them into the library; ingestion must download and validate server-side.

## Media Library UI

`/admin/media` remains in the existing admin shell.

- Default grid view with responsive, lazy-loaded dedicated thumbnail transforms.
- Optional compact list view can follow after the grid workflows are complete; persist preference locally, not in schema.
- Search title, filename, alt text, caption, credit, tags, and public ID.
- Filters: media type and created date range; images are the only enabled upload type initially.
- Stable keyset pagination is preferred for thousands of assets; offset pagination may remain for the first compatible iteration if ordering uses `(created_at, id)` and tests cover page boundaries.
- Upload panel/dialog with validation summary and progress/status announcements.
- Preview/detail dialog with intrinsic facts, editorial metadata, uploader/audit, and usage list.
- Metadata editing is independent from binary replacement.
- Delete action becomes Retire when unused; in-use assets show usages and replacement guidance.
- Loading skeletons, retryable error state, empty library state, and no-results state use existing admin components.

## Reusable `MediaPicker`

Build one controlled, consumer-neutral picker instead of extending the current 60-item inline list.

Suggested contract:

```ts
type MediaPickerProps = {
  value: string | null;
  onSelect(media: MediaPickerItem | null): void;
  allowedTypes: readonly MediaType[];
  required?: boolean;
  label: string;
  describedBy?: string;
};
```

The picker opens an accessible modal dialog using the existing Radix/shadcn primitives. It contains search, type/date filters, paginated results, thumbnail grid, current-selection preview, clear/cancel/confirm actions, and an upload entry point when the role allows it.

Accessibility requirements:

- focus moves to the dialog heading/search on open and returns to the trigger on close;
- Escape cancels, Tab remains trapped, arrow keys move within the result grid, Home/End move to row bounds, and Enter/Space select;
- each option exposes title, type, dimensions, and selected state to screen readers;
- selection changes and result counts use polite live regions;
- errors use `role=alert`; upload state exposes determinate progress when available;
- decorative thumbnails use empty alt only when the option's accessible name supplies the editorial alternative; preview images use stored alt text;
- no UUID text field is presented.

Stories should migrate from the inline picker first. Homepage Builder should continue selecting Stories for Hero/Sidebar/Category/Latest/Breaking; it does not need direct media selection until a block has an explicit media override requirement. Advertisements and future image blocks can then use this picker directly.

## Usage Tracking Strategy

Choose a hybrid approach:

1. Direct SQL references remain the source of truth where they exist (`stories.featured_media_id`).
2. `media_usages` records references embedded in JSON or heterogeneous future modules.
3. One server-side usage query returns normalized entries such as consumer type, consumer ID, title, locale, status, field, and admin link.
4. Periodic reconciliation scans known direct columns/configuration shapes and reports missing/stale usage rows; it does not silently delete content.

Pure dynamic scanning is initially cheap but becomes fragile and slow as JSON consumers grow. A universal polymorphic table alone cannot provide true foreign keys to every consumer. The hybrid retains typed database integrity for Stories and gives reliable indexed discovery for flexible modules.

## Safe Deletion Strategy

Use two-phase retirement, never immediate row deletion from the UI.

1. Load all usages through a database function in the same transaction used to retire.
2. If any published/scheduled usage exists, block retirement for editors and show exact locations. Admin override still requires replacement/removal first; it must not silently break published content.
3. Draft-only usage also blocks normal retirement but can be resolved through replacement/removal workflows.
4. If unused, set `deleted_at/deleted_by`; active queries and pickers exclude the row immediately.
5. Enqueue or mark provider cleanup durably. Delete the Cloudinary object only after the tombstone is committed.
6. On provider success, record cleanup completion; on failure, retry without losing the public ID.
7. Keep a restore window while the provider object exists. Hard-delete metadata only through a later admin maintenance job after retention.

Replacement of an in-use media binary remains permitted to preserve current behavior, but the UI must state that it changes every usage. A safer optional workflow is “create new asset and replace selected usages,” which should be preferred for published content.

Orphan reconciliation compares active/tombstoned database public IDs with Cloudinary resources under the canonical folder. It reports database-orphan and provider-orphan candidates and requires an admin-reviewed cleanup action.

## Performance Design

- Add `(media_type, deleted_at, created_at desc, id desc)` for filtered paging.
- Add normalized searchable columns and a PostgreSQL full-text or trigram index after measuring query needs; do not continue comma-built `or(ilike...)` indefinitely.
- Add indexes for both directions of `media_usages`.
- Select list projections only; fetch metadata/detail and usages on demand.
- Batch usage counts for page IDs in one grouped database query/RPC, replacing the current row-return/count loop.
- Use Cloudinary thumbnail transformations and `next/image` sizes; lazy-load below-the-fold images.
- Keep Story media batching; it already avoids an N+1 query for homepage lists. `getStoryBySlug()` may remain a single extra lookup.
- Cache public transformed assets aggressively using immutable/versioned URLs. Revalidate application paths after metadata or selection changes, not after browsing.

## Failure and Consistency Model

- Upload failure before provider success creates no database row.
- Provider success plus database failure triggers immediate cleanup and records a cleanup candidate if cleanup fails.
- Metadata edits are database-only and optimistic-concurrency protected with `updated_at`.
- Replacement uploads first, conditionally swaps the row, then schedules old-object cleanup.
- Retirement is database-atomic with usage checks.
- Provider cleanup is retryable and never erases the database evidence needed to retry.
- Picker queries fail closed: unavailable/deleted media cannot be confirmed.
- Public rendering retains featured media -> external image -> fallback behavior during migration.

## Test Strategy

### Schema and policies

- Migration contract tests for columns, constraints, indexes, FKs, triggers/functions, grants, and reversible data backfills.
- Remote/local database tests with anon, writer, editor, admin, and service-role sessions.
- Verify public reads require a published reference; writer selection is permitted but shared mutation/deletion is denied; editor/admin behavior matches the service.
- Verify atomic retirement refuses every registered usage type and cannot race a new usage.

### Upload and provider operations

- Red tests first for magic-byte mismatch, malformed images, extension/MIME mismatch, size boundaries, empty files, filename sanitization, path traversal, duplicate bytes, and provider-reported mismatch.
- Compensation tests for provider failure, database failure, cleanup failure, replacement conflict, and retry registration.
- Assert secrets/provider identifiers never cross client boundaries.

### Repository and service

- Search normalization and indexed fields, filters, stable pagination, minimal projections, usage aggregation, metadata optimistic concurrency, soft-delete exclusion, restore, and role checks.
- Page-boundary and same-timestamp pagination fixtures.
- No-N+1 contracts for library usage counts and public Story lists.

### UI and accessibility

- Library grid/list, filters, upload, preview, edit, empty/loading/error states, retire/restore feedback.
- Picker search/filter/page/selection/clear/cancel/confirm and stale-selection behavior.
- Automated accessibility assertions plus keyboard tests for focus trap, arrow navigation, Escape, focus restoration, live announcements, labels, and selected state.

### Integration and regression

- Stories save and render the selected media through `featured_media_id`.
- Imported external image fallback remains unchanged.
- Legacy homepage and Homepage Builder Hero, Hero Sidebar, Category, Latest, Breaking, Trending, and Story Cards retain the same image precedence.
- Published references prevent retirement.
- Future consumer registration tests prove usage creation/removal is transactionally coupled to the consumer mutation.

Verification baseline for each implementation milestone:

```powershell
npm test
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

## Compatibility and Migration Sequence

1. Add nullable/new columns and indexes without changing existing reads.
2. Backfill normalized fields from `metadata` in bounded SQL updates.
3. Deploy dual-read mapping (column first, legacy JSON fallback) and dual-write if rollout spans versions.
4. Add usage/retirement functions and policies before exposing new delete behavior.
5. Migrate the existing library/picker to new queries.
6. Verify Stories and Homepage rendering against existing media UUIDs.
7. Only after observation, stop writing duplicated promoted keys to JSON. Do not rename provider columns in Phase 5.

## Non-goals

- Moving existing binaries from Cloudinary to Supabase Storage.
- Enabling video/audio/document uploads in the first implementation.
- Adding direct media overrides to Story-backed Homepage Builder blocks.
- Replacing external imported images automatically.
- AI generation, cropping/editing, DAM workflows, or asset licensing automation.
- Hard-deleting media synchronously from the UI.

## Decisions Requiring Approval

1. Approve Cloudinary as the continuing canonical object store for Phase 5.
2. Approve extending `public.media` rather than creating `media_assets`.
3. Approve normalized `title`, `original_filename`, `credit`, audit, and soft-delete columns while retaining compatibility fields.
4. Approve hybrid usage tracking with direct Story FK plus `media_usages` for flexible consumers.
5. Approve writer browse/select access but editor/admin-only canonical asset mutation.
6. Approve two-phase retirement and asynchronous/retryable provider cleanup rather than immediate hard deletion.
7. Confirm the initial 10 MiB image limit and JPEG/PNG/WebP/AVIF allowlist.

## Risks and Unknowns

- The remote migration ledger matches the repository, but a live schema dump and live RLS catalog comparison were blocked by missing Docker; out-of-band schema drift is still possible.
- Cloudinary account upload presets, moderation, backup/versioning, retention, quotas, and account-level delivery/cache settings are not represented in the repository and were not inspectable.
- Existing rows may have incomplete or inconsistent JSON metadata and client-derived MIME values; a pre-migration audit is required.
- Current checksum lookup over JSON has no dedicated uniqueness constraint and may fail if duplicate legacy rows exist.
- `ON DELETE SET NULL` can silently remove Story imagery if a privileged path bypasses the service; database retirement guards must become authoritative.
- Current deletion can orphan Cloudinary objects after metadata deletion; cleanup state must be durable before broadening usage.
- Existing public-media RLS uses Story references. Future non-Story published consumers need an explicit public-read rule without exposing unused/private assets.
- Homepage Builder currently needs no direct media usage rows because it selects Stories, not images. Adding image overrides later changes this assumption.

## Self-Review Outcome

The proposal reuses the existing table, Cloudinary gateway, repository/service layering, Story foreign key, public image resolver, and admin design system. It adds only normalized searchable fields, lifecycle audit, an explicit usage registry for otherwise-untrackable references, and database-authoritative retirement. It preserves all current Story and Homepage image precedence and avoids a duplicate provider, table, picker, or URL system.
