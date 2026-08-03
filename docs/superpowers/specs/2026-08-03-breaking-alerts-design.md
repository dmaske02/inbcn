# Breaking News and Alert Management Design

**Goal:** Add independently managed breaking tickers, pinned alerts, and emergency banners to the existing CMS and public layout.

## Architecture

The additive `breaking_alerts` table is accessed only through `breaking-alerts.repository.ts`. `breaking-alerts.service.ts` owns authorization, validation, targeting, scheduling, commands, and view-model composition. Server actions call the service; public pages pass their language/category/story context into `PublicLayout`, which requests visible alerts and renders placement-specific components.

Active visibility is query-driven: `status = active`, `is_active`, `start_at <= now()`, and unexpired `end_at`. Emergency alerts sort before breaking alerts, then normal alerts; numeric priority resolves ties. No cleanup job, search indexing, sitemap entry, or metadata route is introduced.

## Data and security

The approved table uses constrained text fields for type, placement, status, and scope; foreign keys reuse languages, categories, stories, and profiles. Target constraints require category/story IDs only for matching scopes. Existing `set_updated_at()` trigger behavior is reused. Public RLS exposes only currently visible alerts. Editors can select, insert, and update; admins additionally delete. Existing policies are unchanged.

## CMS and public UI

`/admin/alerts` provides filters, pagination, status summaries, and commands. `/admin/alerts/new` and `/admin/alerts/[id]` share an editor form with preview. Public rendering remains inside the existing layout: emergency banner, breaking ticker, then pinned banner. Dismissal is browser-local and affects only dismissible alerts.

## Extension boundary

Lifecycle commands emit a typed notification event to a no-op dispatcher interface. Future push, email, and SMS adapters can subscribe without changing alert persistence or UI actions.

## Testing

Pure model tests cover validation, ordering, schedules, expiry, language/category/story targeting, and presentation. Repository query construction and service operations use injected dependencies for boundary tests. Migration policy tests verify additive RLS and constraints. Full project tests, typecheck, lint, build, and diff checks remain required.
