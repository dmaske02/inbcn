# INBCN M10 Editorial Workflow Architecture Audit

**Date:** 2026-08-14

**Repository state audited:** `editorial-workflow` at `2b96c688cb5eee56fe6038fc71bf572ed716d0cf`

**Scope:** Audit and design only; no production implementation, migration application, dependency, environment, commit, or push.

## 1. Executive summary

INBCN already contains most of the target editorial lifecycle. The database enum and CMS domain implement `draft -> pending_review -> approved -> published`, scheduling metadata and a `scheduled` state, rejection, and archive. Writers can create and submit their own drafts; editors can review, approve, reject, publish, schedule, and archive; administrators have broad controls. RSS and NewsData imports explicitly create non-public external-article drafts.

M10 should therefore harden and complete the existing architecture, not replace it. The confirmed gaps are: scheduled stories are never automatically published; Story transitions are read-then-write mutations without optimistic concurrency or an atomic transition RPC; cancel/reschedule/unpublish/send-back operations are missing; the public RLS policy is weaker than application queries; alerts validate a linked Story's status but not its due publication time; there is no Story revision/audit log; and scheduled/background publication has no cross-app revalidation path.

The smallest safe design is one additive migration that introduces a canonical public-eligibility function, atomic Story transition/publish-due RPCs, supporting indexes, and a Story event ledger; a small extension to the existing Vercel cron entry point and lock/claim pattern; and focused CMS UI changes. No second scheduler and no replacement Story model are warranted.

## 2. Current architecture

- The repository is an npm-workspace monorepo with separate `cms/` and `website/` Next.js 16 App Router applications plus shared database/domain packages.
- CMS mutations use Server Actions, authenticated Supabase server clients, services, repositories, and database RLS.
- Public reads use the website's anonymous Supabase client and explicit repository predicates.
- Cross-app invalidation is event based: CMS posts a signed event to `website/src/app/api/revalidate/route.ts`, which calls `revalidatePath` for locale layouts.
- Automated ingestion uses a Vercel Cron route every 30 minutes, a database claim RPC, an `ingest_runs` ledger, lock expiry, per-source retry, and duplicate-safe inserts.

Installed Next.js 16 documentation confirms that Server Actions are appropriate for mutations, Route Handlers for cron/webhook-style HTTP entry points, `revalidatePath` invalidates path/layout cache entries, and revalidation should happen only after successful mutation. React `cache()` is request memoization, not a durable scheduler or cross-request publication mechanism.

## 3. Story lifecycle findings

The original schema already defines `story_status` as `draft`, `pending_review`, `approved`, `scheduled`, `published`, `rejected`, and `archived`. `stories` already has `submitted_at`, `approved_by`, `approved_at`, `rejected_at`, `rejection_reason`, `scheduled_at`, and `published_at`.

`story.workflow.ts` builds transition patches and `story.model.ts` determines role/status commands. `story.service.ts` enforces the command set server-side before repository mutation. This is a real lifecycle foundation, not merely UI decoration.

Important limitations:

- Transitions are centralized in TypeScript but persisted as unrestricted row updates allowed by broad editor/admin RLS.
- Admins may jump directly from draft or review to publish/schedule; the helper synthesizes approval timestamps.
- Rejected stories have no writer/editor recovery path. There is no explicit “send back to draft” operation.
- There is no cancel schedule, reschedule, or unpublish command.
- `archived` is represented by status only; there is no `archived_at`. That timestamp is not required for correctness but would be useful in the event ledger.
- There is no terminal-state rule at the database layer beyond column checks; an editor's broad update policy can form states not offered by the UI.

## 4. Publishing findings

Publishing currently means a service-generated update setting `status = 'published'`, `published_at = now`, `scheduled_at = null`, and—when necessary—approval fields. It is a field mutation, not an atomic database domain operation.

Current public visibility is determined in application repositories by all three predicates:

1. `status = 'published'`
2. `published_at is not null`
3. `published_at <= now()`

The database public Story RLS policy checks only `status = 'published'`. Schema checks guarantee a published row has a non-null timestamp, but do not guarantee the timestamp has arrived. A malformed/future-dated published row is therefore readable through the anonymous API even though normal website queries hide it.

There is no separate visibility/private column. Status plus publication time are the legacy and current public/private mechanism.

## 5. Scheduling findings

The schema, editor form, command model, service, and tests already support choosing a future `scheduled_at` and moving a Story into `scheduled`. Scheduled publication itself does not exist: no service, RPC, cron job, or trigger finds due rows and changes them to published.

