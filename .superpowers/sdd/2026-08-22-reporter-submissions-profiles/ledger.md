# SDD ledger — plan: /Users/nataliaopenclaw/projects/INBCN/.worktrees/reporter-portal/docs/superpowers/plans/2026-08-22-reporter-submissions-profiles.md

## Inherited rulings

- Ruling: Use bundled Node 24.19.0 for all verification. Cost if wrong: runtime/build drift from the repository-supported environment.
- Ruling: Docker/Postgres is unavailable; do not claim local migration apply/type generation. Require strong per-owner SQL contracts and manual type parity. Cost if wrong: PostgreSQL syntax/runtime issues may surface only in the target test project.
- Ruling: KYC, SMS, and CAPTCHA vendor adapters remain disabled until approved credentials/providers exist; never simulate success. Cost if wrong: onboarding activation remains blocked until client decisions are supplied.
- Ruling: Supabase cannot revoke sessions by user ID; suspension uses generation-fenced DB/RLS/app_metadata denial without auth.sessions writes, bans, or user deletion. Cost if wrong: literal refresh-session deletion is not provided, though reporter access remains fail-closed.
- Ruling: Existing canonical `story_status` has no `changes_requested` or `withdrawn`; map those transitions to canonical `draft` and `rejected` while preserving exact semantic outcome/reason in immutable revision, audit, notification, and RPC/editor DTO state. Cost if wrong: later UI/workflows could conflate reporter withdrawal with editorial rejection or ordinary drafts with requested changes.
- Ruling: Task 1 lacks an atomic draft/media persistence interface; Task 2 may add one narrow service-only `save_reporter_story_draft` RPC in an additive migration, owning draft fields and canonical media associations together. Do not grant reporters direct story-media writes. Cost if wrong: this adds an unplanned RPC/migration surface, but avoids unvalidated or non-atomic media attachment.
- Ruling: Canonical stories lacked the plan-required event time; Task 2 must add nullable legacy-compatible `event_occurred_at`, persist it in draft/revision evidence, and require it for reporter submit/direct publish rather than validate-and-discard. Cost if wrong: adds a canonical column and RPC override surface, but preserves required editorial evidence.

## Preflight task scan

| Task | Dependencies / shared interfaces | Ruling before dispatch | Cost if wrong |
|---|---|---|---|
| 1. Revision/location schema | Consumes foundation reporter membership/auth, canonical stories/media, audit; produces tables/RPCs/types for Tasks 2–6. | Coordinates live only in private `story_locations`; immutable snapshots own submitted fields/media; retention is one year after terminal editorial outcome unless legal hold. | Private-location leak, silent published edits, or unsafe state transitions. |
| 2. Story service/actions | Consumes Task 1 RPCs and foundation active/grace/trust rules; produces server editor data/actions for Tasks 3–5. | Authenticated actions validate; direct publication only with active membership and effective grant; grace always reviewed; drafts do not transition. | Unauthorized publication or lost revision history. |
| 3. Signed media uploads | Consumes story ownership/membership and canonical `media`; feeds Tasks 4–6. | Server owns Cloudinary path/signature; completion re-verifies provider result/idempotency before canonical media insert. | Forged media ownership/path or duplicate/untrusted assets. |
| 4. Mobile editor | Consumes Tasks 2–3; produces local recovery/geolocation UI. | Local-only drafts, explicit fresh location capture immediately before submit, no offline sync. | Stale/missing evidence or draft loss. |
| 5. CMS review/trust | Consumes Tasks 1–4 and existing story workflow; produces review decisions/trust controls and notifications for Task 6. | Editors review/publish; admins alone change trust/suspension; private coordinates never leave staff views/audit. | Privilege escalation, public location leak, or revision overwrite. |
| 6. Public bylines/profiles | Consumes safe public reporter projection and published reporter stories. | Website joins only safe view; historical attribution remains while status changes; JSON-LD Person only for reporter stories. | PII/location leakage or broken attribution. |

## Shared-interface scan

| Producer → consumer | Surface | Ruling | Cost if wrong |
|---|---|---|---|
| Task 1 → Tasks 2/5 | `story_revisions`, `story_locations`, submission/review RPCs/types | Migration is source of truth; functions own locks, status, revision numbering, location freshness, audit. | App/DB divergence and race conditions. |
| Task 2 → Tasks 3/4/5 | reporter story ownership/editor DTO/actions | Reuse one server validation model; no client-only authority. | Upload/editor/review disagree on valid state. |
| Task 3 → Tasks 2/4/5/6 | canonical media IDs and ownership | Only completed verified owned media can enter snapshots/public stories. | Orphaned/forged/unpublished media exposure. |
| Task 4 → Task 2 | local draft/location payload | Browser capture is untrusted input; server+DB revalidate <=30-minute freshness/ranges/accuracy. | Fabricated or stale evidence. |
| Task 5 → Task 6 | canonical publication/public revalidation/trust state | Preserve immutable submitted revision; canonical published story is editor-controlled. | Silent reporter edits or stale public content. |
| Foundation → all tasks | active/access-sync generation, membership/grace, direct flag | Every mutation and RLS path rechecks current DB state; old JWT generation denied. | Suspended/expired reporter writes. |

## Environment/conflict scan

- Migration `20260822150000_reporter_submissions.sql` follows implemented hardening `20260822140000` and no longer collides.
- Direct authenticated application/consent DML is already closed; submission draft DML must be narrowly scoped and cannot transition/snapshot without RPC.
- Existing website/CMS story and media patterns must be reused; no second media or public coordinate store.
- Exact coordinates, accuracy, capture time, review notes, and unpublished media are forbidden from anonymous/public DTOs and generic audit metadata.

## Task status

| Task | Base | Head | Implementer report | Review | Status |
|---|---|---|---|---|---|
| 1 | `857432b` | `b3e3965` | `.superpowers/sdd/2026-08-22-reporter-submissions-profiles/task-1-implementer-report.md` | approved after 3 fix rounds; no open findings | complete; Docker validation deferred |
| 2 | `b3e3965` | `cfb90c6` | `.superpowers/sdd/2026-08-22-reporter-submissions-profiles/task-2-implementer-report.md` | approved after 1 fix round; all four findings closed | complete; Docker validation deferred and local native build bindings unavailable |
| 3 | `cfb90c6` | `5d5c56e` | `.superpowers/sdd/2026-08-22-reporter-submissions-profiles/task-3-implementer-report.md` | approved after 2 fix rounds; all findings closed | complete; Docker validation deferred and local build native bindings intermittent |
| 4 | `5d5c56e` | `d7b4b0e` | `.superpowers/sdd/2026-08-22-reporter-submissions-profiles/task-4-implementer-report.md` | approved after 5 fix rounds; all findings closed | complete; reviewer production build passed |
| 5 | `d7b4b0e` | `2b558c1` | `.superpowers/sdd/2026-08-22-reporter-submissions-profiles/task-5-implementer-report.md` | approved after 1 fix round; bulk finding closed | complete; Docker validation deferred |
| 6 | `2b558c1` | `def2c56` | `.superpowers/sdd/2026-08-22-reporter-submissions-profiles/task-6-implementer-report.md` | approved after 3 fix rounds; public story/media identity findings closed | complete; Docker validation deferred |
