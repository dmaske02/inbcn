# INBCN M10 Editorial Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete and harden INBCN's existing editorial review, publishing, and scheduling workflow without replacing its current Story lifecycle or scheduler.

**Architecture:** Keep the existing `story_status` enum and lifecycle timestamps. Move security-critical transitions into atomic Supabase RPCs with optimistic concurrency and an append-only event ledger, enforce one public-eligibility invariant in RLS and reads, and extend the existing authenticated Vercel cron coordinator to publish due Stories idempotently.

**Tech Stack:** Next.js 16 App Router, React Server Components and Server Actions, TypeScript, Supabase/PostgreSQL/RLS/RPC, node:test contract/model tests, npm workspaces, Vercel Cron.

---

## Scope decisions before implementation

- [ ] Confirm publication SLA: retain 30-minute cron or choose a smaller supported Vercel Cron interval.
- [ ] Confirm rejected-story recovery semantics and whether writers regain edit access.
- [ ] Confirm whether unpublish is required and its target state (`approved` recommended).
- [ ] Confirm whether admin direct publish/schedule shortcuts remain supported.
- [ ] Confirm whether the minimum `story_events` ledger is sufficient or full content revisions are required.

Do not start schema implementation until these choices are recorded in the audit/spec.

## File map

**Create:**

- `supabase/migrations/20260814090000_editorial_workflow_hardening.sql` — public invariant, event ledger, indexes, transition and due-publication RPCs.
- `supabase/verification/editorial-workflow-verification.sql` — read-only/transaction-rollback verification of constraints, policies, grants, RPC results, and idempotency.
- `cms/src/features/admin/stories/story.repository.contract.test.mjs` — repository conflict/RPC contract.
- `cms/src/features/admin/stories/story.actions.contract.test.mjs` — authorization, validation, and post-success revalidation contract.
- `cms/src/features/admin/imports/story-publication.scheduler.test.mjs` — due publication orchestration and revalidation behavior.

**Modify:**

- `packages/database/src/database.types.ts` — regenerated database types.
- `cms/src/features/admin/stories/story.model.ts` — finalized commands and role matrix.
- `cms/src/features/admin/stories/story.workflow.ts` — input normalization only; database owns transition semantics.
- `cms/src/features/admin/stories/story.service.ts` — invoke atomic repository operations and map conflict/error results.
- `cms/src/features/admin/stories/story.actions.ts` — pass expected version, expose new commands, revalidate only after success.
- `cms/src/features/admin/stories/story-editor.tsx` and `story-list.tsx` — review, send-back, cancel/reschedule, conflict UI.
- `cms/src/features/news/server/stories.repository.ts` — typed RPC calls and canonical CMS/public reads.
- `cms/src/features/admin/imports/scheduler.repository.ts` and `scheduler.service.ts` — due-publication batch adapter.
- `cms/src/app/api/cron/auto-import/route.ts` — coordinate publication and imports under one authorized cron request.
- `cms/src/features/alerts/breaking-alerts.repository.ts` — full eligible-Story references.
- `website/src/features/news/server/stories.repository.ts` and `stories.search-query.mjs` — canonical eligibility parity.
- `website/src/features/alerts/breaking-alerts.repository.ts` — prevent links to ineligible Stories.
- Relevant adjacent tests already present for Story, scheduler, public news, alerts, Homepage Builder, and revalidation.

## Milestone M10.1 — Lifecycle foundation

### Task 1: Add failing database verification for the canonical invariant

- [ ] Add transaction-scoped fixtures to `supabase/verification/editorial-workflow-verification.sql` covering draft, scheduled, future-dated published, due published, and archived Stories.
- [ ] Assert anon visibility only for due published rows and public media only when its Story is eligible.
- [ ] Assert authenticated writers retain own-draft reads while editors/admins retain all-story reads.
- [ ] Run the verification against an isolated local Supabase database; expect failure because current RLS admits future-dated `published` rows.

### Task 2: Add the public eligibility function and RLS policies

- [ ] In `20260814090000_editorial_workflow_hardening.sql`, create a stable predicate equivalent to `status = 'published' AND published_at IS NOT NULL AND published_at <= now()`.
- [ ] Replace only the public Story and public-media select policies; retain writer/editor/admin policies.
- [ ] Pin function `search_path`, use explicit schema qualification, and preserve minimum grants.
- [ ] Run the verification and expect all visibility assertions to pass.

### Task 3: Add failing transition and concurrency verification

