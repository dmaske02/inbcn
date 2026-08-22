# Reporter Portal Foundation Final-Fix Report

Date: 2026-08-22

Base commit: `1e728e0` (`fix(auth): fence reporter access generations`)

Status: `DONE_WITH_CONCERNS` — every code, contract, documentation, type, test,
lint, and build item in the final review is complete. Live PostgreSQL apply and
credentialed provider/browser E2E remain external gates because the local Docker
daemon and deployment credentials are unavailable.

## Scope and method

The final review was implemented as one cohesive hardening wave in the reporter
portal worktree. The work reused the existing order/verification routes,
Razorpay client, atomic payment owner, service-role Supabase boundary, consent
persistence, and Cloudinary uploader. No package or framework was added.

The implementation was test-driven. The initial focused RED command covered the
new checkout, application security, timestamp, grace, portrait recovery, future
migration, application-service, and payment-service contracts: 44 tests ran,
24 passed, and 20 failed for the missing reviewed behavior. The final expanded
focused command runs 65 tests and all 65 pass. Smaller RED/GREEN cycles were also
used while self-reviewing script-load retry, post-checkout verification retry,
Cloudinary URL/public-ID binding, SQLSTATE cleanup classification, and the
Asia/Kolkata calendar-age boundary.

Official Razorpay sources used for the timestamp contract:

