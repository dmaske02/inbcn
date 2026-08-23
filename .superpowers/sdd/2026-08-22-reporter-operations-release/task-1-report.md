# Task 1 implementer report

Status: `DONE_WITH_EXTERNAL_GATES`

## Outcome

Implemented one bounded daily reporter lifecycle runner and the additive
`20260822166000_reporter_lifecycle.sql` database boundary. The Vercel cron runs
at 02:15 UTC, exposes only `GET /api/cron/reporter-lifecycle`, authenticates the
exact bearer value through fixed-length SHA-256 digests and
`timingSafeEqual`, disables caching, and returns aggregate counts only.

The database owns production time, due-state ordering, locks, transitions,
notifications, and audits. One service-role-only claim processes at most 25
rows in `(due_at, id, kind)` order per page; the service has a fixed ten-page
ceiling. It covers:

- incomplete-application reminders and the existing 30-day cancellation/refund
  transition;
- 30-day membership renewal reminders, active-to-grace and grace-to-expired
  transitions, with locked renewal rechecks and stored trust grants preserved;
- captured ₹100/INR application refund retries through the existing Razorpay
  request recorder and signed webhook finalization;
- due completed private/rejected live-recording object deletion; and
- due exact-coordinate deletion after final-story retention while preserving
  locality and receipt time.

Refund ambiguity retains the same database attempt, receipt, and idempotency
key. Exact refund objects, including a provider object already reporting
`failed`, are bound through the existing request-completion RPC and wait for the
signed webhook lifecycle to finalize them. Exact completion retries are
idempotent, and fixed safe failure retries do not duplicate audits.

Recording deletion uses the existing canonical key convention and shared
SigV4 helper, extended only with `DELETE`; no SDK or dependency was added. A
five-minute token lease is longer than the bounded provider page queue: at
most five work items run concurrently and each provider request has a
ten-second timeout. Only success or not-found clears the storage key. Ambiguous
failures retain the same key for retry, and deletion-in-progress/deleted guards
prevent concurrent publication or legal-hold state from claiming the object
still exists. A definite configuration failure proves no delete was sent, so a
later admin publication/hold atomically releases only that safe failed lease.

Exact location fields now support one constrained all-present or all-deleted
state with `exact_coordinates_deleted_at`. Reporter and CMS consumers tolerate
deleted exact evidence; the newsroom view still displays retained locality.

## Database and security boundary

The migration adds only lifecycle evidence columns, constraints, focused due
indexes, guards/triggers, and four new RPCs. It does not add a generic lifecycle
table. New RPC signatures are revoked from `PUBLIC`, `anon`, `authenticated`,
and `service_role`, then granted only to `service_role`; all security-definer
functions use an empty search path, fully qualified relations, database time,
row locks, and exact token/state/provider facts.

The migration also hardens the reused overdue and refund-request functions:
the overdue audit no longer stores an internal payment ID, and an exact
committed refund-request retry returns success without duplicating its audit.
Refund-confirmation notification creation is attached atomically to the
existing signed refund transition. All lifecycle messages are fixed in-app
copy. Generic audits contain no Razorpay ID, object/storage key, coordinate, or
private provider detail.

Manual database types, schema/RLS documentation, static SQL contracts, and the
rollback-only `reporter-lifecycle-verification.sql` were added. Current
Supabase changelog, function/RLS, and Data API security guidance were reviewed;
the implementation uses explicit function grants and `auth.jwt() ->> 'role'`
rather than relying on default exposure or deprecated role helpers.

## TDD record

Initial focused RED failed because the lifecycle model/service/route/migration
and Razorpay refund methods did not exist; the six pre-existing Razorpay tests
remained green. The plan's basename-only npm selector did not discover nested
test files, so RED and GREEN used the five exact paths.

Review micro-cycles were also RED before adding:

- nullable-coordinate consumer handling;
- separation of provider failures from post-provider persistence failures;
- signed-webhook-only refund finalization;
- call-time S3 signing and bounded Razorpay refund requests;
- safe overdue audit metadata;
- canonical recording-key completion checks and permanent publication fencing;
- failure-audit idempotence; and
- exact refund/recording completion retry behavior;
- mutually exclusive grace/expiry and final-state due selectors that cannot
  starve a bounded page;
- exact refund receipt-to-idempotency-key validation; and
- bounded parallel provider starts that keep page leases fresh.

Final focused lifecycle/model/service/route/SQL/Razorpay coverage passed 37/37.
The full reporter workspace passed 357 tests.

## Verification

Verification used Node `v22.22.0` and npm `10.9.4`.

- Focused lifecycle/model/service/route/SQL/Razorpay tests: passed (37/37).
- Full reporter tests: passed (357/357).
- Fresh root tests across website, CMS, and reporter: passed.
- Root typecheck across database, domain, website, CMS, and reporter: passed.
- Root lint across website, CMS, and reporter: passed without warnings.
- Reporter Next.js 16.3 production build: passed; the cron route was emitted as
  a dynamic route.
- `git diff --check`: passed.
- Static grant/search-path, forbidden-field, stable-order, lock-order,
  canonical-key, legal-hold/public-replay, lease-retry, manual-type, docs, and
  rollback-verifier contracts: passed.

The relevant installed Next.js 16.3 Route Handler, environment, data security,
and error-handling documentation was read before implementation. Current
official Razorpay idempotent-refund and per-payment refund-list contracts were
also rechecked during final review.

## External gates

Docker is installed, but the daemon is unavailable at
`/Users/nataliaopenclaw/.docker/run/docker.sock`. `docker info` and
`npx supabase status` both failed at that same daemon connection. No local
Postgres client or database URL is available. Therefore the migration and
rollback verifier were not executed against Postgres, and database types were
updated manually rather than regenerated. A disposable migrated Supabase
database still must run `supabase db reset`, generated-type diff, and
`supabase/verification/reporter-lifecycle-verification.sql`.

No Razorpay key/secret/webhook secret, LiveKit S3 access key/secret/bucket/
region, or cron secret is available in this environment. No live refund,
object deletion, signed webhook, or deployed Vercel Cron check is claimed.
Provider coverage uses deterministic fake responses, an AWS-derived fixed
SigV4 DELETE vector, timeout/error tests, and exact request contracts. Production
activation remains gated on configured secrets and the client/legal/provider
approvals already named in the operations plan.

## Ponytail full review

The implementation reuses the domain membership/deadline rules, existing
overdue/refund RPCs, reporter Razorpay adapter, signed webhook lifecycle,
canonical recording keys, notification/audit tables, and shared SigV4 helper.
It adds no dependency, AWS SDK, provider abstraction, generic lifecycle table,
SMS/push work, or Task 2+ scope. The remaining code exists to preserve the
explicit money, privacy, legal-hold, concurrency, and retry boundaries and was
not simplified away.

Commit subject: `feat(reporter): automate reporter lifecycle`
