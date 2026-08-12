# INBCN Homepage Builder Phase 1 Design

## Scope

Phase 1 creates the production database and editorial CMS foundation for a multilingual Homepage Builder. It does not alter, replace, import into, or otherwise affect the existing public homepage. It does not add public rendering, drag-and-drop, analytics, caching, SEO, drafts, publishing workflows, revisions, rollback, auto-save, or live preview.

English, Hindi, and Marathi each have one directly managed current homepage configuration. Sections remain persisted when disabled or outside their schedule. The preview model excludes inactive sections and is not consumed by the public homepage.

## Persistence model

### `homepage_configurations`

One stable homepage identity exists per active language:

- `id uuid primary key`
- `language_id uuid not null` referencing `languages(id)` with `on delete restrict`
- `created_by uuid` and `updated_by uuid` referencing `profiles(id)` with `on delete set null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`
- unique constraint on `language_id`

The stable configuration row is the future anchor for additive version, publication, rollback, and scheduled-publication tables. None of those workflows exist in Phase 1.

### `homepage_sections`

Each row is one ordered block instance:

- `id uuid primary key`
- `homepage_configuration_id uuid not null` referencing `homepage_configurations(id)` with `on delete cascade`
- `block_id text not null`, a stable editor-facing block identifier within a configuration
- `title text not null`
- `block_type text not null`
- `renderer text not null`
- `position integer not null`
- `container text not null`: `main`, `sidebar`, or `footer`
- `width text not null`: `full`, `half`, `third`, or `quarter`
- `enabled boolean not null`
- `starts_at timestamptz`
- `ends_at timestamptz`
- `configuration jsonb not null`
- `created_by uuid` and `updated_by uuid` referencing `profiles(id)` with `on delete set null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`
- unique constraints on `(homepage_configuration_id, position)` and `(homepage_configuration_id, block_id)`

Database checks enforce non-empty identifiers and titles, non-negative positions, supported persisted layout values, JSON objects, and an end time later than its start time. Block types and renderer/configuration compatibility remain application concerns so new registry entries do not require migrations.

Indexes support configuration lookup, ordered section reads, enabled/scheduled filtering, and CMS recency. Existing `set_updated_at()` triggers maintain timestamps.

Row-level security permits authenticated writers, editors, and administrators to read builder data. Editors and administrators can insert, update, and delete. Writers cannot mutate. Anonymous users receive no access in Phase 1 because the public homepage is not integrated.

## Atomic ordering

Ordering is contiguous and zero-based within each homepage configuration. PostgreSQL functions perform move and delete operations atomically:

- Moving up swaps the target with the preceding position.
- Moving down swaps the target with the following position.
- Deleting removes the section and compacts all later positions.
- Creating appends at the next available position.

The swap function uses a temporary sentinel position inside one transaction so the unique position constraint is never violated. Functions validate authorization and configuration ownership. This same position contract can later accept drag-and-drop target indexes without changing stored data.

## Block registry

The application registry is the sole catalog of supported block types:

- Hero Story
- Breaking News
- Live TV
- Latest News
- Category Section
- Trending
- Opinion
- Advertisement Placeholder
- Custom HTML Placeholder
- Future Placeholder

Every definition exposes `id`, `type`, `renderer`, a Zod configuration schema, a validation function, and default configuration. Registry identifiers are stable machine values. Unknown types, mismatched renderers, and malformed configuration objects are rejected before persistence.

Story-backed blocks store story identifiers in JSON configuration. Category-backed blocks store a category identifier. Live TV stores no credentials and resolves the locale's existing Live TV configuration. Custom HTML may be stored and previewed as a disabled placeholder description, but is explicitly non-renderable for future public output in Phase 1.

## Server architecture

The feature lives under `src/features/homepage-builder/` and has explicit boundaries:

- `homepage-builder.types.ts`: persistence, form, registry, reference, and preview contracts.
- `homepage-builder.model.ts`: permissions, scheduling, ordering, and domain invariants.
- `homepage-builder.dto.ts`: database-row to domain DTO mapping.
- `homepage-builder.registry.ts`: supported block definitions and defaults.
- `homepage-builder.validation.ts`: form and type-specific configuration validation.
- `homepage-builder.repository.ts`: Supabase reads/writes and ordering RPC calls only.
- `homepage-builder.operations.ts`: authorized create, update, delete, move, and toggle mutations.
- `homepage-builder.service.ts`: locale configuration provisioning, CMS view composition, and reference resolution.
- `homepage-builder.preview.ts`: ordered future-renderer payload composition.
- `homepage-builder.actions.ts`: Server Action mutation boundary and redirects/notices.

React components never instantiate or query Supabase. Repository code contains no permission or presentation policy. Operations contain mutation rules. The service assembles CMS data from repositories and validates story, category, and Live TV references against the selected locale.

## Reference validation

Validation is fail-closed:

- Story IDs must exist and belong to the selected language.
- Category IDs must exist and belong to the selected language.
- Live TV blocks require a localized Live TV configuration.
- Unknown types and invalid JSON configurations are rejected.
- Duplicate positions are rejected by both domain validation and the database constraint.
- Invalid schedules are rejected in the application and database.

Missing references are returned as actionable CMS validation errors. No broken reference is silently removed or replaced.

## Preview model

The preview composer receives section DTOs plus resolved story, category, and Live TV references. It returns a locale-scoped payload ordered by position and grouped only through persisted container metadata. Each item contains stable block identity, type, renderer, title, layout metadata, schedule eligibility, and validated resolved configuration.

Disabled sections and sections before `starts_at` or at/after `ends_at` remain in CMS data but are excluded from the renderer payload. The preview model performs no Supabase access and no React rendering. Its output contract is intended to become the input to a future homepage renderer without modifying the Phase 1 schema.

## CMS

`/admin/homepage-builder` is an English Phase 1 admin route using the existing admin shell and design system. It provides:

- EN/HI/MR locale selection.
- An ordered section list with status and schedule badges.
- Create and edit forms driven by the block registry.
- Delete, move up, move down, enable, and disable controls.
- Persisted container and width selectors.
- A structured preview-data panel, not a rendered or live homepage.

Editors and administrators receive all mutation controls. Writers can open the route and inspect configuration and preview data, but mutation controls are absent and Server Actions independently deny their writes.

Actions are named `createHomepageSection`, `updateHomepageSection`, `deleteHomepageSection`, `moveSectionUp`, `moveSectionDown`, and `toggleSection`. All actions authenticate, validate input, invoke operations, and revalidate only `/admin/homepage-builder`. They do not revalidate or modify public locale routes.

## Error handling

Expected authorization, validation, missing-reference, missing-configuration, and ordering errors use stable domain error codes and actionable editor messages. Unexpected repository failures are converted at the Server Action boundary to a non-sensitive persistence message. Redirects occur only after successful mutations.

## Testing

Tests cover:

- Migration tables, columns, constraints, indexes, functions, grants, and RLS.
- DTO mappings and model invariants.
- Every registry entry, renderer, default configuration, and configuration schema.
- Duplicate positions, schedules, locale isolation, and inactive filtering.
- Story, category, and Live TV reference validation.
- Repository query/write/RPC contracts.
- Editor/admin mutation permissions and writer read-only behavior.
- Atomic movement and deletion-compaction contracts.
- Preview payload ordering and resolved data.
- Server Action authentication and mutation delegation.
- Admin route and design-system contracts.
- A regression contract proving the existing localized homepage imports no Homepage Builder module.

The final verification suite is `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check`.
