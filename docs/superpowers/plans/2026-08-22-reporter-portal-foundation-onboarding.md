# Reporter Portal Foundation and Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the reporter workspace, phone authentication, paid application workflow, hosted-KYC activation boundary, admin approval, annual membership, and Razorpay refunds.

**Architecture:** A third Next.js 16 app uses the same Supabase project through user-scoped SSR clients. PostgreSQL functions own atomic money/membership transitions; Razorpay and KYC callbacks enter through signature-verified Route Handlers; the CMS reuses its existing admin guard for application decisions.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript, Supabase Auth/PostgreSQL/RLS, Zod 4, Node `crypto`, Razorpay REST/Checkout.

**Spec:** `docs/superpowers/specs/2026-08-22-reporter-portal-design.md`

## Global Constraints

- Use bundled Node 24.19.0 for install and verification; system Node 26 is outside the repository's verified runtime.
- Reuse current dependencies and Node `crypto`/`fetch`; do not add a Razorpay wrapper package.
- Application and renewal fee is exactly INR 100 (`10000` paise).
- Membership begins on approval, lasts one year, and has a seven-day grace period.
- Rejection and paid applications incomplete for 30 days receive a full refund.
- KYC and SMS providers remain disabled production gates until the client supplies approved vendors and credentials.
- Never store Aadhaar number, OTP, raw XML, Aadhaar image, or full provider payload.
- Every Server Action and Route Handler performs its own authentication/authorization and input validation.
- Use signed `app_metadata.role`; never authorize from `user_metadata`.
- All new tables have explicit grants and RLS with both `USING` and `WITH CHECK` where applicable.
- Read `AGENTS.md` and the relevant `node_modules/next/dist/docs/` pages before implementation.

---

### Task 1: Add the reporter workspace and verified build surface

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `reporter/package.json`
- Create: `reporter/tsconfig.json`
- Create: `reporter/next.config.ts`
- Create: `reporter/postcss.config.mjs`
- Create: `reporter/eslint.config.mjs`
- Create: `reporter/src/app/layout.tsx`
- Create: `reporter/src/app/page.tsx`
- Create: `reporter/src/app/globals.css`
- Create: `reporter/src/config/env.ts`
- Create: `reporter/src/config/env.contract.test.mjs`
- Create: `reporter/src/lib/supabase/{server,browser,middleware,admin,types,index}.ts`
- Create: `reporter/src/proxy.ts`

**Interfaces:**
- Consumes: existing `@inbcn/database`, `@inbcn/domain`, CMS Supabase client patterns.
- Produces: `@inbcn/reporter` workspace; `env.public`, `env.server`; `createClient()`, `createBrowserClient()`, `updateSession()`, `createAdminClient()`.

- [ ] **Step 1: Write the workspace contract test**

```js
// reporter/src/config/env.contract.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("reporter exposes required scripts and uses shared packages", async () => {
  const pkg = JSON.parse(await readFile(new URL("../../package.json", import.meta.url)));
  assert.equal(pkg.name, "@inbcn/reporter");
  assert.deepEqual(Object.keys(pkg.scripts).sort(), ["build", "dev", "lint", "start", "test", "typecheck"]);
  assert.equal(pkg.dependencies["@inbcn/database"], "*");
  assert.equal(pkg.dependencies["@inbcn/domain"], "*");
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test --workspace @inbcn/reporter`  
Expected: FAIL because the reporter workspace does not exist.

- [ ] **Step 3: Add the minimal workspace**

Use the CMS dependency versions and scripts. Add `reporter` to root workspaces and root `build`, `lint`, `test`, and `typecheck`. Implement env parsing with these keys: `NEXT_PUBLIC_REPORTER_URL`, public Supabase values, service role, Razorpay key ID/secret/webhook secret, KYC provider/base URL/client credentials/webhook secret, Cloudinary keys, LiveKit keys, `CRON_SECRET`, and `SMS_NOTIFICATIONS_ENABLED`. Production validation must allow the app to build with KYC/SMS disabled, but fail when an enabled integration lacks its complete credentials.

