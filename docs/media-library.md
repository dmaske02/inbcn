# Media Library and Image Management

## Overview

INBCN uses Cloudinary as the image asset provider and Supabase as the metadata and relationship store. The Media Library is available at `/admin/media` to authenticated editors and administrators. Writers do not receive library actions because the existing RLS policies do not allow reusable, unassigned media management for that role.

The implementation follows the existing application layers:

```text
Admin page and client interactions
  -> Server Actions
  -> Media Service
  -> Media Repository + Cloudinary gateway
  -> user-scoped Supabase SSR client
  -> Row Level Security
```

Cloudinary secrets are used only by `cloudinary.server.ts`. Client Components receive public delivery URLs and stable media view models; they never receive an API key, API secret, service-role key, or signed upload credential.

## Environment

Create `.env.local` from `.env.example` and configure:

```dotenv
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
```

The public and server cloud names must refer to the same Cloudinary product environment. `.env.local` is ignored by Git and must never be committed. The API secret is server-only.

## Directory structure

```text
src/features/admin/media/
  cloudinary.server.ts       Official SDK gateway
  media.actions.ts           Authenticated Server Actions
  media.repository.ts        Supabase persistence and queries
  media.service.ts           Orchestration and view models
  media.model.ts             Pure validation and mapping rules
  media.operations.ts        Testable asset/database operations
  media.types.ts             Stable media DTOs
  media-library.tsx          Server-rendered library
  media-upload-form.tsx      Interactive upload/replace form
  components/media-picker.tsx Reusable active-image picker
```

Routes:

```text
/admin/media                 Media grid, upload, search, sort, preview, replace, retire/restore, pagination
/admin/stories/new           Featured-image selection for a new story
/admin/stories/[id]          Featured-image selection for an existing story
```

## Upload flow

1. An editor or administrator selects a JPEG, PNG, WebP, or AVIF image.
2. The Server Action calls `requireAdminUser()` and passes the file to the Media Service.
3. The service enforces the role, 10 MB limit, required title and alt text, and calculates a SHA-256 checksum.
4. Duplicate checks run against metadata before any Cloudinary upload.
5. The official Cloudinary SDK performs a server-side upload into a server-generated `inbcn/media/image/YYYY/MM/<uuid>` identifier.
6. The repository writes the original public ID, secure source URL, dimensions, format, bytes, accessible metadata, checksum, and uploader label through the Supabase SSR client.
7. RLS is the final authorization boundary.

If the database write fails after a successful upload, the new Cloudinary resource is deleted as compensation. No service-role client is used.

## Replacement and retirement

Replacement preserves the Supabase media ID so every story that reuses the asset continues to reference the same row. The new asset is uploaded first, the database row is updated second, and the old Cloudinary asset is removed last. A failed database update removes the newly uploaded asset and leaves the original intact.

`stories.featured_media_id` is the sole authoritative current media usage
relationship. An image cannot be retired while any Story references it,
regardless of Story status, and retirement never detaches a Story.

Retirement sets the existing `deleted_at` and `deleted_by` audit fields through
guarded database functions. Retired assets are excluded from the active Media
Library, reusable picker, and Story selection. An explicit Retired view allows
editors and administrators to restore the same record and UUID by clearing
those fields.

Milestone 8 does not permanently delete media records or Cloudinary objects.
There is no retention period, provider cleanup workflow, or retry queue. Upload
compensation and replacement cleanup remain separate existing provider
operations.

## Metadata strategy

`public.media` remains the canonical media table; Phase 5 does not introduce a
parallel asset table or change Cloudinary as the file provider. Schema-native
columns store title, original filename, credit, alt text, caption, dimensions,
format, MIME type, size, public ID, secure URL, creator/updater IDs, lifecycle
audit, and timestamps.

The normalized `title`, `original_filename`, and `credit` values are backfilled
from the existing `media.metadata` JSON object. Application mapping reads the
normalized column first, then the legacy JSON value, then a safe display
fallback where appropriate. The JSON object is retained unchanged and still
stores:

