# Task 6 report — publish approved broadcast replays

## Outcome

Implemented the anonymous, localized replay experience for editorially published reporter broadcasts. The website reads only an explicit safe projection, renders a native video player with verified public reporter attribution, and streams the private MP4 through a same-origin GET/HEAD Route Handler.

Unpublished, rejected, legal-held, expired-retention, missing, and non-completed recordings are absent from both the public metadata projection and the service-role storage-key lookup.

## TDD record

Focused RED was recorded before production implementation:

- The initial replay projection, mapper, environment, delivery, and page contracts failed because the Task 6 migration and website feature did not exist (8 failing focused tests).
- A later upstream unsatisfied-range test failed with `503` instead of the required fixed `416`; the delivery mapping was then corrected.
- A redirect-policy assertion failed until the private-object fetch explicitly used `redirect: "error"`.
- A deliberate `signHead` mutation to sign as GET made the shared signer distinction test fail; restoring HEAD in the canonical request returned the focused suite to GREEN.

Focused GREEN:

```text
node --conditions=react-server --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
  website/src/features/replays/replay.model.test.mjs \
  website/src/features/replays/replay-delivery.test.mjs \
  website/src/features/replays/replay-security.contract.test.mjs \
  website/src/features/replays/replay-env.test.mjs \
  website/src/features/replays/replay-page.contract.test.mjs

16 tests passed, 0 failed
```

The focused contracts cover strict safe mapping, forbidden private fields, current-public SQL predicates and grants, canonical service-only key lookup, GET/HEAD signatures, streaming without buffering, single-range forwarding, malformed and upstream-unsatisfied ranges, provider-detail redaction, server-only all-or-none configuration, localized copy, native video markup, JSON-LD, and reporter attribution.

## Implementation and security boundaries

- Added the additive `20260822164000_public_reporter_replays.sql` migration. `public_replays` is an owner-executed `security_barrier` view with fixed safe columns and database-time predicates for completed, published, non-held, current rows. Only `anon` and `authenticated` receive `select` on this view; the recording, request, and Task 5 publication tables stay closed.
- Added `get_public_replay_storage_key(uuid)` as a `security definer` function with an empty search path, an exact `service_role` check, a current-public existence recheck, and a canonical `reporter-live/{request UUID}/{replay UUID}.mp4` key check. Only `service_role` receives execute.
- The public repository selects an explicit safe field list from `public_replays`, scoped by canonical replay UUID and locale. Its strict Zod mapper rejects any extra provider, key, request, account, or editorial field.
- The private repository is server-only and uses the website service-role client only for the exact storage-key RPC. Service-role and object-storage credentials are validated all-or-none and never use a `NEXT_PUBLIC_` name.
- The same-origin Route Handler exports only GET and HEAD. It signs for 60 seconds with the shared Node-crypto SigV4 helper, fetches with redirects disabled, passes only a single validated `Range`, returns the upstream body stream directly, fixes/validates MP4 headers, and emits only `content-type`, `content-length`, `content-range`, `accept-ranges`, and no-store cache policy. Missing, invalid-range, and provider-failure responses use fixed redacted 404/416/503 bodies.
- The Task 5 signer was moved, not duplicated, to the explicit server-only `@inbcn/domain/server/aws-s3-presigner` subpath. The CMS preview wrapper continues using the same GET signer and its official AWS vector regression remains green.
- The replay page follows the installed Next.js 16.3 async params and Route Handler contracts, uses native `<video controls playsInline preload="metadata">`, provides localized fallback/not-found copy, publishes canonical/social metadata and `VideoObject` JSON-LD, and reuses the verified public reporter card/link.
- Task 5 CMS revalidation was intentionally unchanged: its publication action already awaits `revalidateWebsite("all")`, and the existing website revalidation contract invalidates the localized public layout.

## Verification

Passed on the final implementation tree:

- Focused Task 6 suite: 16 passed, 0 failed.
- CMS signer/publication regression: `npm test --workspace @inbcn/cms -- src/features/admin/reporters/recordings/recording.model.test.mjs` — 9 passed, 0 failed.
- Full monorepo gate: `npm test && npm run typecheck && npm run lint` — exit 0; website, CMS, and reporter tests passed; database, domain, website, CMS, and reporter typechecks passed; website, CMS, and reporter lint passed.
- Website production build with placeholder public values:

  ```text
  NEXT_PUBLIC_APP_URL=https://www.example.com \
  NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder \
  npm run build --workspace @inbcn/website
  ```

  Next.js 16.3 build passed and emitted dynamic routes `/[locale]/replays/[id]` and `/api/replays/[id]`.
- `git diff --check` passed.

Security self-review covered every new grant, the owner-executed view/RLS boundary, the service-role-only caller and RPC, the anonymous query field list, secret naming, request method/range validation, upstream redirect handling, response header allowlist, body streaming, and fixed redacted failures. No public response or DTO contains a storage key, signed URL, provider identifier, request/profile/account UUID, private reason, actor, audit record, or exact location.

## Deferred environment-dependent verification

Docker/Postgres and credentialed provider environments were unavailable, so the following were not run and are not claimed:

- Supabase database reset/migration apply, live grant/RLS/role checks, advisors, and rollback checks.
- `supabase gen types`; `packages/database/src/database.types.ts` was updated manually to match the static view/RPC contracts.
- Credentialed LiveKit/S3 GET, HEAD, browser range playback, and provider-failure E2E.

These require the project Postgres/Supabase environment and real private object-storage credentials.

## Review round 1

Two reviewer findings were reproduced with behavioral regressions before production edits:

- A ranged HEAD request received a representative S3 `200` metadata response without `Content-Range`; the delivery service returned fixed `503` instead of `200`.
- `LIVEKIT_S3_FORCE_PATH_STYLE=false` as the only replay-storage setting caused environment loading to fail with all five required-field errors instead of remaining an inert optional default.

The root causes were two overly broad truthiness branches. Partial-content status and `Content-Range` validation now apply only to ranged GET; ranged HEAD continues to send the validated `Range` but accepts S3's `200` metadata contract, returns no body, omits `Content-Range`, and preserves the fixed safe header allowlist. Replay-storage all-or-none validation now activates for an actual storage field/endpoint or when path style is exactly `true`; `false` alone remains inactive, while `true` alone still requires the complete configuration.

Review-fix verification on the final tree:

- Focused affected delivery/environment suite: 11 passed, 0 failed.
- Complete website suite: 251 passed, 0 failed.
- Full monorepo `npm test` gate passed for website, CMS, and reporter.
- Website typecheck and lint passed.
- Next.js 16.3 production build passed with the documented placeholder public URLs and `LIVEKIT_S3_FORCE_PATH_STYLE=false`, emitting both replay routes.
- `git diff --check` passed.

The response self-review reconfirmed that ranged GET remains `206` with a syntactically and numerically validated `Content-Range`; ranged HEAD is `200` without a body or provider-only headers; malformed and upstream-unsatisfied ranges retain fixed redacted `416` behavior; provider failures retain fixed redacted `503` behavior. The configuration self-review reconfirmed that partial actual credentials, an endpoint, or `true` path style fail closed, while absent configuration and the example's explicit `false` default do not require credentials.