```ts
export const env = Object.freeze({
  public: { appUrl, supabaseUrl, supabaseAnonKey, razorpayKeyId },
  server: {
    supabaseServiceRoleKey,
    razorpay: { keyId, keySecret, webhookSecret },
    kyc: { enabled, provider, baseUrl, clientId, clientSecret, webhookSecret },
    cloudinary: { cloudName, apiKey, apiSecret },
    liveKit: { url, apiKey, apiSecret },
    cronSecret,
    smsNotificationsEnabled,
  },
});
```

- [ ] **Step 4: Install and verify the workspace**

Run: `npm install --cache "$(mktemp -d)"`  
Run: `npm test --workspace @inbcn/reporter && npm run typecheck --workspace @inbcn/reporter && npm run build --workspace @inbcn/reporter`  
Expected: all pass; `/` renders a simple INBCN Reporter landing page.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json reporter
git commit -m "feat(reporter): add reporter portal workspace"
```

### Task 2: Add reporter account, application, payment, webhook, notification, and audit schema

**Files:**
- Create: `supabase/migrations/20260822090000_reporter_foundation.sql`
- Modify: `packages/database/src/database.types.ts`
- Create: `reporter/src/features/application/reporter-schema.contract.test.mjs`
- Modify: `docs/database-schema.md`
- Modify: `docs/row-level-security.md`

**Interfaces:**
- Consumes: `auth.users`, `profiles`, `profile_role`, existing editor/admin RLS convention.
- Produces: role `reporter`; tables `reporter_applications`, `reporter_profiles`, `reporter_payments`, `reporter_consents`, `webhook_events`, `reporter_notifications`, `audit_events`; public view `public_reporter_profiles`; database functions `approve_reporter_application`, `reject_reporter_application`, `apply_reporter_payment`.

- [ ] **Step 1: Write the failing migration contract**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../../../../supabase/migrations/20260822090000_reporter_foundation.sql", import.meta.url), "utf8");

test("reporter foundation enables RLS and protects provider identifiers", () => {
  for (const table of ["reporter_applications", "reporter_profiles", "reporter_payments", "reporter_consents", "webhook_events", "reporter_notifications", "audit_events"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "u"));
  }
  assert.match(migration, /unique \(razorpay_order_id\)/u);
  assert.match(migration, /unique \(provider, provider_event_id\)/u);
  assert.doesNotMatch(migration, /aadhaar_number|aadhaar_otp|raw_xml/iu);
});
```

- [ ] **Step 2: Run the contract and verify failure**

Run: `npm test --workspace @inbcn/reporter -- reporter-schema.contract.test.mjs`  
Expected: FAIL because the migration is absent.

- [ ] **Step 3: Implement the migration**

Define constrained text statuses, INR/amount checks, one active application per profile, opaque KYC reference, approval/expiry/grace timestamps, two trust booleans, versioned consent receipts, public-photo verification timestamps, and unique Razorpay/provider IDs. Add indexes for admin queues and daily due-state scans. The public view must project only slug, legal display name, avatar, public status, home district, bio, beats, and published-count inputs. Grant applicants only their own safe selects/updates; grant public users only the public view.

Use security-definer functions with fixed `search_path = ''`, explicit role checks, row locks, expected-state checks, and audit inserts. `approve_reporter_application` sets first membership start to approval time, expiry to `approval + interval '1 year'`, grace end to `expiry + interval '7 days'`, and returns the approved profile ID. `reject_reporter_application` marks refund eligibility but does not call Razorpay from SQL.

- [ ] **Step 4: Apply locally and regenerate types**

Run: `npx supabase db reset`  
Run: `npx supabase gen types typescript --local > packages/database/src/database.types.ts`  
Expected: migration applies without warnings and generated types contain every new relation and `reporter` enum member.