- title
- credit
- tags
- uploader display label
- SHA-256 checksum
- original filename
- Cloudinary asset ID

New uploads and replacements write both normalized fields and compatible JSON
metadata. Existing UUIDs, `cloudinary_public_id`, `secure_url`, `story_id`, and
`sort_order` remain unchanged.

## Active and retired metadata

Active library queries require `deleted_at is null`. `deleted_at` and
`deleted_by` are additive lifecycle fields; `updated_by` records the most recent
known metadata actor. Updater and deleter references use `ON DELETE SET NULL`.
Lifecycle fields are mutated only by guarded retirement and restoration RPCs;
authenticated clients cannot directly update them or delete media rows.

Default newest ordering is deterministic: `created_at desc`, then `id desc`.
The active-media index begins with `media_type` and `deleted_at`, followed by
that ordering. No full-text or trigram extension is added. Current bounded,
server-paginated search spans normalized title, original filename, credit, alt
text, caption, and the legacy JSON title via `ilike`.

## Story and public delivery

Stories continue storing only `featured_media_id`. Editors and administrators can choose an existing image, open the Media Library to upload a new one, or remove the selection. Writers see a non-interactive media state and cannot overwrite an existing selection.

Public repositories batch-load media metadata for published stories under existing RLS. Homepage, category, related-story, and Story Reader models derive optimized Cloudinary delivery URLs from the public ID. `f_auto,q_auto` enables automatic WebP/AVIF negotiation and quality optimization; `next/image` supplies responsive sizing and layout behavior. If media is missing or not publicly readable, the existing story fallback image is used.

The schema requires `secure_url`, so the original untransformed secure URL is retained as a provider fallback. Transformed delivery URLs are never stored.

## Homepage Builder media compatibility

Homepage Builder does not currently own a direct media reference. Its visual
blocks preserve their established contracts:

- Hero Story stores `storyId`; its image resolves from the Story's
  `featured_media_id` through `public.media`.
- Hero Sidebar stores one to three unique `storyIds`; each image follows the
  same Story-to-media resolution path.
- Category sections store `categoryId` and resolve the eligible localized
  Stories for that category.
- Breaking News, Latest News, Trending, and Opinion store only a result limit
  and resolve localized Story collections.
- Advertisement stores a presentation label for its existing slot placeholder;
  it has no image or media field.
- Live TV has no block configuration and resolves the existing Live TV view for
  the persisted homepage locale.
- Text placeholders retain their existing text-only configuration. No external
  image URL field exists in the current registry.

Consequently, no Homepage Builder editor uses `MediaPicker` in Milestone 7.
Adding a media UUID to any current block would duplicate a Story relationship
or invent a new contract. The existing reducer, validation, autosave queue,
server-confirmed reconciliation, persisted preview, locale checks, permissions,
drag-and-drop, duplication, and deletion pipelines remain unchanged.

A future direct-media block would require a separately approved usage contract
and could reuse the generic `MediaPicker` only after that contract is approved.
The current architecture intentionally has no `media_usages` table: Story usage
is authoritatively derived from `stories.featured_media_id`, Homepage Builder
usage remains indirect through Stories, and Live TV poster URLs remain external.

## Security model

- Every mutation starts with `requireAdminUser()`.
- Media Service role checks allow only `editor` and `admin`.
- Supabase requests use the authenticated SSR client and remain subject to RLS.
- Cloudinary secrets remain in server-only modules.
- File type, file size, title, alt text, duplicate checksum, and story usage are validated server-side.
- Client-supplied dimensions, Cloudinary public IDs, and secure URLs are never trusted.
- Search input is normalized before it is included in a PostgREST filter.

## Current limitations

- Upload progress is an accessible indeterminate pending state; Server Actions do not expose byte-level progress.
- The story picker opens the Media Library in a new tab for uploads. Refresh the story editor to see a newly uploaded image.
- Replacement updates every story reusing the same media row by design.
- Retirement preserves both the database record and its Cloudinary object; permanent cleanup is outside Milestone 8.
- Video, audio, image editing, AI generation, and direct browser uploads are outside this milestone.
