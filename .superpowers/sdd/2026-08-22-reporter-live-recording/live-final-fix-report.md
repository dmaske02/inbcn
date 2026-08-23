# Reporter live recording final-review fix

Date: 2026-08-23
Branch: `codex/reporter-portal`
Reviewed base: `8b8724c`

## Outcome

All six integrated final-review findings were fixed at their shared boundaries.

1. The editor-read policy is now created only by
   `20260822161000_reporter_live_editor_read.sql`. The duplicate statement was
   removed from the later review migration, and
   `supabase/verification/reporter-live-recording-verification.sql` provides a
   rollback-only chain check for the exact policy count, command/role, current
   text RPC identities, and absence of the obsolete UUID overloads.
2. LiveKit webhook event IDs are bounded provider text, including real
   `EV_...` values, across Zod validation, service calls, SQL function
   signatures, grants, callers, verification, and manual types. Event and
   Egress IDs require 1–255 ASCII letters, digits, `_`, or `-`; the existing
   text receipt column, lease/idempotency protocol, and immutable
   event-type/Egress binding remain unchanged. No raw webhook body is stored.
3. Non-completed Egress events ignore `fileResults` completely and persist no
   output facts, including real zero-valued placeholder `FileInfo` entries.
   Completed events require exactly one canonical `.mp4` result and validate
   that result's filename/location, positive bounded size and duration, and
   ordered non-future file timestamps. File timestamps may legitimately differ
   from the top-level Egress lifecycle timestamps. Only canonical key,
   duration, bytes, file-owned timestamps used by the DB validation contract,
   and fixed failure codes cross the repository boundary.
4. Stale start recovery now lists the room's active and historical Egresses by
   omitting the `active` filter, derives identity only from the exact provider
   request (never `fileResults`), and accepts one exact room/single-MP4/output
   match. Active/starting/ending matches bind through the existing CAS.
   Completed or failed matches bind only to the pending claim through the new
   service-role reconciliation RPC, create one fixed redacted operator alert,
   retain the pending claim, return a safe retryable error, issue no publisher
   token, and never start a replacement Egress. Multiple, conflicting,
   malformed, or unknown matches fail closed; an empty room history is the only
   reclaimed no-match case that may start once. Request-before-recording lock
   order and the final authorization check remain intact.
5. `LIVEKIT_S3_FORCE_PATH_STYLE=false` is inert in both CMS and reporter
   schemas. `true`, an endpoint/region, or any real storage field activates the
   existing all-or-none validation. Focused child-process regressions cover
   inert, partial, and complete configurations.
6. The Route Handler exports only `dynamic` and `POST`; its test seam moved to
   the feature layer. Both the API route and normal CMS form call the existing
   shared DB-first termination service directly, with no self-HTTP call. The
   old DB-only review-service path was deleted. Server-action revalidation runs
   after success or retryable cleanup failure, safe errors are preserved, and
   terminated rows expose an idempotent provider-cleanup retry form.

## Migration-chain decision

This branch and its reporter-live migrations have not been applied in the
target environment. The minimum coherent choice was therefore to correct the
unapplied chain in place: strengthen the original Egress-ID constraint in
`20260822160000`, harden the start CAS in `20260822162000`, and correct/add the
review RPCs in `20260822163000`. No shadow overloads or compensating migration
were added. The rollback-only verifier checks the resulting chain identity
before deployment.

## Protocol and framework sources

- Installed Next.js 16.3 route-handler, server-action/mutation, revalidation,
  environment, and data-security guides under `node_modules/next/dist/docs/`
  were read before the Route Handler and action changes.
- Installed LiveKit 2.17 SDK/protocol sources were treated as the executable
  contract: `livekit-server-sdk/src/EgressClient.ts` documents that
  `listEgress({ roomName })` returns all matching Egresses, and
  `@livekit/protocol/src/gen/livekit_webhook_pb.d.ts` defines webhook IDs as
  strings, while `livekit_egress_pb.d.ts` defines numeric Egress states,
  repeated `fileResults`, and file-owned timestamps/size/duration.