- [ ] Add cases for valid submit/approve/publish/schedule/archive edges and the product-approved send-back/cancel/reschedule/unpublish edges.
- [ ] Add invalid jumps, missing rejection reason, past schedule, stale `expected_updated_at`, non-owner writer, unauthorized role, and archived Story cases.
- [ ] Add simultaneous/serial duplicate publish assertions proving the second call cannot rewrite `published_at`.
- [ ] Run the verification; expect failure because `transition_story` does not exist.

### Task 4: Implement the Story event ledger and atomic transition RPC

- [ ] Create `story_events` with `id`, `story_id`, nullable `actor_id`, `command`, `from_status`, `to_status`, JSON metadata, and `created_at`; index `(story_id, created_at desc)`.
- [ ] Enable RLS. Allow editor/admin reads and writer reads for owned Stories; allow inserts only through the definer RPC/service role.
- [ ] Implement `transition_story(story_id, command, expected_updated_at, scheduled_at, rejection_reason, now)` to lock one row, verify JWT role and ownership, validate the edge, update timestamps, append one event, and return the updated row/version.
- [ ] Revoke public/anon execute, grant authenticated execute, pin `search_path`, and never trust a caller-supplied actor ID.
- [ ] Run migration verification and expect valid edges to pass and invalid/stale/unauthorized calls to fail without row changes.

### Task 5: Adopt typed atomic transitions in the CMS repository/service

- [ ] Add a failing repository contract test requiring `rpc('transition_story', ...)` and forbidding unconditional status updates.
- [ ] Add service tests for conflict mapping, invalid transition mapping, role/ownership behavior, and unchanged records after failure.
- [ ] Regenerate `packages/database/src/database.types.ts` from the migrated local schema.
- [ ] Replace transition persistence in `cms/src/features/news/server/stories.repository.ts` with the typed RPC.
- [ ] Simplify `story.workflow.ts` to normalize schedule/rejection inputs; keep command availability in `story.model.ts` as UX guidance, not the database security boundary.
- [ ] Run Story model, workflow, service, and repository tests; expect all to pass.

### Task 6: Add stale-editor protection to ordinary saves

- [ ] Add failing tests where two editors load the same `updated_at` and the second save receives a conflict.
- [ ] Add `expectedUpdatedAt` to the editor form/action/service contract.
- [ ] Make the repository update filter by both `id` and `updated_at`, returning null/conflict when no row matches.
- [ ] Render a non-destructive conflict message instructing the editor to reload and reconcile.
- [ ] Run Story editor/service/action tests and expect all to pass.

## Milestone M10.2 — Editorial review queue

### Task 7: Finalize the server-side permission matrix

- [ ] Add table-driven tests for every command across writer/editor/admin, status, ownership, and external/staff Story type.
- [ ] Update `getAllowedStoryCommands` to exactly mirror the approved product decisions while leaving RPC authorization authoritative.
- [ ] Verify direct Server Action invocation cannot bypass service/RPC rules.
- [ ] Run authorization, Story model, and Story service suites.

### Task 8: Add review/send-back queue behavior

- [ ] Add failing list/service tests for pending-review and rejected/sent-back filters, stable pagination, and role-specific commands.
- [ ] Reuse `cms/src/app/admin/(protected)/stories/page.tsx` and `story-list.tsx`; add explicit review filter links/counts rather than a parallel review data model.
- [ ] Add the approved send-back command and required reason to editor/action/service UI.
- [ ] Verify writers can edit only Stories explicitly returned to their editable state and cannot alter review metadata.
- [ ] Run Story list/editor/action tests.

## Milestone M10.3 — Publishing

### Task 9: Harden publish-now end to end

- [ ] Add tests for approved publish, direct admin publish if retained, already-published idempotency, archived rejection, and stale-version conflict.
- [ ] Route publish-now exclusively through `transition_story`.
- [ ] Revalidate `/admin/stories` and the website `stories` event only after a successful state change.
- [ ] Ensure revalidation failure is logged/returned distinctly from transition failure without retrying the transition.
- [ ] Run Story action, public-revalidation, and website revalidation route tests.

### Task 10: Align all public Story paths with the invariant

- [ ] Add data-driven tests for detail, category, search, homepage, latest, trending, opinion, Hero Story, Hero Sidebar, and breaking collections using draft/scheduled/future-published/due-published/archived fixtures.
- [ ] Update both website and CMS public Story repositories/search builders to use the exact invariant until a shared database read abstraction is introduced.
- [ ] Keep locale/category active checks and Homepage Builder fallback behavior unchanged.
- [ ] Add EN/HI/MR route contract cases.
- [ ] Run website news, Homepage Builder, and renderer tests.

### Task 11: Prevent alert links to ineligible Stories

