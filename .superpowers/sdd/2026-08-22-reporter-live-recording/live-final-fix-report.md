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