- Current primary references were also checked:
  [LiveKit Egress API](https://docs.livekit.io/reference/other/egress/api/),
  [LiveKit egress protocol](https://github.com/livekit/protocol/blob/main/protobufs/livekit_egress.proto),
  and [LiveKit Node server SDK](https://github.com/livekit/node-sdks/tree/main/packages/livekit-server-sdk).
  The public webhook prose still describes the event ID as a UUID, while the
  protocol/runtime type is string and real provider IDs are prefixed text; the
  bounded protocol/runtime behavior governs this integration.
- Supabase's current RLS/security-definer guidance and changelog were reviewed.
  Every new definer function uses an empty `search_path`, validates
  `service_role`, and is revoked from `public`, `anon`, `authenticated`, and
  `service_role` before the one intended `service_role` grant.

## TDD evidence

Focused regression tests were written before production changes.

- Reporter RED: 65 tests, 43 passed / 22 failed. Failures covered the duplicate
  policy, missing rollback verifier, provider-text webhook IDs, real
  `fileResults`/timestamp shapes, historical Egress reconciliation/status
  matrix, missing reconciliation RPC/type, and inert-false environment rule.
- CMS RED: 8 tests, 5 passed / 3 failed for inert false, shared normal-form
  cleanup, and terminal retry UI. The unsupported route export was also
  reproduced directly against base `8b8724c` with the final static assertion
  (exit 1), then passed through the focused Route Handler test.
- Focused GREEN included 65/65 reporter tests, 8/8 CMS action/environment
  tests, and 2/2 Route Handler tests.

The Egress recovery matrix covers active, completed, failed, multiple exact,
conflicting output, unknown/malformed, response-loss-followed-by-completion,
provider-list failure, and empty no-match cases. Termination tests cover DB
commit before provider loading/calls, terminal-row cleanup retry, redacted
ambiguous cleanup, normal-action service routing, and supported route exports.

## Final verification

- `npm test`:
  - website: 251 passed, 0 failed
  - CMS: 637 passed, 0 failed
  - reporter: 317 passed, 0 failed
- `npm run typecheck`: database, domain, website, CMS, and reporter passed.
- `npm run lint`: website, CMS, and reporter passed.
- Production builds used documented non-secret URL placeholders and
  `LIVEKIT_S3_FORCE_PATH_STYLE=false`:
  - website Next.js 16.3 Turbopack build passed;
  - reporter Next.js 16.3 Turbopack build passed and emitted the live-session
    and LiveKit webhook routes;
  - CMS Next.js 16.3 webpack build passed, prerendered 26 pages, and emitted
    `/api/reporters/live/[id]/terminate`.
- The default CMS Turbopack build remains blocked by the pre-existing macOS
  execution sandbox restriction when its PostCSS worker tries to bind a local
  port (`Operation not permitted`). This is an environment limitation, not a
  compilation/type failure; the supported webpack production build passed.
- `git diff --check` passed.

## Security and external gates

The final diff audit found no raw provider payload, location, provider error,
credential, storage secret, claim token, or provider identifier added to
generic audit/notification metadata or public responses. Terminal
reconciliation stores only the exact bounded Egress binding needed for later
signed webhook processing and one fixed operator-safe state. Existing
receipt-first and request-before-recording lock order, terminal monotonicity,
lease ownership, final reporter authorization, private table grants, and
fixed safe error mapping were retained.

Docker is installed but its daemon is unavailable at
`~/.docker/run/docker.sock`, so a local Postgres reset, runtime verifier,
generated-type refresh, and database advisors could not run. All required
LiveKit and S3 credentials are unset, so credentialed provider/S3 end-to-end
tests also remain an explicit external deployment gate. No provider success
was inferred from those unavailable checks.

## Final fix round 2 — terminal reconciliation race

Reviewed base: `2c0c87a`

The residual retry-order race is closed at the database state-machine boundary.
The new additive migration
`20260822165000_livekit_terminal_reconciliation_marker.sql` adds one nullable,
private `terminal_reconciliation_status` fact constrained to `completed` or
`failed`. The historical-Egress reconciliation RPC writes it with the exact
Egress binding under the existing request-then-recording locks and can only
retain the same terminal value; a conflicting terminal observation returns
false without overwriting it.

The final migration replaces the existing RPCs without changing their
signatures:

- `complete_reporter_live_recording_start` cannot change a marked pending row
  to recording;
- `complete_livekit_webhook_event` acknowledges each later nonterminal receipt
  as processed/stale without changing the pending row or clearing its claim;
- `authorize_reporter_live_session` rejects any marked row before a publisher
  token can be issued;
- the exact matching completed/failed callback still validates the immutable
  receipt/Egress/request/output binding, finalizes the row and receipt, and
  leaves the terminal marker intact. A terminal callback that conflicts with
  the marker fails closed through the existing safe, retryable receipt-failure
  path.

Receipt-first then request-before-recording lock order, claim leases, canonical
MP4 validation, fixed safe audit/notification metadata, and provider-text ID
validation are unchanged. The marker is absent from the authenticated column
grant and public projections. `service_role` has no direct INSERT/UPDATE column
privilege for it; only the explicitly revoked/regranted definer RPC owns the
transition.

### Additive migration decision

Unlike the first consolidated final fix, this round assumes the target may
already have migrations through `20260822164000` applied. It therefore does not
rewrite `20260822162000` or `20260822163000`. The single new `165000` migration
adds the column/constraint and replaces the same four function identities, so
both fresh chains and already-applied chains converge on one final contract.
Manual database types add only the new column; callers and RPC signatures do
not change. The rollback-only verifier now checks the column, constraint,
browser/service write privileges, and final catalog function definitions.

Supabase's current changelog and function privilege guidance were rechecked.
No current breaking change affects this additive Postgres contract; all four
definer functions retain the empty `search_path`, service-role check, explicit
revocation from `public`/`anon`/`authenticated`/`service_role`, and one intended
`service_role` grant.

### Round-2 TDD and verification evidence

- Exact interleaving RED on base `2c0c87a`: 0/3 passed. The failures were the
  intentionally missing additive marker/RPC transition contract, lock-order
  contract, and type/privilege/runtime-verifier parity.
- Exact interleaving GREEN: 3/3 passed.
- Focused schema, reservation, session, Egress reconciliation, webhook, and
  marker suites: 73/73 passed.
- Full `npm test`: website 251/251, CMS 637/637, reporter 320/320.
- Root `npm run typecheck` and `npm run lint` passed across every workspace.
- Production builds with documented non-secret URL placeholders and
  `LIVEKIT_S3_FORCE_PATH_STYLE=false` passed for website and reporter on
  Next.js 16.3 Turbopack, and for CMS with the supported webpack builder (26
  pages, including the termination route). The default CMS Turbopack attempt
  reproduced only the known macOS sandbox denial when PostCSS binds a local
  port; no compilation/type error was reported.
- `git diff --check` and the scoped two-pass SQL/data-safety, concurrency,
  privilege, safe-error, raw-payload, caller/type, and migration-history review
  passed with no findings.

Docker remains installed with its daemon unavailable at
`~/.docker/run/docker.sock`, so local Postgres reset, runtime verifier,
generated-type refresh, and advisors remain external gates. LiveKit and S3
credentials are still unset, so no credentialed provider success was inferred.

## Final fix round 3 — legacy upgrade and mutation coverage

Reviewed base: `df465bc`

The two closure findings are fixed at the additive database state-machine
boundary. Deployments that already ran the old `163000` reconciliation may
contain a pending, claimed recording with a bound Egress but no durable terminal
fact. `165000` now quarantines only the precisely identifiable legacy shape:
`recording_status = pending`, non-null Egress and claim, plus the exact
`live_recording.reconciliation_required` audit for that recording. A
`SHARE ROW EXCLUSIVE` writer lock covers the backfill. Those rows receive the
private value `unknown`; the migration does not guess completed versus failed
and does not quarantine unrelated pending/bound rows. The operator cost is
therefore limited to already-alerted legacy reconciliations, which remain
retryable but require an exact provider terminal reconciliation or callback.

The marker constraint now owns both value and local-state correspondence:

- `unknown`, `completed`, and `failed` markers may coexist with local `pending`;
- local `completed` may retain only a `completed` marker;
- local `failed` may retain only a `failed` marker;
- a private monotonic trigger prevents clearing `unknown` or changing a known
  `completed`/`failed` fact. `unknown` may resolve only to a terminal value.

The same-signature `reserve_reporter_live_recording` and
`fail_reporter_live_recording_start` functions are replaced in `165000` with
marker fences. Reserve retains request → reporter profile → profile → recording
lock order and returns `busy` before fresh-lease/reclaim logic for every marked
row, so an expired quarantine cannot list provider history, start Egress, or
issue a token. Start completion and local room/Egress failure CAS operations
require a null marker, and final authorization continues to reject every marker.
Unmarked rows retain the prior lease, failure-alert, and authorization behavior.
The obsolete direct service-role INSERT/UPDATE column grants are revoked;
service reads remain available, while every mutation now crosses a guarded
security-definer RPC. This closes the privilege-level bypass around the same
marker constraints and CAS checks.

Delayed `egress_started`/nonterminal update receipts on any marker are processed
as stale without changing the row. Known terminal values reject a conflicting
terminal observation. An exact terminal callback for the immutable
receipt/Egress/request/output binding may atomically resolve `unknown`, finalize
the matching local state, and process the receipt. The reconciliation RPC may
similarly resolve `unknown` under the existing request-before-recording locks;
it cannot change a known terminal value. No raw provider fact, Egress ID, claim
token, or marker was added to public responses, audit metadata, or notifications.

### Round-3 migration-history decision

Migrations through `164000` remain untouched. `165000` was introduced only by
round 2 and had not passed the closure review or deployment gate; the round-3
plan explicitly treats that additive migration as unapplied and requires the
upgrade fix within it. It was therefore strengthened in place rather than
creating a second compensating migration. Fresh chains and targets applied only
through `164000` converge on the corrected contract. Deployment must confirm
that `165000` is absent from `supabase_migrations.schema_migrations`; a target
that independently applied the rejected round-2 file needs a new compensating
migration instead of silently reusing this history entry.

Manual database RPC/type shapes do not change. The final migration explicitly
revokes and regrants all six same-signature service functions, and the
rollback-only verifier checks exact identities, intended execute privileges,
the relational constraint, enabled monotonic trigger, quarantined legacy data,
private column privileges, absence of direct service recording writes, and final
catalog definitions.

### Round-3 TDD and verification evidence

- Exact upgrade/retry RED on `df465bc`: 1/6 passed and 5/6 failed. The failures
  reproduced the missing legacy `unknown` backfill/monotonic guard, reserve
  lease-reclaim fence, local failure fence, unknown terminal resolution, and
  grant/verifier parity before production edits.
- Exact marker GREEN: 6/6. The companion service regression proves a DB `busy`
  quarantine reaches no provider history, room creation, Egress start,
  reconciliation, failure, final authorization, or token dependency.
- The pre-landing SQL pass then caught the inherited direct service-write grant
  as an invariant bypass. Its privilege contract failed 5/6 before the grant
  removal and returned to 6/6 afterward.
- Focused schema/reservation/session/recovery/webhook/marker matrix: 79/79.
- Full `npm test`: website 251/251, CMS 637/637, reporter 323/323.
- Root `npm run typecheck` and `npm run lint` passed across every workspace.
- Production builds with non-secret Supabase/app URL placeholders and inert
  `LIVEKIT_S3_FORCE_PATH_STYLE=false` passed for website and reporter on Next.js
  16.3 Turbopack, and for CMS on webpack (26 pages, including the termination
  route). CMS default Turbopack again failed only when the macOS execution
  sandbox denied the PostCSS worker a local port; this is the documented
  environment limitation, not a compilation/type failure.
- `git diff --check` passed. After removing the one direct-write privilege
  bypass found on the first pre-landing pass, the repeated raw-data, privilege,
  state-transition, lock-order, caller/type, and migration-history review found
  no open critical or informational issue.

Docker remains installed with its daemon unavailable at
`~/.docker/run/docker.sock`, so the local Postgres reset, runtime rollback
verifier, generated-type refresh, and advisors could not run. LiveKit and S3
credentials remain unset, so credentialed provider/storage E2E remains an
external deployment gate and no provider success was invented.

## Final fix round 4 — upgrade abort and terminal callback conflict

Reviewed base: `135996b`

The two closure findings are fixed at the existing `165000` database boundary.
Under the migration's writer lock, the private upgrade routine first finds every
legacy row with a null marker, bound Egress, and the exact
`live_recording.reconciliation_required` audit. If any such row is not the old
pending row with both claim token and claim timestamp, the routine raises only
the fixed safe
`LIVE_RECORDING_RECONCILIATION_UPGRADE_REQUIRES_OPERATOR_REMEDIATION` error.
It does not expose row/provider identifiers, guess completed versus failed,
widen terminal transitions, or update any safely quarantinable row before the
check succeeds. Only after a clean preflight are exact pending claims marked
`unknown`; RPC replacements and service grants occur later in the migration.

`complete_livekit_webhook_event` now checks a known `completed`/`failed` marker
against an incoming terminal provider status before the generic local-terminal
stale branch. A conflict raises `LIVEKIT_WEBHOOK_TERMINAL_MISMATCH`, leaving the
receipt completion transaction unacknowledged so the existing service failure
path can fail the lease safely. Matching terminal retries are still processed
as stale, and delayed `recording` callbacks are still processed as stale without
changing the recording.

### Mandatory deployment procedure

1. Confirm `20260822165000` returns no row from
   `supabase_migrations.schema_migrations`. If the rejected earlier file was
   applied independently, stop and use a new compensating migration; do not
   reuse this changed history entry.
2. Quiesce reporter live-session creation and LiveKit webhook traffic, and let
   in-flight session/webhook transactions drain before applying `165000`.
3. If the fixed remediation error is raised, keep traffic quiesced. In a
   privileged operator workflow, identify the reconciliation-audited,
   Egress-bound rows that are no longer exact pending claims, verify each
   provider outcome, and reconcile those rows explicitly. Do not infer terminal
   truth from the local recording state or delete evidence merely to bypass the
   gate.
4. Retry `165000` only after the affected rows have been operator-reconciled.
   Exact legacy pending claims will then be quarantined as `unknown` for later
   signed terminal resolution.

### Round-4 TDD and verification evidence

- Focused RED: 4/6 marker contracts passed and the two new contracts failed for
  exactly the missing unsafe-upgrade routine and mismatch-after-stale ordering.
- Focused GREEN: 6/6 marker contracts; the complete reporter live matrix passed
  89/89 tests (78 top-level tests plus nested status cases).
- The rollback-only SQL verifier now exercises clean/pending success, recording
  abort, failed abort, no partial quarantine on either abort, conflicting
  terminal rejection, matching terminal stale retry, and delayed nonterminal
  stale processing. Static contracts validate the same function/order/error
  text. Its Postgres runtime remains an external gate because Docker is
  unavailable.
- Full `npm test`: website 251/251, CMS 637/637, reporter 323/323.
- Root `npm run typecheck` and `npm run lint` passed across all workspaces.
- Production builds passed for website and reporter on Next.js 16.3 Turbopack
  and CMS on webpack (26 pages, including the termination route), using only
  non-secret URL placeholders and inert
  `LIVEKIT_S3_FORCE_PATH_STYLE=false`.
- `git diff --check` passed. The final migration/RPC/verifier audit retained
  marker constraints and monotonicity, receipt-first then
  request-before-recording lock order, lease ownership/failure behavior,
  service-only execute grants, private marker/provider data, fixed safe errors,
  and unchanged RPC/type identities.

Docker still cannot connect to `~/.docker/run/docker.sock`; local reset,
runtime rollback verification, generated-type refresh, and database advisors
were not run. LiveKit and S3 credentials are unset, so provider/storage E2E was
not run or claimed.

## Final fix round 5 — convergent legacy quarantine

Reviewed base: `989a5f2`

The abort-based round-4 upgrade has been removed. It could not converge:
Postgres correctly rolled back both the migration and any attempted local
remediation signal, while the append-only reconciliation evidence that caused
the abort remained. `165000` now completes under its writer lock and durably
marks every precisely identifiable legacy row `unknown` when it has a bound
Egress, a null marker, one of the legacy `pending`/`recording`/`failed` local
shapes, and the exact `live_recording.reconciliation_required` audit. Claim
shape is deliberately irrelevant. The migration neither guesses provider
terminal truth nor deletes or changes audit evidence.

The relational marker constraint and private monotonic trigger now admit
`unknown` for all three legacy shapes while preventing it from being cleared.
Reservation/reclaim, start completion/failure, final authorization, delayed
nonterminal callbacks, and token issuance remain fenced while any request
sibling is `unknown`. A known marker on an active pending row also remains
busy until its exact callback finalizes it. Once an unknown sibling is
provider-confirmed terminal, the request-level quarantine is released; the
terminal marker itself remains immutable.

One new operational RPC,
`resolve_quarantined_live_recording(uuid, uuid, text, text, text, numeric,
bigint, timestamptz, timestamptz)`, is the only added API. It is a
security-definer with an empty search path, rejects every non-service role,
locks request before recording, and requires the exact request/recording,
bound Egress, canonical room, and original reconciliation audit. It accepts
only provider-confirmed `completed` or `failed`:

- `completed` requires the exact canonical MP4 key, positive duration of at
  most 24 hours at the stored millisecond precision, positive bytes no greater
  than 1 TiB, and finite ordered provider timestamps no more than five minutes
  in the future;
- `failed` requires every output fact to be null and stores only the fixed
  private error `provider-confirmed-terminal-failure`.

The RPC clears stale output/checksum/claim facts as appropriate, can safely
correct a legacy local `failed` row to provider-confirmed `completed`, and
restarts the 90-day retention clock for that correction. It appends one
generic `live_recording.reconciliation_resolved` audit with only
`{"status":"resolved"}` metadata and preserves every original audit row.
Exact retries return `unchanged`; a changed terminal status or any changed
completed fact fails with the fixed conflict error. Existing signed terminal
webhooks and the original reconciliation flow remain the normal resolution
path. The new RPC is only the privileged convergence path for rows that are
still `unknown` after migration.

The handwritten database types include the exact nullable terminal-fact
arguments and JSON result. This is an operational database RPC, so no new
application environment variable or provider client path was added.

### Mandatory round-5 deployment procedure

1. Confirm `20260822165000` is absent from
   `supabase_migrations.schema_migrations`. If any rejected earlier `165000`
   file was independently applied, stop and create a new compensating
   migration; never reuse changed migration history.
2. Quiesce reporter live-session creation and LiveKit webhook processing, then
   let all in-flight session/webhook transactions drain.
3. Apply the corrected `165000` migration. It must commit with every exact
   reconciliation-audited, Egress-bound pending/recording/failed legacy row
   durably quarantined as `unknown`; it must not delete or rewrite audit
   evidence.
4. Run the rollback-only recording verifier and inspect remaining `unknown`
   rows through a privileged operator workflow. Prefer delivery/retry of the
   exact signed terminal callback. Use `resolve_quarantined_live_recording`
   only after an authoritative provider lookup of that exact bound Egress, and
   only for a row whose marker is still `unknown`. Supply every canonical,
   bounded output fact for `completed`; supply no output facts for `failed`.
5. Never clear the marker manually, infer terminal truth from local status, or
   delete/change `live_recording.reconciliation_required` evidence. Resume
   traffic only after the verifier and post-migration session/webhook smoke
   checks pass.

### Round-5 TDD and verification evidence

- Initial focused RED: 4/9 contracts passed and 5/9 failed on the old abort,
  incomplete legacy-shape quarantine, missing provider-resolution API and
  lifecycle correction, and verifier/type parity.
- Two audit regressions were also observed RED before their minimal fixes:
  7/9 passed and 2/9 failed for exact numeric retry precision and retention on
  a failed-to-completed correction; the request-quarantine convergence
  distinction then failed 8/9 before the unknown-only sibling fence. A final
  8/9 RED caught SQL-null role handling before the lifecycle gate was made a
  total boolean with `IS NOT DISTINCT FROM`.
- Focused terminal contracts pass 9/9, and the reporter schema/session/
  reservation/recovery/webhook/terminal matrix passes 79/79.
- Full tests pass: website 251/251, CMS 637/637, reporter 326/326.
- Root `npm run typecheck` passed for database, domain, website, CMS, and
  reporter. Root `npm run lint` passed for website, CMS, and reporter.
- Production builds with non-secret URL placeholders and inert
  `LIVEKIT_S3_FORCE_PATH_STYLE=false` passed for website and reporter on
  Next.js 16.3 Turbopack, and for CMS on webpack (26 generated pages,
  including the live termination route).
- `git diff --check` and the final SQL/data-safety, privilege, lock-order,
  lifecycle/retention, audit-redaction, caller/type, and migration-history
  review passed.

Docker's daemon remains unavailable, so the clean Postgres reset, runtime
rollback verifier, generated-type refresh, and database advisors remain
deployment gates. LiveKit/S3 credentials are unset; provider/storage E2E was
not run or claimed.