- [ ] Add failing repository/service tests for a future-published, scheduled, archived, and due-published linked Story.
- [ ] Apply the full invariant to CMS alert reference and validation queries.
- [ ] Ensure the website alert join cannot expose a slug for an ineligible Story; rely on hardened RLS as defense in depth.
- [ ] Preserve alert start/end expiration semantics and alert-only revalidation.
- [ ] Run CMS and website alert suites.

## Milestone M10.4 — Story scheduling

### Task 12: Add cancel and reschedule operations

- [ ] Add transition tests for approved -> scheduled, scheduled -> scheduled with a new future time, and scheduled -> approved cancellation.
- [ ] Add past/equal-now rejection and stale-version conflict cases.
- [ ] Add editor controls and Action parsing while keeping timezone normalization explicit and tested.
- [ ] Run Story workflow/model/service/editor tests.

### Task 13: Add atomic due-publication RPC

- [ ] Add verification cases for zero due rows, one due row, multiple deterministic batches, a future row, an archived row, two concurrent workers, and retry after partial caller failure.
- [ ] Add the partial `(scheduled_at, id) WHERE status = 'scheduled'` index.
- [ ] Implement `publish_due_stories(p_now, p_limit)` with `FOR UPDATE SKIP LOCKED`, conditional scheduled/due selection, one update/event per Story, and returned IDs/locales.
- [ ] Grant execute only to service role and pin `search_path`.
- [ ] Run SQL verification twice; the second call must publish zero already-processed rows.

### Task 14: Extend the existing scheduler coordinator

- [ ] Add failing scheduler tests proving due publication runs from the existing authorized cron, is isolated from import failure, and does not create a second cron mechanism.
- [ ] Add a repository adapter calling `publish_due_stories` through the existing admin client.
- [ ] Invoke due publication in the current cron coordinator, then run the existing import scheduler according to its enabled/due settings.
- [ ] Return separate publication/import outcomes and log failures with batch context.
- [ ] Keep existing bearer-secret authorization and Node.js runtime.
- [ ] Run scheduler model/service/route contract tests.

### Task 15: Revalidate after scheduled publication

- [ ] Add tests: non-empty successful publication sends one `stories` event; empty batch sends none; RPC failure sends none; revalidation failure does not republish on retry.
- [ ] Call `revalidatePublicNews()` only after the RPC returns at least one published Story.
- [ ] Preserve the existing website locale-layout mapping so EN/HI/MR home, Story, category, search, and composed sections refresh.
- [ ] Run CMS revalidation and website route tests.

## Milestone M10.5 — End-to-end newsroom QA

### Task 16: Add import non-publication regression coverage

- [ ] Add manual and scheduled RSS/NewsData tests asserting imported rows are external drafts with null INBCN schedule/publication timestamps.
- [ ] Assert `external_published_at` remains provider metadata only.
- [ ] Run all import operation, repository, scheduler, and duplicate-detection tests.

### Task 17: Add concurrency and race verification

- [ ] Exercise stale edit, simultaneous publish, publish-vs-archive, schedule-vs-publish, and two due-publisher workers against local Supabase.
- [ ] Assert exactly one allowed transition/event wins and the loser receives conflict/invalid-transition without overwriting fields.
- [ ] Verify database locks are released before cross-app network revalidation.
- [ ] Run SQL verification and CMS integration tests.

### Task 18: Run final safe quality gates

- [ ] Run `npm test` and expect zero failures.
- [ ] Run `npm run typecheck` and expect exit code 0.
- [ ] Run `npm run lint` and expect exit code 0.
- [ ] Run `npm run build` and expect both workspaces to build successfully.
- [ ] Run the migration verification against an isolated local database and roll back fixtures.
- [ ] Run `git diff --check` and expect no whitespace errors.
- [ ] Review the audit's test matrix line by line and record evidence for EN/HI/MR, public paths, permissions, cache, import safety, and concurrency.

## Security requirements

- The database, not command visibility, is the final transition boundary.
- Definer functions must pin `search_path`, schema-qualify objects, derive actor/role from auth context, validate active profile parity where needed, and have minimum execute grants.
- Service-role due publication must be callable only from the authenticated server cron path.
- RLS must never make future, scheduled, draft, rejected, approved, or archived content public.
- Error responses must not expose database details or secrets.

## Cache and failure rules

- Revalidate only after committed state changes.
- Batch scheduled publication emits at most one website Story event.
- Empty and failed batches do not invalidate.
- A revalidation transport failure is observable and retryable but must not make the publication mutation non-idempotent.
- Existing locale-layout invalidation is retained for correctness; narrower tags are a later optimization.

## Non-goals

- No second scheduler/queue, new Story status system, auto-published imports, Homepage Builder redesign, draft preview, Media Library redesign, assignment/comments system, or dependency change.
- No production implementation is part of the M10.1 audit deliverable itself.