The existing schedule operation is not concurrency safe. Two editors can schedule/publish/archive based on the same previously read status, and the later unconditional update wins.

## 6. Scheduler findings

The current scheduler entry point is `cms/src/app/api/cron/auto-import/route.ts`, invoked by `cms/vercel.json` on `*/30 * * * *`. It uses the Node.js runtime, bearer-secret authorization, a five-minute route duration, and the ingestion scheduler service.

Persistence is the `ingest_runs` table. `claim_auto_import_batch` serializes claims with a transaction-scoped advisory lock and records lock expiry in metadata. The queue is in memory after the database claim. Sources are ordered deterministically, retried a configured number of times, and bounded by per-source timeouts. Duplicate Story insertion is protected by unique constraints and maps SQLSTATE `23505` to a duplicate outcome. Manual import exists; scheduler enable/disable is recorded in the same ledger.

This is reusable infrastructure, but it is import-specific rather than a generic job queue. Scheduled publication should use option C: a small extension. Add an atomic `publish_due_stories` RPC and invoke it from the existing authorized cron route (or a renamed shared cron coordinator in the same Vercel cron), preserving one scheduler trigger. A 30-minute cadence means publication may be up to roughly 30 minutes late; product must confirm whether that SLA is acceptable before implementation.

## 7. Import pipeline findings

Both RSS and NewsData flow through a shared external-import operation:

`fetch -> normalize/parse -> resolve category/language -> deduplicate -> insert Story draft -> record ingest result`.

Imported Stories are `external_article`, `status = 'draft'`, with all review, scheduling, and publication timestamps null and all featured/breaking/sponsored flags false. Provider publication time is retained separately as `external_published_at`; it does not make the INBCN Story public. Source ID, external ID/URL/author/image metadata, and tags are retained.

Deduplication uses provider ID, normalized URL, title/source fingerprint, language+slug uniqueness, and a database unique-violation fallback for concurrent inserts. Individual failures produce partial runs; batch-level failures complete the ingest ledger as failed. Imports never auto-publish.

## 8. Public visibility findings

The website's central Story repository consistently applies the three-part publication predicate for:

- locale homepage collections (featured, breaking, latest, trending, opinion allocations)
- Story detail by locale and slug
- category featured/latest selection and paginated category lists
- search results
- Story-reader related collections

Locale is resolved through active `languages`; category queries additionally require the localized category. “Trending” is currently an allocation of recent published candidates rather than an independent engagement-ranked query. “Opinion” is category/content composition over published candidates.

The same repository is duplicated under `cms/src/features/news/server/`; both copies currently carry the invariant. M10 should avoid another copy by sharing a database function/view or a shared predicate-bearing repository abstraction where practical.

## 9. Homepage Builder findings

- The CMS Story picker only searches and resolves Stories satisfying the full publication predicate.
- The public renderer obtains references from `getHomepageData`, whose Story candidates already satisfy that predicate.
- A saved pinned Story that is no longer in the eligible candidate set cannot resolve into public output; fallback composition is used.
- The internal preview calls the persisted public preparation pipeline and therefore currently uses published-only references too. It does not intentionally expose drafts or scheduled Stories.
- Public and preview eligibility are currently effectively the same. M10 should preserve this unless product explicitly requests a draft-preview capability with authenticated, non-public data loading.

An unpublished Story cannot be selected through the supported picker and should not render publicly. Direct configuration tampering is bounded by reference resolution, but the canonical database invariant should still be applied to any Story lookup used by the renderer.

## 10. Breaking News / Alerts findings

Stories have an `is_breaking` flag used by homepage composition. Those Stories still pass through the full published predicate.

The separate `breaking_alerts` subsystem has draft/active/archived status, activation flag, priority, placement, scope, `start_at`, optional `end_at`, and optional category/Story links. Public queries enforce active status, activation, start/end window, and language. CMS Story references filter to `status = 'published'`, and Story-scope validation checks status and language.

The gap is that alert Story reference and validation queries do not also require non-null, due `published_at`. The public alert query joins only the Story slug, relying on Story RLS. Because Story RLS currently allows any `published` status regardless of future time, a future-dated malformed Story can leak a public slug through an alert. Expiration is query-time; no scheduler is required to hide expired alerts.

## 11. Permission matrix

This matrix describes effective current server-side behavior, not desired M10 behavior.

