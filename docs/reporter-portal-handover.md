# Reporter portal handover

This branch adds the mobile-first reporter portal and its CMS/public-site integrations. It is ready for continued development and client preview; real OTP, payment, KYC, and production live-video infrastructure still need provider configuration.

## What is implemented

- Public signup and phone login, reporter application, ₹100 annual membership, KYC state, seven-day renewal grace period, and refund lifecycle.
- A preview-only shortcut that accepts OTP `1234`, records dummy payment/KYC evidence, and auto-approves the application.
- Reporter profile, current-location capture, story drafts, media uploads, story submission/revision, and submission history.
- Story submissions default to CMS approval. Admins may separately grant direct publication.
- Live requests default to CMS approval. Admins may separately grant live access.
- LiveKit room/token flow, recording lifecycle, editor review, terminal reconciliation, and replay publication controls.
- CMS application, trust, story-review, live-request, recording, membership, suspension, refund, and audit workflows.
- Public verified legal-name bylines, reporter profiles, and editor-published replay pages.
- Supabase tables, functions, row-level security, audit trails, generated types, and verification SQL.

## Local setup

From the repository root:

```bash
npm install
npm run dev --workspace @inbcn/reporter
```

The CMS and website can be started in separate terminals with the same command and their workspace names.

Create `reporter/.env.local` from the shared project credentials. Minimum local/preview values are:

```dotenv
NEXT_PUBLIC_REPORTER_URL=http://localhost:3100
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
REPORTER_TEMPORARY_ONBOARDING=true
```

Provider variables are validated as complete groups in `reporter/src/config/env.ts`. Add Razorpay, KYC, Cloudinary, LiveKit, private S3-compatible recording storage, cron, and notification credentials only when that provider is being enabled. Keep every service-role, provider secret, and webhook secret server-only.

## Client-preview flow

`REPORTER_TEMPORARY_ONBOARDING=true` enables the current end-to-end preview:

1. Enter any valid Indian mobile number.
2. Enter OTP `1234`.
3. Complete the application.
4. Confirm the dummy ₹100 payment and dummy KYC steps.
5. The application is automatically approved and the reporter workspace opens.
6. Stories and live requests still enter their real approval queues in the CMS.

The environment contract rejects this flag when `VERCEL_ENV=production`. Do not weaken that check or deploy the shortcut to production.

## Database changes

All database changes are ordered migrations in `supabase/migrations/`. Link the CLI to the existing INBCN Supabase project, inspect first, then apply:

```bash
supabase migration list --linked
supabase db push --dry-run
supabase db push
supabase db lint --linked
```

The reporter series starts at `20260822090000_reporter_foundation.sql`; the preview shortcut is `20260824170000_temporary_reporter_onboarding.sql`. Never edit a migration already applied to a shared environment—add a new timestamped migration and regenerate `packages/database/src/database.types.ts` when the schema changes.

## Editorial and security invariants

- Reporter stories and live broadcasts require approval by default; direct-publish and live grants are independent and default to false.
- A recording remains private until an editor explicitly publishes its replay.
- Exact reporter coordinates are private editorial data and must never enter public projections.
- Public bylines use the KYC-verified legal name only after the reporter is approved.
- Supabase row-level security and server-side authorization are the enforcement boundary; UI hiding is not authorization.
- The Supabase service-role key and all payment/KYC/media/live secrets stay on the server.
- Webhooks must remain signature-checked and idempotent. Payment, membership, refund, suspension, recording, and editorial transitions must retain their audit events.

## Remaining production work

1. Replace OTP `1234` with an approved SMS/OTP provider and disable temporary onboarding.
2. Configure Razorpay orders, signatures, webhooks, refunds, and production credentials.
3. Select and integrate the client-approved KYC provider (DigiLocker or another compliant provider), including consent, webhook verification, retention, and failure handling.
4. Configure Cloudinary uploads and LiveKit credentials, webhook endpoint, and private S3-compatible recording storage.
5. Configure cron secrets and run reconciliation, renewal, grace-period, expiry, refund, and recording-terminal jobs.
6. Connect the repository to the intended Vercel account, create the `reporter` project, add Preview variables, and verify the full preview before adding Production variables/domain.
7. Complete provider sandbox tests, privacy/legal review, observability/alerts, backups, and an operations runbook before launch.

## Code map

- `reporter/src/features/application` — application and temporary onboarding.
- `reporter/src/features/auth` — phone authentication and preview OTP.
- `reporter/src/features/submissions` and `uploads` — story drafts, revisions, location, and media.
- `reporter/src/features/live` — live requests, sessions, tokens, and recording state.
- `reporter/src/features/payments`, `membership`, `lifecycle`, and `webhooks` — account lifecycle integrations.
- `cms/src/features/admin/reporters` — reporter administration, live review, and recordings.
- `cms/src/features/admin/stories` — reporter and staff editorial review.
- `website/src/features/reporters` and `replays` — public reporter identity and approved recordings.
- `supabase/migrations` and `supabase/verification` — canonical persistence and database checks.

## Before every handoff or deploy

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Also exercise signup through CMS story/live approval in the target environment. A green unit suite does not validate third-party credentials, webhook delivery, recording storage, or Vercel/Supabase redirect configuration.
