# Reporter Operations and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete lifecycle automation, notifications, consent/privacy operations, end-to-end security checks, deployment configuration, and controlled production release for the reporter system.

**Architecture:** One authenticated daily reporter cron selects due rows and invokes idempotent database/provider transitions. In-app notifications are canonical; critical SMS is an optional configured channel. Privacy operations use explicit retention dates and legal holds, while Playwright and CI exercise the cross-app user journeys.

**Tech Stack:** Next.js 16.3 Route Handlers, Vercel Cron, Supabase PostgreSQL, Razorpay REST, configured SMS provider, Node test runner, Playwright, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-22-reporter-portal-design.md`

## Global Constraints

- Complete the foundation, submissions/profile, and live-recording plans first.
- One daily job owns 30-day application refunds, renewal reminders, grace/expiry, refund retries, recording deletion, and coordinate deletion.
- Every job transition is state-guarded and safe to rerun.
- Legal hold always blocks deletion.
- In-app notification is authoritative; SMS/browser push failure cannot roll back business state.
- SMS remains disabled until a client-approved TRAI-DLT provider and templates are configured.
- Consent text is separate, unselected, versioned, and available in English, Hindi, and Marathi before payment.
- Production KYC, SMS, payment, LiveKit, storage, tax, and retention activation require client/legal approval.
- Do not commit runtime logs, credentials, screenshots containing identity data, or real provider payloads.

---

### Task 1: Implement idempotent daily lifecycle processing

**Files:**
- Create: `reporter/src/features/lifecycle/{lifecycle.model,lifecycle.model.test.mjs,lifecycle.repository,lifecycle.service,lifecycle.service.test.mjs}.ts`
- Create: `reporter/src/app/api/cron/reporter-lifecycle/route.ts`
- Create: `reporter/vercel.json`
- Modify: `reporter/src/config/env.ts`

**Interfaces:**
- Produces: `runReporterLifecycle(now)`, `GET /api/cron/reporter-lifecycle` protected by `CRON_SECRET`.

- [ ] **Step 1: Write due-state tests**

```ts
assert.equal(nextMembershipState({ expiresAt, graceEndsAt, now: beforeExpiry }), "active");
assert.equal(nextMembershipState({ expiresAt, graceEndsAt, now: afterExpiry }), "grace_period");
assert.equal(nextMembershipState({ expiresAt, graceEndsAt, now: afterGrace }), "expired");
assert.equal(shouldDelete({ deleteAt: now, legalHold: true, now }), false);
assert.equal(shouldRefundIncomplete({ paidAt, status: "kyc_pending", now: day30 }), true);
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test --workspace @inbcn/reporter -- lifecycle.model.test.mjs lifecycle.service.test.mjs`  
Expected: FAIL because lifecycle processing is absent.

- [ ] **Step 3: Implement one bounded lifecycle runner**

Process due work in stable ID order and bounded batches. For each row, call state-guarded database functions and store audit/notification records in the same transaction. External refund/object deletion occurs through provider IDs and records success/failure for retry. Coordinate deletion nulls exact coordinate fields while retaining public locality and audit evidence. Recording deletion removes the private object before marking metadata deleted; an object failure leaves the row retryable.

Set Vercel cron to `15 2 * * *` (02:15 UTC daily) and require `Authorization: Bearer ${CRON_SECRET}`.

- [ ] **Step 4: Verify rerun safety**

Run: `npm test --workspace @inbcn/reporter`  
Expected: PASS for two identical runs, partial provider failure, legal hold, payment already refunded, renewal arriving during processing, and deletion retry.

- [ ] **Step 5: Commit**

```bash
git add reporter/src/features/lifecycle reporter/src/app/api/cron reporter/src/config/env.ts reporter/vercel.json
git commit -m "feat(reporter): automate reporter lifecycle"
```

### Task 2: Add in-app notifications and optional critical SMS

**Files:**
- Modify: `reporter/package.json`
- Modify: `package-lock.json`
- Modify: `reporter/src/config/env.ts`
- Create: `reporter/src/features/notifications/{notification.model,notification.model.test.mjs,notification.repository,notification.service,sms-provider.server}.ts`
- Create: `reporter/src/features/notifications/{push-provider.server,push-subscription}.ts*`
- Create: `reporter/src/app/(protected)/notifications/page.tsx`
- Create: `reporter/src/app/api/notifications/[id]/read/route.ts`
- Create: `reporter/src/app/api/push/subscribe/route.ts`
- Create: `reporter/public/sw.js`
- Modify: services that create application, editorial, live, refund, and lifecycle events

**Interfaces:**
- Produces: `notifyReporter(event)`, `markNotificationRead(id)`, `sendCriticalSms(notification)`, `subscribeBrowserPush(subscription)`, `sendBrowserPush(notification)`.

- [ ] **Step 1: Test channel policy**

```ts
assert.deepEqual(channelsFor("story.published"), ["in_app"]);
assert.deepEqual(channelsFor("application.approved"), ["in_app", "sms", "push"]);
assert.deepEqual(channelsFor("membership.grace_started"), ["in_app", "sms", "push"]);
assert.deepEqual(channelsFor("recording.ready"), ["in_app"]);
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test --workspace @inbcn/reporter -- notification.model.test.mjs`  
Expected: FAIL because notification policy is absent.

- [ ] **Step 3: Implement canonical in-app delivery**

Insert in-app records inside the business transition transaction. Dispatch SMS and browser push after commit only for approved critical templates. When SMS is disabled, retain `not_configured` delivery state without failing the event. Add the maintained `web-push` package, VAPID environment validation, a minimal service worker, and an authenticated subscription endpoint that reuses the existing `push_subscriptions` table. Ask browser permission only from a user gesture and make denial non-blocking. The selected SMS adapter and push payload accept only template ID and approved variables; neither may send KYC, exact location, private editorial notes, or payment identifiers.

- [ ] **Step 4: Verify delivery isolation**

Run: `npm test --workspace @inbcn/reporter`  
Expected: PASS for own-notification RLS, read action ownership, SMS disabled, push permission denied, stale push subscription removal, provider failure, safe retry, and forbidden sensitive variables.

- [ ] **Step 5: Commit**

```bash
git add reporter/package.json package-lock.json reporter/src/config/env.ts reporter/src/features/notifications reporter/src/app/'(protected)'/notifications reporter/src/app/api/notifications reporter/src/app/api/push reporter/public/sw.js reporter/src/features/application reporter/src/features/payments reporter/src/features/live reporter/src/features/lifecycle
git commit -m "feat(reporter): add reporter notifications"
```

### Task 3: Add privacy requests and consent-withdrawal operations

**Files:**
- Create: `supabase/migrations/20260822120000_reporter_privacy_operations.sql`
- Modify: `packages/database/src/database.types.ts`
- Create: `reporter/src/features/privacy/{privacy.model,privacy.model.test.mjs,privacy.repository,privacy.service,privacy.actions,privacy-request-form}.ts*`
- Create: `reporter/src/app/(protected)/account/privacy/page.tsx`
- Create: `cms/src/app/admin/(protected)/reporters/privacy/page.tsx`
- Create: `cms/src/features/admin/reporters/privacy/{privacy-review.service,privacy-review.actions,privacy-review-list}.ts*`

**Interfaces:**
- Consumes: versioned `reporter_consents` and public-photo verification from the foundation plan.
- Produces: `reporter_privacy_requests`; `requestCorrection()`, `requestConsentWithdrawal()`, `requestAccountClosure()`, admin resolution actions.

- [ ] **Step 1: Write privacy-state tests**

```ts
assert.equal(canRequestPrivacyAction("active", "correction"), true);
assert.equal(canRequestPrivacyAction("suspended", "account_closure"), true);
assert.equal(nextIdentityState("aadhaar_consent_withdrawn"), "alternate_identity_review");
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test --workspace @inbcn/reporter -- privacy.model.test.mjs`  
Expected: FAIL because privacy-request operations are absent.

- [ ] **Step 3: Implement privacy operations**

Allow authenticated reporters to request data correction, Aadhaar consent withdrawal, and account closure with a reason and contact preference. Consent withdrawal immediately stops further Aadhaar-derived use, queues verifiable deletion of permitted KYC metadata, and routes the account to the client-approved alternate identity review. Account closure disables new activity but retains published attribution subject to editorial/legal resolution. Admin resolution records actor, result, evidence reference, and safe notification without placing identity documents in the database.

- [ ] **Step 4: Apply and verify**

Run: `npx supabase db reset && npx supabase gen types typescript --local > packages/database/src/database.types.ts`  
Run: `npm test && npm run typecheck`  
Expected: PASS for privacy-request ownership, consent withdrawal, alternate identity review, admin resolution, and published-attribution protection.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260822120000_reporter_privacy_operations.sql packages/database/src/database.types.ts reporter/src/features/privacy reporter/src/app/'(protected)'/account cms/src/features/admin/reporters/privacy cms/src/app/admin/'(protected)'/reporters/privacy
git commit -m "feat(reporter): add privacy request operations"
```

