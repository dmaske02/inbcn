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
  media-picker.tsx           Story featured-image picker
```

Routes:

```text
/admin/media                 Media grid, upload, search, sort, preview, replace, delete, pagination
/admin/stories/new           Featured-image selection for a new story
/admin/stories/[id]          Featured-image selection for an existing story
```

## Upload flow

1. An editor or administrator selects a JPEG, PNG, WebP, or AVIF image.
2. The Server Action calls `requireAdminUser()` and passes the file to the Media Service.
3. The service enforces the role, 10 MB limit, required title and alt text, and calculates a SHA-256 checksum.
4. Duplicate checks run against metadata before any Cloudinary upload.
5. The official Cloudinary SDK performs a server-side upload into `inbcn/media`.
6. The repository writes the original public ID, secure source URL, dimensions, format, bytes, accessible metadata, checksum, and uploader label through the Supabase SSR client.
7. RLS is the final authorization boundary.

If the database write fails after a successful upload, the new Cloudinary resource is deleted as compensation. No service-role client is used.

## Replacement and deletion

Replacement preserves the Supabase media ID so every story that reuses the asset continues to reference the same row. The new asset is uploaded first, the database row is updated second, and the old Cloudinary asset is removed last. A failed database update removes the newly uploaded asset and leaves the original intact.

Deletion is blocked while `stories.featured_media_id` references the media row. Once unused, the repository row is deleted and the Cloudinary resource is removed. A remote cleanup failure is reported without exposing provider details; an operator may need to remove that orphaned Cloudinary resource manually.

## Metadata strategy

Schema-native columns store alt text, caption, dimensions, format, MIME type, size, public ID, secure URL, creator ID, and timestamps. The existing `media.metadata` JSON object stores:

- title
- credit
- tags
- uploader display label
- SHA-256 checksum
- original filename
- Cloudinary asset ID

No extra columns or compatibility tables are introduced.

## Story and public delivery

Stories continue storing only `featured_media_id`. Editors and administrators can choose an existing image, open the Media Library to upload a new one, or remove the selection. Writers see a non-interactive media state and cannot overwrite an existing selection.

Public repositories batch-load media metadata for published stories under existing RLS. Homepage, category, related-story, and Story Reader models derive optimized Cloudinary delivery URLs from the public ID. `f_auto,q_auto` enables automatic WebP/AVIF negotiation and quality optimization; `next/image` supplies responsive sizing and layout behavior. If media is missing or not publicly readable, the existing story fallback image is used.

The schema requires `secure_url`, so the original untransformed secure URL is retained as a provider fallback. Transformed delivery URLs are never stored.

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
- Remote cleanup failures can leave an orphaned Cloudinary asset and require operational cleanup.
- Video, audio, image editing, AI generation, and direct browser uploads are outside this milestone.