| Operation | Writer | Editor | Admin |
|---|---:|---:|---:|
| Create Story | Own staff draft | No manual create | Yes |
| Edit Draft | Own draft only | External draft only | Yes |
| Submit Review | Own draft | No | Yes |
| Approve | No | Pending review; external draft | Yes |
| Send Back | No | No | No explicit command |
| Publish | No | Approved or scheduled | Broad/direct |
| Schedule | No | Approved | Broad/direct |
| Reschedule | No | No explicit command | No explicit command |
| Cancel Schedule | No | No explicit command | No explicit command |
| Archive | No | Approved/scheduled/published | Broad |
| Unpublish | No | No | No explicit command |

Authorization path:

`UI command visibility -> authenticated Server Action -> Story service command authorization -> Supabase repository -> grants/RLS/check constraints`.

The service is the meaningful transition guard. RLS independently restricts writers but gives editors unrestricted Story updates and admins all operations; it does not encode the lifecycle. UI restrictions are therefore not the security boundary. Action and service both parse/validate portions of input, but the service revalidates form values and command authorization, which is necessary for direct Action invocation resistance.

## 12. Cache/revalidation findings

- Story create, update, transition, bulk transition, and manual import revalidate `/admin/stories` and send the website `stories` event only after success.
- The website maps `stories` to `revalidatePath('/[locale]', 'layout')`, invalidating locale layouts and descendants, including homepage, Story, category, and search routes.
- Alert mutations send `alerts`; Homepage Builder mutations send `homepage`; media retirement/restoration sends `media`.
- Basic media upload revalidates only the CMS Media Library because it is not yet referenced publicly.
- Failed mutations return/redirect before revalidation.
- Scheduled publication has no implementation and therefore no revalidation.
- Automated imports create only drafts, so public invalidation is unnecessary for correctness, although current manual-import flow sends a broad Story invalidation.

M10 background publication must send a single `stories` revalidation event after an atomic batch publishes one or more rows. No event should be sent for an empty/failed batch. The existing locale-layout invalidation covers EN/HI/MR and descendant routes, though focused tag/path invalidation could be a later optimization.

## 13. Concurrency findings

There is no Story optimistic concurrency. The editor receives `updated_at`, but save and transition repository updates filter only by `id`. Consequences include lost edits, stale transitions, and publish/archive/schedule races.

There are no Story row locks, idempotency keys, transition RPCs, revision records, or audit events. Simultaneous publish calls can overwrite timestamps; publish versus archive or schedule versus publish resolves by last write rather than declared semantics.

Reusable examples exist elsewhere: Homepage Builder conditionally updates on `updated_at`; Media lifecycle RPCs accept `expected_updated_at`; the ingestion scheduler uses an advisory-lock claim RPC; external imports use unique constraints and duplicate-safe insert behavior. M10 should reuse these patterns.

## 14. Database findings

### Direct questions

1. **What determines public visibility?** Application queries use published status plus a due, non-null `published_at`; database RLS only uses published status.
2. **What determines publication?** `status = 'published'` with required non-null `published_at`.
3. **Does a publication timestamp exist?** Yes, `stories.published_at`.
4. **Does scheduled publication exist?** Scheduling state/metadata exists; automatic due publication does not.
5. **Does editorial status exist?** Yes, the seven-value `story_status` enum.
6. **Are legacy fields serving these purposes?** Yes; the existing status and lifecycle timestamps are the intended fields and should be retained.
7. **What prevents invalid states?** Check constraints enforce approval for approved/scheduled/published/archived, schedule timestamp rules, publication timestamp rules, rejection details, and partial timestamp ordering. They do not encode allowed transition edges, public due-time RLS, or concurrency.

### Capability matrix

| Capability | Exists? | Location | Reusable? | M10 change |
|---|---|---|---|---|
| Story status | Yes | `story_status`, `stories.status` | Yes | Keep enum |
| Draft state | Yes | Schema, create/import services | Yes | No schema field |
| Review state | Yes | `pending_review`, timestamps, commands | Yes | Add queue UX/send-back |
| Approval | Yes | `approved`, `approved_by/at` | Yes | Move transitions into RPC |
| Publication | Yes | `published`, service patch | Yes | Atomic RPC/invariant |
| Published timestamp | Yes | `published_at` | Yes | Keep |
| Scheduling | Partial | `scheduled`, editor/service | Yes | Add due publisher/cancel/reschedule |
| Scheduled timestamp | Yes | `scheduled_at` | Yes | Add due index |
| Archive | Yes | `archived` | Yes | Event timestamp in ledger; no required column |
| Scheduler | Yes, import-specific | Cron route, claim RPC, ingest ledger | Yes | Extend existing coordinator |
| Review queue | Partial | Story list status filter | Yes | Dedicated filtered UX optional |
| Revision history | No | No table/code found | No | Add append-only Story event/revision ledger |
| Audit log | No Story log | Ingest and scheduler ledgers only | Pattern | Add Story event ledger |