- [Payments webhook events](https://razorpay.com/docs/webhooks/payments/) —
  `payment.captured` and `order.paid` represent capture, payloads are entity
  snapshots, and the signed event envelope carries Unix `created_at`.
- [Fetch a Payment With ID](https://razorpay.com/docs/api/payments/fetch-with-id/)
  — the verified payment entity exposes Unix `created_at`, used only as the
  documented API-reconciliation fallback.

## Finding-by-finding changes

### Critical 1 — application checkout

- Added `reporter/src/features/payments/reporter-checkout.tsx` as the shared
  production checkout owner for `application` and `renewal` purposes.
- `ApplicationStatus` now renders checkout for a consent-complete `draft` and a
  resumable `payment_pending` application, always sending the owned application
  ID and `purpose: "application"`.
- The existing renewal component is now a narrow wrapper sending
  `purpose: "renewal"` with `applicationId: null`; the renewal behavior and
  existing endpoints are preserved.
- The checkout validates the exact server order (`10000`, `INR`), loads and can
  safely retry the Razorpay script, reports provider failure and cancellation,
  verifies the Checkout response server-side, distinguishes HTTP 202/pending
  from HTTP 200/captured, and exposes accessible live status/error feedback.
- After Checkout returns a signed result, retries re-run verification with that
  receipt rather than opening a second payment attempt. Checkout HMAC is only a
  gate; it is never displayed or persisted as captured without provider API/RPC
  confirmation.
- Coverage:
  `checkout-ui.contract.test.mjs`, `membership-ui.contract.test.mjs`, and the
  existing payment route/service suites.

### Critical 2 — authenticated direct-DML bypass

- Added migration
  `supabase/migrations/20260822140000_reporter_foundation_final_hardening.sql`.
- Revoked both table-level and the previously granted exact column-level
  application/consent INSERT/UPDATE privileges from `authenticated`.
- Dropped the three applicant DML policies. Generation-fenced owner SELECT
  policies remain intact.
- Added database checks for the server calendar adult declaration, application
  text limits, exact supported beat domain/cardinality, notice-version length,
  unique UUID-v4 Cloudinary public IDs, the Cloudinary delivery domain, and a
  URL-to-public-ID provenance binding.
- Application and consent writes now use the server-only service-role client.
  Both application Server Actions call `requireReporterSession` before these
  writes; actor IDs come from the session, consent timestamps come from
  PostgreSQL defaults, and photo verification/lifecycle timestamps are never
  accepted from the form.
- The general `profiles.avatar_url` capability remains the pre-existing user
  profile feature; it is not an approval bypass because the approved reporter
  projection is sourced from the now-write-locked application portrait.
- Partial consent persistence remains idempotent and recoverable through the
  existing immutable receipt upsert/read-back flow.
- Coverage:
  `application-security.persistence.test.mjs`, the application service tests,
  consent persistence tests, and the existing reporter schema/RLS contracts.

### Important 1 — signed provider capture time

- Webhook parsing now requires and safely converts the signed envelope
  `created_at` Unix seconds. Payment and paid-order entity timestamps are also
  validated.
- Checkout API reconciliation uses the fetched captured payment entity's
  documented `created_at` fallback; no browser-submitted timestamp is accepted.
- Provider seconds must convert to a safe JavaScript millisecond integer and
  fall within server-owned future-skew and payment/order chronology bounds.
- The timestamp is passed through the repository to the atomic SQL payment RPC.
  SQL independently rejects timestamps too far before the internal order facts
  or in the future.
- The first exact verified capture returns before timestamp reconciliation, so
  an API-first result cannot be shifted by a later webhook and vice versa.
- Application deadlines use the immutable provider time rather than delivery
  time. Delayed-delivery tests cover the 30-day deadline and a delivery after
  the grace period for a capture signed at the final grace boundary.
- Types for the seven-argument webhook completion RPC were regenerated by hand
  to match the canonical migration.

### Important 2 — grace renewal arithmetic

- The atomic SQL owner now extends from the prior expiry whenever capture is on
  or before the inclusive `membership_grace_ends_at` boundary.
- `membership_started_at` is preserved through grace and resets to provider
  capture time only after grace. A first application approval still owns the
  initial membership start, one-calendar-year expiry, and seven-day grace.
- Added a production renewal-credit model and boundary tests for before expiry,
  immediately after expiry, within grace, the exact final grace instant, and
  immediately after grace.
- Updated the design spec and database documentation to the same semantics.

### Important 3 — ambiguous portrait cleanup

- A UUID-v4 application ID is allocated before upload and is also the stable
  Cloudinary public identity. Draft insert explicitly uses that ID.
- On an ambiguous insert result, the service authoritatively re-reads by
  application ID, profile ID, and portrait public ID. A committed row is
  recovered and consent persistence continues; its portrait is never deleted.
- Only a five-character PostgreSQL SQLSTATE is classified as a definite
  transaction rejection. PostgREST and transport errors remain ambiguous.
- Definite rejection still performs an authoritative global reference check
  before Cloudinary deletion. An ambiguous or failed re-read logs the public ID
  for safe reconciliation and never destroys the asset.
- Tests cover exact commit-success/response-loss recovery, definite rejection
  cleanup, and ambiguous re-read failure with no deletion.

### Important 4 — future migration collisions

- Reporter submissions: `20260822150000_reporter_submissions.sql`.
- Reporter live recording: `20260822160000_reporter_live_recording.sql`.
- Reporter privacy operations: `20260822170000_reporter_privacy_operations.sql`.
- Updated every filename, command, and reference in the three dependent plans.
  Already implemented migrations were not renamed. A contract test proves the
  versions are unique, monotonic, and ordered after `20260822140000`.

## Files and ownership

- UI: application page/status, shared reporter checkout, renewal wrapper.
- Application boundary: actions, repository, draft service, portrait uploader.
- Payment boundary: Razorpay schemas/client, payment service/repository/model,
  generated database function types.
- Database owner: `20260822140000_reporter_foundation_final_hardening.sql`.
- Contracts: new checkout, application security, payment hardening, renewal
  model, and future-migration tests plus focused regression updates.
- Documentation: database schema, RLS guide, reporter design spec, foundation
  plan, and all three dependent implementation plans.

## Verification evidence

All commands used bundled Node 24.13.0 from
`/Users/nataliaopenclaw/.nvm/versions/node/v24.13.0/bin`.

| Verification | Result |
| --- | --- |
| Expanded focused final-fix suites | PASS — 65/65 |
| Website full tests | PASS — 213/213 |
| CMS full tests | PASS — 585/585 |
| Reporter full tests | PASS — 116/116 |
| Root full test command | PASS — 914/914 total |
| Root typecheck | PASS — database, domain, website, CMS, reporter |
| Root lint | PASS — website, CMS, reporter |
| Root production build | PASS — website, CMS, reporter |
| `git diff --check` | PASS |
| Old future-migration reference search | PASS — no stale names |
| Client secret search/self-review | PASS — service keys remain server-only |

The build used only placeholder public values required for production parsing:

```text
NEXT_PUBLIC_APP_URL=https://www.example.test
NEXT_PUBLIC_CMS_URL=https://cms.example.test
NEXT_PUBLIC_REPORTER_URL=https://reporter.example.test
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key
AUTO_IMPORT_ENABLED=false
```

No provider or service credential was supplied to the build.

## Security and money self-review

- Exact fee remains ₹100 / `10000` paise / `INR` in UI validation, provider
  reconciliation, table constraints, and the atomic SQL owner.
- Capture, membership, deadline, and audit transitions remain one locked SQL
  transaction. Webhook claiming/refund idempotency and receipt token CAS are
  unchanged.
- Signed timestamps affect time boundaries only after exact payment/order/money
  verification. Unsigned browser time and raw provider payloads are not stored.
- Service-role, Razorpay secret, Cloudinary secret, and webhook secret remain in
  server-only modules and environment branches. Only the Razorpay public key is
  passed to the client component.
- No Aadhaar number, OTP, identity document, raw XML, or full provider payload
  was introduced.
- The KYC-disabled production gate and the generation-fenced reporter auth
  trigger/policies were preserved.
- General profile photo edits cannot alter the application portrait used by
  admin verification or the approved public reporter projection.

## Deferred external gates / concerns

- `docker info` reports that it cannot connect to the local Docker daemon.
  Therefore the new migration was not live-applied or exercised against local
  PostgreSQL, and this report does not claim otherwise. Latest-function,
  signature, privilege, owner, chronology, grace, and constraint contracts
  compensate statically.
- No deploy-scoped Supabase, Razorpay, Cloudinary, or authenticated browser
  credentials were available. Credentialed checkout, direct REST denial, real
  Cloudinary response-loss, webhook delivery, and full portal E2E remain release
  gates in the target environment.
- These are the pre-declared external gaps; there is no remaining code-level
  blocker found in the final diff.
