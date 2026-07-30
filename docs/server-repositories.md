# Server repository layer

The news repository layer lives in `src/features/news/server`. It is the only
application-facing location that issues Supabase queries for Phase 1 news data.
The modules import `server-only` and use the existing Supabase SSR server
client, so they are suitable for Server Components, Route Handlers, and Server
Actions but cannot be bundled into Client Components.

## Responsibilities

- `stories.repository.ts` reads published stories and provides locale-aware
  story, language, and category lookups.
- `categories.repository.ts` reads enabled localized categories.
- `languages.repository.ts` resolves enabled platform languages.
- `sources.repository.ts` reads active source metadata.
- `index.ts` is the public server-side entry point.

Missing single records return `null`, and missing collections return an empty
array. Story collection queries currently use a conservative internal limit;
pagination, filtering, search, and caching can be added at this boundary
without changing consumers.

## DTO boundary

`dto.ts` defines stable, read-only application shapes. Repository mappers
convert selected snake_case database fields to camelCase DTO properties.
Supabase response objects and raw database rows never leave the repository
layer.

## Error handling

All query failures are converted by `errors.ts` into `RepositoryError`.
The error exposes a stable application code and a meaningful operation, but it
does not retain or expose PostgREST error details. A missing row is not treated
as a query failure.

## Database types

`src/lib/supabase/database.types.ts` follows the structure produced by the
official Supabase TypeScript generator and currently contains the focused
read-only schema needed by these repositories. Shared aliases live in
`src/lib/supabase/types.ts`.

When a Supabase project is linked, replace `database.types.ts` with output from
`supabase gen types typescript`; repository and DTO imports do not need to
change. The focused file should not be expanded manually as the schema grows.