All 19 migrations present under `supabase/migrations/` were searched/inspected before making missing-capability claims.

## 15. Existing infrastructure to reuse

- Existing enum, columns, constraints, Story editor/list, command model, service, and tests.
- Supabase RLS and authenticated server client path.
- `expected_updated_at` conflict pattern from Homepage Builder and Media lifecycle.
- Advisory-lock/claim pattern and existing Vercel cron trigger from ingestion.
- Cross-app signed revalidation event.
- Import deduplication and failure ledger patterns.
- Existing public Story repository and Homepage Builder fallback/reference resolution.

## 16. Confirmed gaps

1. No automatic scheduled publication.
2. No atomic, concurrency-checked Story transition operation.
3. Public Story/media RLS omits due-time checks.
4. Alert Story references omit due publication checks.
5. No cancel/reschedule/unpublish/send-back operation.
6. No Story revision/audit ledger.
7. Rejected Stories are a workflow dead end for writers/editors.
8. Scheduled publication has no revalidation or operational result reporting.
9. Editor RLS does not encode transition permissions.
10. No explicit scheduling SLA; current cron cadence is 30 minutes.

## 17. Risks

- Tightening Story RLS can affect CMS authenticated reads; policies must preserve editor/admin all-read and writer-own-read behavior.
- A transition RPC using `security definer` must verify the JWT role/actor internally, pin `search_path`, revoke public execute, and receive only controlled parameters.
- Reusing the import cron route couples publication availability to that deployment and cadence; failures must be isolated so import failure cannot roll back publication or vice versa.
- Cross-app revalidation failure after a successful database publish must be observable and retryable; the publication itself must remain idempotent.
- Bulk publication must not hold row locks while making network calls.
- Adding full content snapshots to an audit table has storage/privacy implications; an event ledger with before/after status and actor is the minimum.

## 18. Recommended M10 architecture

Establish one canonical predicate: a Story is publicly eligible only when `status = 'published'`, `published_at is not null`, and `published_at <= now()`. Locale/category validity remains enforced by foreign keys and active-language/category application queries; archived and scheduled rows fail the status condition.

Implement the predicate in a stable database function used by anonymous Story/media RLS and mirror it in all application reads until a database view/RPC safely centralizes them. Add an atomic `transition_story` RPC accepting Story ID, command, expected `updated_at`, actor context, optional schedule/rejection data, and the current time. It should lock the row, authorize role/ownership, validate the edge, update timestamps, append a Story event, and return a typed result/conflict.

Add an atomic `publish_due_stories` RPC that locks due scheduled rows with `FOR UPDATE SKIP LOCKED`, updates only `status = 'scheduled' AND scheduled_at <= now()`, sets publication timestamps deterministically, appends events, and returns published IDs/locales. Repeated/concurrent calls then become harmless. Invoke it from the existing cron coordinator and revalidate once after a non-empty batch.

Keep `rejected` but define “send back” as an explicit transition to editable draft (clearing rejection data only according to a documented rule). Add cancel schedule -> approved, reschedule scheduled -> scheduled, and unpublish published -> approved only if product accepts URL withdrawal semantics. Archive remains the final newsroom state; admin deletion remains a separate destructive operation.

## 19. Proposed milestones

### M10.1 — Lifecycle foundation hardening

- Canonical eligibility function and RLS.
- Atomic transition RPC, expected-version conflict, Story event ledger.
- Service/repository adoption and permission regression tests.
- No new UI beyond conflict/error support.

### M10.2 — Editorial review queue

- Reuse Story list filtering; add dedicated pending/rejected views and send-back command.
- Preserve existing editor/admin authorization.
- No parallel review entity unless newsroom requirements demand assignments/comments.

### M10.3 — Publishing

- Publish-now and optional unpublish through the atomic RPC.
- Align alerts and every public read with the canonical invariant.
- Revalidate website only after successful transitions.

### M10.4 — Story scheduling

- Cancel/reschedule commands.
- `publish_due_stories` RPC and existing-cron integration.
- Batch result logging, idempotency, retry, and one revalidation per non-empty batch.

### M10.5 — End-to-end newsroom QA

- EN/HI/MR lifecycle, permissions, imports, homepage, alerts, public reads, cache, and concurrency verification.
- Confirm scheduler cadence/SLA and production observability.