### Task 4: Add cross-app Playwright journeys

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `playwright.config.ts`
- Create: `e2e/reporter/{fixtures,application.spec,submission.spec,live.spec,privacy.spec}.ts`
- Create: `.env.test.example`

**Interfaces:**
- Produces: root `test:e2e` script and deterministic sandbox journey suite.

- [ ] **Step 1: Add a failing smoke journey**

```ts
test("unapproved applicant cannot open reporter story editor", async ({ page }) => {
  await signInReporter(page, "applicant");
  await page.goto("/stories/new");
  await expect(page).toHaveURL(/\/dashboard/u);
  await expect(page.getByText("Application under review")).toBeVisible();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:e2e -- --project=chromium application.spec.ts`  
Expected: FAIL until the Playwright configuration and fixtures exist.

- [ ] **Step 3: Implement deterministic fixtures and journeys**

Use a dedicated local/test Supabase project and provider simulators that validate signatures and state without claiming production KYC success. Cover phone session fixture, Razorpay captured/rejected/refund events, admin approval, reviewed and direct submissions, exact-location privacy, renewal/grace, live approval/token/termination, Egress callback, replay publication, and privacy request. Run Android-sized Chromium plus desktop CMS/website projects. Mask secrets and never record videos/traces containing real identity data.

- [ ] **Step 4: Run the E2E suite**