- [ ] **Step 5: Run schema verification**

Run: `npm test --workspace @inbcn/reporter && npm run typecheck`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260822090000_reporter_foundation.sql packages/database/src/database.types.ts reporter/src/features/application/reporter-schema.contract.test.mjs docs/database-schema.md docs/row-level-security.md
git commit -m "feat(database): add reporter onboarding foundation"
```

### Task 3: Implement phone OTP and reporter route authorization

**Files:**
- Create: `reporter/src/features/auth/{authorization.model,authorization.model.test.mjs,server,actions,otp-form}.ts*`
- Create: `reporter/src/app/(auth)/login/page.tsx`
- Create: `reporter/src/app/(auth)/verify/page.tsx`
- Create: `reporter/src/app/(protected)/layout.tsx`
- Create: `reporter/src/app/(protected)/dashboard/page.tsx`
- Modify: `reporter/src/proxy.ts`

**Interfaces:**
- Consumes: Supabase `signInWithOtp({ phone, options: { captchaToken } })`, `verifyOtp({ phone, token, type: "sms" })`, profile/application rows.
- Produces: `authorizeCurrentReporter()`, `requireReporterSession()`, `requestOtpAction()`, `verifyOtpAction()`.

- [ ] **Step 1: Test authorization independently**

```ts
assert.deepEqual(authorizeReporterIdentity({ id: "u1", role: null }, null), { ok: true, state: "applicant", userId: "u1" });
assert.deepEqual(authorizeReporterIdentity({ id: "u1", role: "reporter" }, { id: "u1", role: "reporter", isActive: true }), { ok: true, state: "reporter", userId: "u1" });
assert.equal(authorizeReporterIdentity({ id: "u1", role: "admin" }, null).ok, false);
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test --workspace @inbcn/reporter -- authorization.model.test.mjs`  
Expected: FAIL because the model is absent.

- [ ] **Step 3: Implement OTP actions and protected layout**

Validate E.164 Indian phone numbers with `^\\+91[6-9]\\d{9}$`, require CAPTCHA on OTP request, return safe `useActionState` results, and redirect verified sessions to the dashboard. Recheck identity in the protected layout and every mutation. Proxy performs cookie refresh only.

- [ ] **Step 4: Verify auth behavior**

Run: `npm test --workspace @inbcn/reporter && npm run typecheck --workspace @inbcn/reporter`  
Expected: PASS; tests cover applicant access, active reporter access, staff-role denial, inactive reporter denial, malformed phone, and OTP error redaction.

- [ ] **Step 5: Commit**

```bash
git add reporter/src/features/auth reporter/src/app reporter/src/proxy.ts
git commit -m "feat(reporter): add mobile OTP authentication"
```

### Task 4: Implement application state machine and hosted-KYC gate

**Files:**
- Create: `packages/domain/src/reporter.ts`
- Modify: `packages/domain/src/index.ts`
- Create: `reporter/src/features/application/{application.model,application.model.test.mjs,application.repository,application.service,application.actions,application-form,application-status,consent.model,consent.model.test.mjs,consent-form,profile-photo.service,profile-photo.service.test.mjs,profile-photo-field}.ts*`
- Create: `reporter/src/app/(protected)/application/page.tsx`
- Create: `reporter/src/app/api/kyc/start/route.ts`
- Create: `reporter/src/app/api/kyc/callback/route.ts`

**Interfaces:**
- Produces: `ReporterApplicationStatus`, `canTransitionApplication(from, to)`, `getApplicationDeadline(paidAt)`, `startKycSession(applicationId)`, `processKycWebhook(input)`.
- The KYC start route returns `503 { code: "kyc-not-configured" }` while the client-approved integration is disabled; it must not simulate success.

- [ ] **Step 1: Write domain transition tests**

```ts
assert.equal(canTransitionApplication("draft", "payment_pending"), true);
assert.equal(canTransitionApplication("kyc_pending", "under_review"), true);
assert.equal(canTransitionApplication("approved", "rejected"), false);
assert.equal(getApplicationDeadline("2026-08-22T00:00:00.000Z"), "2026-09-21T00:00:00.000Z");
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test --workspace @inbcn/reporter -- application.model.test.mjs`  
Expected: FAIL because the application model is absent.

- [ ] **Step 3: Implement application forms and service**

Collect legal-name declaration, date of birth, home city/district/state, biography, beats, a separate public portrait, and separate consent versions for payment/refund, KYC, public identity, mandatory location, recording, and editorial terms. Enforce age 18 using calendar dates, not milliseconds. Consent controls are unselected, localized in English/Hindi/Marathi, and stored with notice key/version/locale/timestamp before an order can be created. Upload the portrait as a server-owned Cloudinary image after checking JPEG/PNG/WebP magic bytes, a 10 MiB limit, and a generated public ID; never copy a KYC/Aadhaar image. Persist only server-validated fields. Start the 30-day deadline from captured payment time. Permit KYC retry while `kyc_pending`; a failed/abandoned KYC remains refund-eligible at deadline.

Define the hosted provider boundary only after vendor credentials exist:

```ts
export type KycWebhookResult = Readonly<{
  eventId: string;
  reference: string;
  status: "verified" | "failed";
  legalName?: string;
  adult?: boolean;
  verifiedAt: string;
}>;
export interface HostedKycProvider {
  createSession(input: Readonly<{ applicationId: string; returnUrl: string }>): Promise<Readonly<{ url: string; reference: string }>>;
  verifyWebhook(rawBody: string, signature: string): KycWebhookResult;
}
```

- [ ] **Step 4: Verify disabled and enabled boundaries**

Run: `npm test --workspace @inbcn/reporter`  
Expected: PASS; required consent gates payment, invalid portrait bytes are rejected, disabled KYC returns 503, invalid signatures return 401, duplicate provider events return 200 without a second transition, and no raw provider body is persisted.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src reporter/src/features/application reporter/src/app/'(protected)'/application reporter/src/app/api/kyc
git commit -m "feat(reporter): add application and hosted KYC boundary"
```

