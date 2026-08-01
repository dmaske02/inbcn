# Story Management

## Architecture

Story Management follows the existing server-first dependency chain:

```text
Admin UI → Server Actions → Story Service → Story Repository → Supabase → RLS
```

- The UI renders view models and submits forms. Client Components handle only slug assistance, read-time presentation, and pending form state.
- Server Actions authenticate every mutation with `requireAdminUser()`, validate form data, call one service operation, revalidate affected routes, and return safe errors.
- The server-only Story Service owns pagination, filters, sorting, slug uniqueness, permissions, workflow transitions, read-time calculation, and view-model composition.
- The repository performs typed reads and persistence with the regular Supabase SSR client. It returns stable CMS DTOs and never exposes PostgREST responses.
- Supabase RLS is the final authorization boundary. The service-role client is never used by application code.

## Folder structure

```text
src/app/admin/(protected)/stories/
├── page.tsx
├── loading.tsx
├── new/page.tsx
└── [id]/page.tsx

src/features/admin/stories/
├── story.actions.ts
├── story-editor.tsx
├── story-form.tsx
├── story-list.tsx
├── story.model.ts
├── story.model.test.mjs
├── story.service.ts
├── story.workflow.ts
└── story.workflow.test.mjs

src/features/news/server/
├── dto.ts
├── index.ts
└── stories.repository.ts
```

## Routes

- `/admin/stories`: searchable, filterable, sortable, paginated story table with role-aware bulk actions.
- `/admin/stories/new`: draft editor available only to writers and admins.
- `/admin/stories/[id]`: story editor and explicit workflow commands.

## Data flow

List filters are URL search parameters so results remain server-rendered, linkable, and refresh-safe. The service normalizes those parameters before passing a typed query to the repository. Reference data supplies language, category, source, and author labels without leaking database rows into components.

Editor submissions are validated with Zod. Tags are normalized into the existing `seo_keywords` array. CMS content is stored as `staff_article`. Read time is derived at 200 words per minute and rounded up. Media and alt controls are disabled placeholders; no placeholder values are persisted.

## Publishing workflow

| Role | Permitted commands |
| --- | --- |
| Writer | Create draft, save owned draft, submit owned draft for review |
| Editor | Edit pending review, approve, publish approved, schedule approved, archive approved/scheduled/published |
| Admin | Create, edit, submit, approve, publish, schedule, archive, delete |

Status is informative and cannot be edited directly. Commands produce database-safe timestamp patches:

- Submit sets `pending_review` and `submitted_at`.
- Approve sets `approved`, `approved_by`, and `approved_at`.
- Publish sets `published` and `published_at`; direct admin publication also supplies required review timestamps.
- Schedule sets `scheduled` and a future `scheduled_at` without setting `published_at`.
- Archive preserves publication history and sets `archived`.

## Validation and errors

Zod validates all editable schema-backed fields, URLs, UUID selections, and slug format. Slug uniqueness is checked per language before insert or update and remains protected by the database unique constraint. Missing stories render the Next.js not-found state. Repository failures and invalid transitions are converted to safe editorial messages.

## Verification

The connected Supabase project was tested end to end with the development editorial identity:

1. Admin created a draft through `/admin/stories/new`.
2. The same identity was assigned the writer role and submitted its owned draft.
3. The identity was assigned the editor role and approved then published the story.
4. `/en` rendered the published headline from the live repository data.
5. The identity was restored to active admin and deleted the verification story through the CMS.

This exercised the real repository, normal authenticated Supabase client, RLS policies, role-adaptive UI, workflow timestamps, public homepage revalidation, and deletion cleanup.

## Current limitations

- Body content is plain text.
- Media selection and media alt metadata are unavailable until the Media Library milestone.
- Scheduled stories require a future publishing worker; this milestone records the schedule but does not implement that worker.
- Bulk operations run sequentially and are not a database transaction; a later RPC migration would be required for atomic batches.