Run: `npm run test:e2e`  
Expected: PASS in local test environment.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json playwright.config.ts e2e .env.test.example
git commit -m "test(reporter): add cross-app reporter journeys"
```

### Task 5: Add CI and deployment gates

**Files:**
- Create: `.github/workflows/verify.yml`
- Create: `.github/workflows/reporter-e2e.yml`
- Create: `docs/reporter-ci.contract.test.mjs`
- Create: `docs/reporter-operations.md`
- Modify: `README.md`
- Modify: `.gitignore`
- Delete from Git tracking: `dev-runtime.err.log`, `dev-runtime.out.log`

**Interfaces:**
- Produces: required lint/typecheck/unit/build workflow; credentialed sandbox E2E workflow; operator runbook.

- [ ] **Step 1: Write CI contract test**

```js
test("CI verifies all workspaces and keeps provider E2E gated", async () => {
  assert.match(verifyWorkflow, /npm run lint/u);
  assert.match(verifyWorkflow, /npm run typecheck/u);
  assert.match(verifyWorkflow, /npm test/u);
  assert.match(verifyWorkflow, /npm run build/u);
  assert.match(e2eWorkflow, /environment: reporter-sandbox/u);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test docs/reporter-ci.contract.test.mjs`  
Expected: FAIL because workflows are absent.

- [ ] **Step 3: Implement CI and runbook**

Use Node 24 and `npm ci`. Verification runs for every pull request. Reporter E2E runs only against the protected `reporter-sandbox` environment with test credentials. Document credential inventory, webhook URLs, DLT templates, KYC activation gate, Razorpay reconciliation, refund recovery, LiveKit termination, Egress failures, legal hold, lifecycle rerun, incident contacts, Aadhaar/privacy breach notification procedure, credential rotation, and rollback. Add runtime logs to `.gitignore` and remove only those two tracked log files from Git.

- [ ] **Step 4: Verify locally**

Run: `npm ci --cache "$(mktemp -d)" && npm run lint && npm run typecheck && npm test && npm run build`  
Expected: PASS; `git status` contains no runtime logs.

- [ ] **Step 5: Commit**

```bash
git add .github docs/reporter-operations.md docs/reporter-ci.contract.test.mjs README.md .gitignore dev-runtime.err.log dev-runtime.out.log
git commit -m "ci: add reporter verification and operations gates"
```

### Task 6: Execute controlled sandbox acceptance and production readiness review

**Files:**
- Create: `docs/reporter-release-checklist.md`
- Modify: `docs/reporter-operations.md`

**Interfaces:**
- Consumes: all preceding plans and client-approved vendors/policies.
- Produces: signed release checklist; no production activation occurs from this task alone.

- [ ] **Step 1: Record immutable release criteria**

```markdown
- [ ] Client approved KYC vendor and non-Aadhaar alternative
- [ ] Client approved SMS vendor, DLT entity/template registrations, and message copy
- [ ] Legal approved consent, privacy, retention, refund, attribution, and recording terms
- [ ] Finance approved ₹100 tax/invoice treatment and Razorpay settlement account
- [ ] LiveKit Egress private bucket lifecycle and access policy verified
- [ ] Sandbox application, refund, renewal, submission, live, replay, and deletion journeys passed
- [ ] Admin emergency termination and account suspension drill passed
- [ ] Backup/restore and webhook replay drill passed
```

- [ ] **Step 2: Run full automated verification**

Run: `npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e`  
Expected: PASS with saved CI links/test summaries containing synthetic identities only.

- [ ] **Step 3: Execute manual device/accessibility checks**

Use representative low/mid-range Android devices and throttled networks. Verify OTP recovery, local draft recovery, photo/video retry, location denial/retry, screen-reader announcements, live reconnect, recording disclosure, CMS termination, and public byline/replay. Record pass/fail against the checklist without collecting reporter personal data.

- [ ] **Step 4: Perform security/privacy review**

Verify anonymous/database responses exclude phone, DOB, KYC reference, Razorpay IDs, private media/object keys, exact coordinates, and review notes. Verify RLS cross-account denial, role-claim mismatch denial, webhook signature rejection, cron secret rejection, scoped LiveKit grants, and admin audit coverage.

- [ ] **Step 5: Commit the completed readiness record**

```bash
git add docs/reporter-release-checklist.md docs/reporter-operations.md
git commit -m "docs: record reporter release readiness"
```

## Operations Plan Exit Gate

Production remains blocked until every external client/legal gate is checked. After approval, deploy database migrations first, then CMS, website, and reporter app; configure sandbox webhooks; run smoke tests; switch provider endpoints/keys to production; run one low-risk real payment/refund reconciliation; and monitor application, webhook, refund, live, and Egress audit queues through the controlled rollout.