### Task 5: Implement Razorpay application payment, webhook, and refund

**Files:**
- Create: `reporter/src/features/payments/{razorpay.client,razorpay.signature,razorpay.signature.test.mjs,payment.model,payment.model.test.mjs,payment.repository,payment.service}.ts`
- Create: `reporter/src/app/api/payments/order/route.ts`
- Create: `reporter/src/app/api/payments/verify/route.ts`
- Create: `reporter/src/app/api/webhooks/razorpay/route.ts`
- Create: `cms/src/features/admin/reporters/reporter-refund.service.ts`

**Interfaces:**
- Produces: `createReporterOrder({ applicationId, purpose })`, `verifyCheckoutSignature(orderId, paymentId, signature)`, `processRazorpayEvent(rawBody, signature)`, `requestFullRefund(paymentId)`.

- [ ] **Step 1: Write deterministic signature and renewal-credit tests**

```ts
assert.equal(verifyHmac("order_1|pay_1", "secret", createHmac("sha256", "secret").update("order_1|pay_1").digest("hex")), true);
assert.equal(creditRenewal("2027-08-22T00:00:00.000Z", "2027-08-20T00:00:00.000Z"), "2028-08-22T00:00:00.000Z");
assert.equal(creditRenewal("2027-08-22T00:00:00.000Z", "2027-09-01T00:00:00.000Z"), "2028-09-01T00:00:00.000Z");
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test --workspace @inbcn/reporter -- razorpay.signature.test.mjs payment.model.test.mjs`  
Expected: FAIL because payment modules are absent.

- [ ] **Step 3: Implement native REST/HMAC integration**

