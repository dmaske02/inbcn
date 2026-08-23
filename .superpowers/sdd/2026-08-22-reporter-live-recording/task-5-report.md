# Task 5 — verified callbacks and private recording review

## Delivered

- Added `POST /api/webhooks/livekit` with the installed LiveKit 2.17 `WebhookReceiver`, signed raw-body hash verification, an exact `application/webhook+json` boundary, the shared streaming 1 MiB reader, fixed `no-store` responses, and retryable `503` lease handling.
- Added service-role-only LiveKit receipt RPCs that bind the event UUID/type to one exact Egress ID. Completion locks receipt, recording, then request and commits the monotonic recording transition and processed receipt in one transaction. Terminal callbacks become durable stale receipts without rewriting terminal facts.
- Successful completion accepts exactly one canonical MP4 and bounded nanosecond duration/byte facts. Failure stores only one of two fixed safe codes and emits a generic alert only on the newly durable failure. Raw bodies, authorization, provider errors/details/locations, room SIDs, manifests, credentials, and arbitrary metadata are never persisted.
- Added editor/admin recording list and protected detail review. Strict Zod parsing fails closed for every recording, request, category, thumbnail, and private-reason database row before the DTO reaches React.
- Added exact/idempotent publish and reject transitions plus admin-only legal hold. Private reasons live in `live_recording_editorial_private`; generic audits contain only fixed state/changed-field facts. The old reasonless legal-hold RPC is removed.
- Added closed-by-default `public_live_replays`. The allowlist contains only replay/editorial/request/category/thumbnail/timing facts; no storage key, Egress/provider field, profile/account UUID, private reason, signed URL, or location. RLS is enabled and all table privileges remain revoked, including `service_role`; Task 6 owns exposure.
- Added 60-second private preview signing using a minimal server-only Node `crypto` AWS SigV4 implementation for the configured S3-compatible endpoint/bucket/region/path style. The dependency registry/cache was unavailable, so the approved native signer was verified against AWS's published S3 query-string signature vector. The preview is generated only after request-time authentication, returned only on eligible protected detail, and never stored.

## Installed Next.js 16.3 guides consulted

The following app-visible installed guides were read before changing the route, pages, actions, and client component:

- `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/09-revalidating.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`
- `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`
- `node_modules/next/dist/docs/01-app/02-guides/data-security.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/index.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md`

The implementation follows the installed guidance: thin independently authenticated Server Actions, server-only minimal DTO/data access, strict untrusted input validation, awaited `params`, request-time generation for the expiring preview, targeted post-mutation revalidation, and fixed route responses.

## TDD evidence

### RED

The focused contracts were created before production code and run from each application:

```text
reporter/src/features/live/livekit-webhook.service.test.mjs
  ERR_MODULE_NOT_FOUND: livekit-webhook.service.ts

cms/src/features/admin/reporters/recordings/recording.model.test.mjs
  ERR_MODULE_NOT_FOUND: recording.model.ts
```

The reporter RED contract covered installed numeric Egress statuses, real signature rejection before receipt I/O, ignored signed unrelated events, processed/busy receipts, exact Egress/room/key/file/timestamps, terminal monotonicity, fixed failure codes, raw-body type/size/auth/no-store handling, and atomic SQL completion.

The CMS RED contract covered writer denial, editor/admin permissions, admin-only hold, strict safe rows, metadata/reason bounds, detail-only 60-second preview privacy, safe mutation failures, private reasons, exact idempotent RPCs, audit safety, and the projection allowlist.

### GREEN

```text
Reporter focused LiveKit suite: 12 tests, 12 pass, 0 fail
CMS focused recording suite: 9 tests, 9 pass, 0 fail
Reporter full suite: 300 tests, 300 pass, 0 fail
CMS full suite: 634 tests, 634 pass, 0 fail
```

The signer tests include the official AWS S3 SigV4 query vector:

```text
2013-05-24T00:00:00Z / examplebucket / us-east-1 / test.txt
signature: aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404
```

## Final verification

```text
npm test
  passed website, CMS, and reporter suites

npm run typecheck
  passed database, domain, website, CMS, and reporter

npm run lint
  passed website, CMS, and reporter

git diff --check
  passed (no output)
```

Affected builds:

```text
npm run build --workspace @inbcn/reporter
  passed; /api/webhooks/livekit emitted

npm run build --workspace @inbcn/cms
  compiled and typechecked, then stopped at the existing production gate:
  NEXT_PUBLIC_CMS_URL is required in production.
```

A diagnostic CMS build with a non-secret placeholder URL was also attempted; the sandbox stopped Turbopack while binding its CSS worker port with `Operation not permitted (os error 1)`. The single required root build was attempted and stopped in the website at the existing `NEXT_PUBLIC_APP_URL is required in production` configuration gate before reaching CMS/reporter.

## External gates not run

- No Docker/Postgres migration apply, generated database types, or Supabase advisor checks: these gates are unavailable/prohibited for this task. Database types and schema/RLS documentation were updated manually.
- No credentialed LiveKit callback or private S3 end-to-end run: no provider/storage credentials were supplied. Signature, lifecycle, privacy, and presign behavior are unit/contract tested only.

## Security review notes

- The route verifies the signed raw string before any receipt write and never logs or persists the string or Authorization JWT.
- Receipt claim identity is immutable across retries; active leases are never acknowledged with `2xx`; receipt and recording completion cannot partially commit.
- Canonical room/key association is checked in both the service boundary and database transition. Provider timestamps and file duration are coherent at nanosecond precision before conversion; duration and bytes are bounded.
- Browser table privileges for `live_recordings` were narrowed to safe review columns. The one privileged CMS read selects only `id`, `live_request_id`, and `storage_key` for the exact authenticated detail target, and the key is canonicalized again before signing.
- Signed URLs appear only in the protected client detail DTO, expire in 60 seconds, and are not accepted by actions, audits, projections, or persistence.
- Exact-same terminal editorial facts return without a second audit. Conflicting facts fail; decisions cannot be reversed or silently edited. Legal hold changes retention eligibility only and never publishes.