## 20. Exact files likely to change

Likely existing files:

- `packages/database/src/database.types.ts`
- `packages/domain/src/index.ts` only if shared transition/revalidation event types expand
- `cms/src/features/admin/stories/story.model.ts`
- `cms/src/features/admin/stories/story.workflow.ts`
- `cms/src/features/admin/stories/story.service.ts`
- `cms/src/features/admin/stories/story.actions.ts`
- `cms/src/features/admin/stories/story-editor.tsx`
- `cms/src/features/admin/stories/story-list.tsx`
- `cms/src/features/news/server/stories.repository.ts`
- `cms/src/features/alerts/breaking-alerts.repository.ts`
- `cms/src/features/admin/imports/scheduler.repository.ts`
- `cms/src/features/admin/imports/scheduler.service.ts`
- `cms/src/app/api/cron/auto-import/route.ts`
- `cms/src/features/admin/public-revalidation.ts`
- `website/src/features/news/server/stories.repository.ts`
- `website/src/features/news/server/stories.search-query.mjs`
- `website/src/features/alerts/breaking-alerts.repository.ts`
- `website/src/features/homepage-builder/homepage-builder.repository.ts` only if direct Story resolution is added
- `website/src/app/api/revalidate/route.ts` only if a more specific event is added
- Existing Story, scheduler, alerts, Homepage Builder, public repository, and revalidation tests adjacent to those files.

## 21. Exact migration likely required

One new additive migration is sufficient, proposed as:

`supabase/migrations/20260814090000_editorial_workflow_hardening.sql`

It should:

1. Create a canonical `is_story_public(stories)` or scalar equivalent.
2. Replace anonymous Story and public-media policies with the due publication invariant.
3. Create `story_events` with Story ID, actor ID/null scheduler actor, command, from/to status, metadata, and timestamp; enable RLS and grants.
4. Create `transition_story(...)` with row locking, JWT authorization, ownership/role rules, expected `updated_at`, transition validation, mutation, and event append.
5. Create `publish_due_stories(p_now, p_limit)` using `FOR UPDATE SKIP LOCKED`, deterministic ordering, conditional updates, and event append.
6. Add a partial index such as `(scheduled_at, id) WHERE status = 'scheduled'`.
7. Revoke RPC execute from public/anon; grant transition to authenticated and due publication to service role.
8. Preserve existing enum values and columns; do not add a second lifecycle or scheduler table.

Regenerate `packages/database/src/database.types.ts` after applying the migration in the later implementation phase.

## 22. Exact tests required

- Lifecycle model/RPC tests for every valid edge, invalid jump, rejected recovery, archive behavior, and expected-version conflict.
- Permission tests at UI, Action, service, RPC, and RLS boundaries for writer/editor/admin.
- Publish-now idempotency and archived/already-published rejection.
- Schedule future validation, past rejection, cancel, reschedule, due publication, retry, duplicate worker, and concurrent worker tests.
- Public Story detail/category/search/latest/trending/opinion/homepage/Hero/Hero Sidebar/Breaking tests for published, future-published, scheduled, draft, and archived rows in EN/HI/MR.
- Alert tests preventing a non-eligible linked Story from yielding a public link.
- Import tests retaining draft/null publication behavior under manual and scheduled ingestion.
- Stale editor, simultaneous publish, publish-vs-archive, and schedule-vs-publish tests.
- Revalidation tests proving success invalidates, failure/empty batches do not, and locale descendants are covered.
- Migration verification SQL for grants, RLS, transition authorization, due-batch idempotency, and index availability.

## 23. Explicit non-goals

- Replacing Supabase, Next.js App Router, Server Actions, or the existing Story schema.
- Building a second scheduler or external queue.
- Auto-publishing imported content.
- Changing Homepage Builder layout/editing or enabling draft preview.
- Adding assignments, comments, notifications, content diff storage, or multi-stage approvals without product requirements.
- Redesigning Media Library or Story presentation.
- Applying migrations, changing dependencies/environment, committing, or pushing during this audit.

## Unresolved questions

1. Is the existing 30-minute cron cadence an acceptable publication SLA, or must it be reduced?
2. Should “reject” be terminal, or should editors send a Story back to a writer-owned draft?
3. Is unpublish required, and if so should it return to `approved` or archive the Story?
4. Must writers edit a rejected/sent-back Story, and should editors be allowed to create staff articles manually?
5. Is a status-event ledger sufficient, or does compliance require immutable full-content revisions?
6. Should administrators retain direct draft-to-publish/schedule shortcuts?