Create Razorpay Orders for exactly `10000` paise and `INR`; attach only internal opaque IDs in notes. Verify Checkout HMAC for immediate UI feedback, but grant payment state only from a signature-verified captured/paid webhook or verified API fetch. Store `webhook_events` before processing. Reject amount/currency/order mismatches. Use Basic Auth only server-side. Refund the full captured amount on rejection/30-day abandonment and retain `refund_pending` until Razorpay confirms processing.

- [ ] **Step 4: Verify money-path behavior**

Run: `npm test --workspace @inbcn/reporter && npm test --workspace @inbcn/cms`  
Expected: PASS for invalid signature, duplicate webhook, wrong amount, captured payment, duplicate payment, refund retry, and asynchronous refund confirmation.

- [ ] **Step 5: Commit**

```bash
git add reporter/src/features/payments reporter/src/app/api/payments reporter/src/app/api/webhooks/razorpay cms/src/features/admin/reporters/reporter-refund.service.ts
git commit -m "feat(reporter): add Razorpay application payments"
```

### Task 6: Add CMS application review and membership renewal

**Files:**
- Create: `cms/src/app/admin/(protected)/reporters/applications/page.tsx`
- Create: `cms/src/app/admin/(protected)/reporters/applications/[id]/page.tsx`
- Create: `cms/src/features/admin/reporters/{reporter.model,reporter.model.test.mjs,reporter.repository,reporter.service,reporter.actions,application-list,application-review}.ts*`
- Create: `reporter/src/app/(protected)/membership/page.tsx`
- Modify: `cms/src/app/admin/(protected)/admin-navigation.contract.test.mjs`
- Modify: `cms/src/features/admin/navigation/admin-mobile-navigation.tsx`

**Interfaces:**
- Consumes: `approve_reporter_application`, `reject_reporter_application`, Razorpay refund service, Supabase admin client for signed `app_metadata.role` update.
- Produces: admin-only approve/reject/suspend/reinstate actions; reporter renewal UI using Task 5 order flow.

- [ ] **Step 1: Write role and membership tests**

```ts
assert.equal(canReviewReporter("admin"), true);
assert.equal(canReviewReporter("editor"), false);
assert.equal(membershipAccess({ status: "grace_period", direct: true, live: true }), "reviewed-submissions-only");
assert.equal(membershipAccess({ status: "expired", direct: true, live: true }), "read-only");
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test --workspace @inbcn/cms -- reporter.model.test.mjs`  
Expected: FAIL because reporter administration is absent.

- [ ] **Step 3: Implement admin review atomically**

Require verified legal name/adult outcome, every current consent version, and an admin-confirmed identity match for the separately supplied public portrait. Call the database decision function first, then update `app_metadata.role` to `reporter`; if claim update fails, mark an auditable provisioning failure and keep portal reporter access denied until retry. Reject requires a reason and invokes one full refund. Suspension sets inactive access and revokes active sessions; it does not refund. Renewal is unavailable while suspended.

- [ ] **Step 4: Verify full onboarding flow**

Run: `npm test && npm run typecheck && npm run build`  
Expected: all workspaces pass; admin-only controls are enforced and the reporter dashboard reflects pending, approved, grace, expired, and suspended states.

- [ ] **Step 5: Commit**

```bash
git add cms/src/app/admin/'(protected)'/reporters cms/src/features/admin/reporters cms/src/features/admin/navigation cms/src/app/admin/'(protected)'/admin-navigation.contract.test.mjs reporter/src/app/'(protected)'/membership
git commit -m "feat(cms): add reporter application review and membership"
```

## Foundation Plan Exit Gate

Run with the bundled Node runtime:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Verify one sandbox application from phone OTP through Razorpay capture, disabled/selected KYC gate, admin approval, first-year dates, rejection refund, manual renewal, grace, expiry, and suspension. Do not enable production KYC or SMS without the client-approved vendors, contracts, consent text, and credentials.
