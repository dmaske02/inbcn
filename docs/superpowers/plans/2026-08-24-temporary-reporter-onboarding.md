# Temporary Reporter Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a preview-only mobile `1234` sign-in and simulated ₹100 payment/KYC flow that automatically approves reporter applications while preserving CMS approval for stories and live windows.

**Architecture:** A validated server-only feature flag selects temporary authentication and onboarding adapters; production provider paths stay untouched. Two service-role-only, idempotent PostgreSQL RPCs record explicitly temporary payment/KYC evidence and prepare reporter access, while the application completes the existing database/Auth claim synchronization before exposing reporter routes.

**Tech Stack:** Next.js 16.3 App Router and Server Actions, React 19, TypeScript 5, Supabase Auth/Postgres/RLS, Node test runner, Zod 4, LiveKit.

**Spec:** `docs/superpowers/specs/2026-08-24-temporary-reporter-onboarding-design.md`

## Global Constraints

- Temporary onboarding requires `REPORTER_TEMPORARY_ONBOARDING=true` and must be rejected when `VERCEL_ENV=production`.
- Temporary mobile authentication accepts only Indian E.164 numbers and the exact code `1234`.
- UI copy must say “dummy” or “client preview”; it must not claim real payment or identity verification.
- Automatic approval applies only to the reporter application.
- `can_publish_directly` remains `false`; stories continue to require CMS editorial approval.
- Live requests continue to require CMS approval and an active approved time window before LiveKit authorization.
- No new package is permitted; use installed Supabase, Zod, Node crypto, and Next APIs.
- Before editing Next.js files, read `node_modules/next/dist/docs/01-app/02-guides/authentication.md`, `forms.md`, `server-actions.md`, and `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md` completely.
- Before database work, load the Supabase and Supabase Postgres best-practices skills and fetch the current Supabase changelog.
- Never print `.env.local`, service-role keys, generated passwords, or user phone numbers in test/tool output.

## File Structure

- `reporter/src/config/env.ts`: validates and exposes the preview-only flag.
- `reporter/src/features/auth/temporary-auth.model.ts`: pure validation and dependency-injected temporary sign-in orchestration.
- `reporter/src/features/auth/temporary-auth.server.ts`: Supabase Admin user lookup/create/password rotation and cookie-backed sign-in.
- `reporter/src/features/auth/actions.ts`: selects temporary or provider OTP actions.
- `reporter/src/features/auth/otp-form.tsx`: renders the two-step preview mobile/code experience.
- `supabase/migrations/20260824170000_temporary_reporter_onboarding.sql`: temporary evidence provenance, payment RPC, KYC/approval RPC, access-sync claim/completion RPCs, privileges, and audit contracts.
- `reporter/src/features/application/temporary-onboarding.service.ts`: coordinates onboarding RPCs and Supabase Auth metadata synchronization.
- `reporter/src/features/application/temporary-onboarding.actions.ts`: authenticated Server Actions and safe action results.
- `reporter/src/features/application/temporary-onboarding-controls.tsx`: dummy payment and KYC buttons.
- `reporter/src/features/application/application-status.tsx`: selects temporary controls or provider controls.
- `packages/database/src/database.types.ts`: manual database contracts for the new columns and RPCs.
- Existing story and live services remain production code; focused tests prove they are not bypassed.

---

### Task 1: Preview-only environment gate

**Files:**
- Modify: `reporter/src/config/env.ts`
- Modify: `reporter/src/config/env.contract.test.mjs`
- Modify: `reporter/.env.local` locally only; never commit it

**Interfaces:**
- Produces: `env.server.temporaryOnboarding: boolean`
- Consumes: `REPORTER_TEMPORARY_ONBOARDING`, `VERCEL_ENV`

- [ ] **Step 1: Write the failing environment contract tests**

Add subprocess cases that import `env.ts` with controlled environment values:

```js
test("temporary onboarding is disabled by default and accepted in preview", () => {
  assert.equal(readEnv({}).server.temporaryOnboarding, false);
  assert.equal(readEnv({
    REPORTER_TEMPORARY_ONBOARDING: "true",
    VERCEL_ENV: "preview",
  }).server.temporaryOnboarding, true);
});

test("temporary onboarding cannot be enabled in Vercel production", () => {
  const result = importEnv({
    REPORTER_TEMPORARY_ONBOARDING: "true",
    VERCEL_ENV: "production",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /REPORTER_TEMPORARY_ONBOARDING cannot be enabled in production/u);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- src/config/env.contract.test.mjs`

Expected: FAIL because `temporaryOnboarding` and the production rejection do not exist.

- [ ] **Step 3: Implement the minimal validated flag**

Add to the Zod input and parsed environment:

```ts
REPORTER_TEMPORARY_ONBOARDING: z.enum(["true", "false"]).default("false"),
VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
```

In `superRefine`, reject the unsafe combination:

```ts
if (values.REPORTER_TEMPORARY_ONBOARDING === "true"
  && values.VERCEL_ENV === "production") {
  context.addIssue({
    code: "custom",
    path: ["REPORTER_TEMPORARY_ONBOARDING"],
    message: "REPORTER_TEMPORARY_ONBOARDING cannot be enabled in production.",
  });
}
```

Expose only the boolean under `env.server.temporaryOnboarding`.

- [ ] **Step 4: Verify GREEN and type safety**

Run: `npm test -- src/config/env.contract.test.mjs && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Enable the local flag without exposing secrets**

Add `REPORTER_TEMPORARY_ONBOARDING=true` to ignored `reporter/.env.local` using `apply_patch`; confirm `git status --short --ignored reporter/.env.local` shows it as ignored. Do not print the file.

- [ ] **Step 6: Commit**

```bash
git add reporter/src/config/env.ts reporter/src/config/env.contract.test.mjs
git commit -m "feat(reporter): gate temporary onboarding mode"
```

---

### Task 2: Temporary mobile authentication

**Files:**
- Create: `reporter/src/features/auth/temporary-auth.model.ts`
- Create: `reporter/src/features/auth/temporary-auth.model.test.mjs`
- Create: `reporter/src/features/auth/temporary-auth.server.ts`
- Modify: `reporter/src/features/auth/actions.ts`
- Modify: `reporter/src/features/auth/otp-form.tsx`
- Modify: `reporter/src/app/(auth)/login/page.tsx`
- Modify: `reporter/src/app/(auth)/verify/page.tsx`

**Interfaces:**
- Produces: `createTemporaryAuthService(dependencies).signIn({ phone, code }): Promise<void>`
- Produces: `temporarySignInAction(previousState, formData): Promise<OtpState>`
- Consumes: `env.server.temporaryOnboarding`, `validateIndianPhone`, `createAdminClient()`, `createClient()`

- [ ] **Step 1: Write the failing orchestration tests**

Create dependency-driven tests with real values and no Supabase mocks beyond the external boundary:

```js
test("1234 creates a confirmed phone user and establishes a session", async () => {
  const events = [];
  const service = createTemporaryAuthService({
    findUser: async () => null,
    createUser: async (input) => { events.push(["create", input]); return "user-1"; },
    rotatePassword: async () => { throw new Error("must not rotate a new user"); },
    ensureProfile: async (userId) => { events.push(["profile", userId]); },
    signIn: async (input) => { events.push(["sign-in", input.phone]); },
    randomPassword: () => "generated-private-password",
  });
  await service.signIn({ phone: "+919876543210", code: "1234" });
  assert.deepEqual(events.map(([name]) => name), ["create", "profile", "sign-in"]);
});

test("1234 rotates a returning user's password before sign-in", async () => {
  const events = [];
  const service = createTemporaryAuthService({
    findUser: async () => "user-1",
    createUser: async () => { throw new Error("must not create duplicate"); },
    rotatePassword: async () => { events.push("rotate"); },
    ensureProfile: async () => { events.push("profile"); },
    signIn: async () => { events.push("sign-in"); },
    randomPassword: () => "generated-private-password",
  });
  await service.signIn({ phone: "+919876543210", code: "1234" });
  assert.deepEqual(events, ["rotate", "profile", "sign-in"]);
});

test("temporary auth rejects every code except 1234 before user lookup", async () => {
  let lookedUp = false;
  const service = createTemporaryAuthService({
    findUser: async () => { lookedUp = true; return null; },
    createUser: async () => "user-1",
    rotatePassword: async () => {},
    ensureProfile: async () => {},
    signIn: async () => {},
    randomPassword: () => "generated-private-password",
  });
  await assert.rejects(() => service.signIn({ phone: "+919876543210", code: "9999" }), /invalid-credentials/u);
  assert.equal(lookedUp, false);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- src/features/auth/temporary-auth.model.test.mjs`

Expected: FAIL because `temporary-auth.model.ts` does not exist.

- [ ] **Step 3: Implement the pure service**

Define:

```ts
export class TemporaryAuthError extends Error {
  constructor(readonly code: "disabled" | "invalid-credentials" | "unavailable") {
    super(code);
  }
}

export function createTemporaryAuthService(dependencies: TemporaryAuthDependencies) {
  return {
    async signIn(input: Readonly<{ phone: unknown; code: unknown }>): Promise<void> {
      const phone = validateIndianPhone(input.phone) ? input.phone : null;
      if (!phone || input.code !== "1234") {
        throw new TemporaryAuthError("invalid-credentials");
      }
      const password = dependencies.randomPassword();
      try {
        const existingUserId = await dependencies.findUser(phone);
        const userId = existingUserId
          ? existingUserId
          : await dependencies.createUser({ phone, password });
        if (existingUserId) await dependencies.rotatePassword(userId, password);
        await dependencies.ensureProfile(userId);
        await dependencies.signIn({ phone, password });
      } catch (error) {
        if (error instanceof TemporaryAuthError) throw error;
        throw new TemporaryAuthError("unavailable");
      }
    },
  };
}
```

Validate with the existing `validateIndianPhone`, require exact string `1234`, generate one password per attempt, create a confirmed user or rotate the exact existing user, then sign in. Map all provider failures to `TemporaryAuthError("unavailable")`.

- [ ] **Step 4: Verify the model tests pass**

Run: `npm test -- src/features/auth/temporary-auth.model.test.mjs`

Expected: PASS.

- [ ] **Step 5: Add the Supabase server adapter**

Implement `signInWithTemporaryOtp(phone, code)` using:

```ts
const password = randomBytes(32).toString("base64url");
```

`findUser(phone)` must page through `admin.auth.admin.listUsers({ page, perPage: 1000 })` until it finds an exact phone or reaches the final page. Add:

```ts
// ponytail: preview-only linear Auth lookup; replace with provider OTP when temporary mode is removed.
```

Create new users with `{ phone, phone_confirm: true, password }`; rotate returning users with `updateUserById(userId, { password })`. Before sign-in, insert `{ id: userId, username: 'reporter_' + first 16 hex characters of userId, display_name: 'Reporter applicant', role: 'reader' }` only when the profile is missing; never overwrite an existing profile or derive public fields from the phone number. Establish cookies with `createClient().auth.signInWithPassword({ phone, password })`. Never log the phone or password.

- [ ] **Step 6: Write failing action/UI contract tests**

Extend the auth contract tests to require:

```js
assert.match(actions, /env\.server\.temporaryOnboarding/u);
assert.match(actions, /signInWithTemporaryOtp/u);
assert.match(form, /Client preview code/u);
assert.match(form, /1234/u);
assert.match(form, /name="token"/u);
```

Also assert normal `signInWithOtp` and `verifyOtp` calls remain in the provider branches.

- [ ] **Step 7: Run the auth tests and verify RED**

Run: `npm test -- src/features/auth/authorization.model.test.mjs src/features/auth/temporary-auth.model.test.mjs`

Expected: FAIL on the missing temporary action/UI branch.

- [ ] **Step 8: Wire the Server Action and login UI**

Add `temporarySignInAction` that returns the existing generic field-safe `OtpState`, calls `signInWithTemporaryOtp`, and redirects to `/dashboard` on success. In temporary mode, render mobile and code fields together with visible copy: `Client preview code: 1234`. Outside temporary mode, preserve the current CAPTCHA/provider OTP request and verification pages exactly.

- [ ] **Step 9: Verify authentication changes**

Run: `npm test -- src/features/auth && npm run typecheck`

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add reporter/src/features/auth reporter/src/app/'(auth)'/login/page.tsx reporter/src/app/'(auth)'/verify/page.tsx
git commit -m "feat(reporter): add preview mobile authentication"
```

---

### Task 3: Idempotent temporary payment, KYC, approval, and access sync

**Files:**
- Create: `supabase/migrations/20260824170000_temporary_reporter_onboarding.sql`
- Create: `reporter/src/features/application/temporary-onboarding.persistence.test.mjs`
- Modify: `packages/database/src/database.types.ts`
- Modify: `reporter/src/features/application/future-migrations.contract.test.mjs`
- Modify: `supabase/verification/reporter-lifecycle-verification.sql`

**Interfaces:**
- Produces: `public.complete_temporary_reporter_payment(p_profile_id uuid, p_application_id uuid) returns jsonb`
- Produces: `public.complete_temporary_reporter_kyc_approval(p_profile_id uuid, p_application_id uuid) returns jsonb`
- Produces: `public.claim_temporary_reporter_access_sync(p_profile_id uuid) returns jsonb`
- Produces: `public.complete_temporary_reporter_access_sync(p_profile_id uuid, p_generation bigint, p_claim_token uuid, p_succeeded boolean, p_failure_detail text) returns jsonb`
- All four RPCs are executable only by `service_role`.

- [ ] **Step 1: Write the failing migration contract test**

The test must extract each function from migration SQL and assert behavior-bearing contracts:

```js
test("temporary onboarding records explicit evidence and preserves editorial gates", async () => {
  const sql = compact(await readFile(migrationUrl, "utf8"));
  const payment = sqlFunction(sql, "complete_temporary_reporter_payment");
  const approval = sqlFunction(sql, "complete_temporary_reporter_kyc_approval");
  assert.match(payment, /auth\.role\(\) is distinct from 'service_role'/u);
  assert.match(payment, /amount_paise[^;]+10000/u);
  assert.match(payment, /payment_provider[^;]+'temporary'/u);
  assert.match(approval, /kyc_provider[^;]+'temporary'/u);
  assert.match(approval, /can_publish_directly[^;]+false/u);
  assert.match(approval, /can_broadcast_live[^;]+true/u);
  assert.match(approval, /access_sync_status[^;]+'pending'/u);
  assert.match(sql, /to service_role/u);
  assert.doesNotMatch(sql, /to (?:anon|authenticated)/u);
});
```

Add a migration-order assertion for version `20260824170000`.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- src/features/application/temporary-onboarding.persistence.test.mjs src/features/application/future-migrations.contract.test.mjs`

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Add explicit temporary provenance**

Add `reporter_payments.payment_provider text not null default 'razorpay'` with a check for `('razorpay', 'temporary')`. Add `reporter_applications.review_mode text not null default 'staff'` with a check for `('staff', 'temporary')` and replace approval/photo constraints so temporary approval is represented by `review_mode='temporary'`, null staff reviewer fields, and complete timestamps.

Add `reporter_profiles.public_photo_verification_mode text not null default 'staff'` and `live_broadcast_grant_mode text` with checks that allow null staff actor IDs only for the explicit `temporary` mode. Existing rows retain `staff` semantics; do not backfill false actor identities.

- [ ] **Step 4: Implement idempotent payment RPC**

The RPC must:

1. Reject non-service roles and null/mismatched ownership.
2. Lock application, profile, and any application payment in canonical order.
3. Require current consent receipts.
4. Return `{ "state": "completed" }` for an existing exact temporary captured payment.
5. Insert one captured `10000 INR` payment with deterministic identifiers `temporary_order_<application UUID without hyphens>` and `temporary_payment_<application UUID without hyphens>`.
6. Set application status to `kyc_pending`, `completion_deadline` to database time plus 30 days, and add a metadata-safe `reporter.temporary_payment_completed` audit event.

- [ ] **Step 5: Implement idempotent KYC/approval RPC**

The RPC must lock application → payment → profile, verify the exact temporary captured payment, and use the declared legal name only after the existing adult/date constraints. It records `kyc_provider='temporary'`, a deterministic `temporary_<application UUID>` reference, verified name/adult/timestamps, `review_mode='temporary'`, and application approval timestamps.

Insert the reporter profile with one-year membership plus seven-day grace, `can_publish_directly=false`, `can_broadcast_live=true`, explicit temporary grant/verification modes, and access sync `{ status: 'pending', operation: 'approval', generation: 1, desired_role: 'reporter' }`. Update `profiles.role='reporter'`, credit the payment membership dates, and write `reporter.temporary_application_approved`. Exact retries return the existing profile/generation without duplicating rows or audit events.

- [ ] **Step 6: Implement service-only access synchronization CAS RPCs**

Mirror the existing claim/complete generation fencing for only `access_sync_operation='approval'` and `access_sync_desired_role='reporter'`. Claim returns one of:

```json
{"state":"claimed","profile_id":"85000000-0000-4000-8000-000000000001","generation":1,"claim_token":"85000000-0000-4000-8000-000000000002"}
{"state":"busy","generation":1}
{"state":"succeeded","generation":1}
```

Completion accepts only the exact generation/token and returns `succeeded`, `failed`, `stale`, or `expired`. Failure detail is either null or `auth-claim-update-failed`; never store provider exceptions.

- [ ] **Step 7: Lock down privileges and update generated contracts**

Revoke every new RPC from `public, anon, authenticated, service_role`, then grant execute only to `service_role`. Update `Database` table rows/inserts/updates and function argument/return contracts in `packages/database/src/database.types.ts`.

- [ ] **Step 8: Verify migration contracts GREEN**

Run: `npm test -- src/features/application/temporary-onboarding.persistence.test.mjs src/features/application/reporter-schema.contract.test.mjs src/features/application/future-migrations.contract.test.mjs`

Expected: PASS.

- [ ] **Step 9: Add rollback-only SQL verification**

Extend `reporter-lifecycle-verification.sql` with fixed UUID fixtures inside its existing transaction. Call payment twice and assert one payment/audit, call KYC approval twice and assert one reporter profile/audit, assert `can_publish_directly=false`, `can_broadcast_live=true`, one-year plus seven-day dates, then roll back.

- [ ] **Step 10: Validate locally before remote mutation**

Run the smallest available real PostgreSQL check: `supabase db reset --local` if local Supabase is running; otherwise start it with `supabase start`, reset, and run `supabase db lint --local --schema public,private --level error --fail-on error`.

Expected: all migrations apply and lint exits 0.

- [ ] **Step 11: Commit**

```bash
git add supabase/migrations/20260824170000_temporary_reporter_onboarding.sql supabase/verification/reporter-lifecycle-verification.sql packages/database/src/database.types.ts reporter/src/features/application/temporary-onboarding.persistence.test.mjs reporter/src/features/application/future-migrations.contract.test.mjs
git commit -m "feat(reporter): add temporary onboarding persistence"
```

---

### Task 4: Temporary onboarding service and controls

**Files:**
- Create: `reporter/src/features/application/temporary-onboarding.service.ts`
- Create: `reporter/src/features/application/temporary-onboarding.service.test.mjs`
- Create: `reporter/src/features/application/temporary-onboarding.actions.ts`
- Create: `reporter/src/features/application/temporary-onboarding-controls.tsx`
- Create: `reporter/src/features/application/temporary-onboarding-ui.contract.test.mjs`
- Modify: `reporter/src/features/application/application.repository.ts`
- Modify: `reporter/src/features/application/application-status.tsx`
- Modify: `reporter/src/app/(protected)/application/page.tsx`

**Interfaces:**
- Produces: `completeTemporaryPayment(profileId, applicationId): Promise<void>`
- Produces: `completeTemporaryKycAndApproval(profileId, applicationId): Promise<void>`
- Produces Server Actions returning `{ status: "idle" | "success" | "error"; message?: string }`
- Consumes the four RPCs from Task 3 and `admin.auth.admin.updateUserById`.

- [ ] **Step 1: Write failing service tests for ordered synchronization**

```js
test("temporary approval updates Auth claims then records exact sync success", async () => {
  const events = [];
  const service = createTemporaryOnboardingService({
    completePayment: async () => ({ state: "completed" }),
    approve: async () => ({ profileId: "user-1", generation: 1 }),
    claimSync: async () => ({ state: "claimed", profileId: "user-1", generation: 1, claimToken: "claim-1" }),
    getAuthMetadata: async () => ({ plan: "preview" }),
    updateAuthClaims: async (id, metadata) => events.push(["auth", id, metadata]),
    completeSync: async (input) => { events.push(["complete", input]); return { state: "succeeded", generation: 1 }; },
    refreshSession: async () => { events.push(["refresh"]); },
  });
  await service.completeKycAndApproval("user-1", "application-1");
  assert.deepEqual(events.map(([name]) => name), ["auth", "complete", "refresh"]);
  assert.deepEqual(events[0][2], { plan: "preview", role: "reporter", reporter_access_generation: 1 });
  assert.equal(events[1][1].succeeded, true);
});

test("Auth claim failure records a retryable safe failure", async () => {
  let completion;
  const service = createTemporaryOnboardingService({
    completePayment: async () => ({ state: "completed" }),
    approve: async () => ({ profileId: "user-1", generation: 1 }),
    claimSync: async () => ({ state: "claimed", profileId: "user-1", generation: 1, claimToken: "claim-1" }),
    getAuthMetadata: async () => ({}),
    updateAuthClaims: async () => { throw new Error("provider detail"); },
    completeSync: async (input) => { completion = input; return { state: "failed", generation: 1 }; },
    refreshSession: async () => { throw new Error("must not refresh failed sync"); },
  });
  await assert.rejects(() => service.completeKycAndApproval("user-1", "application-1"), /unavailable/u);
  assert.deepEqual(completion, { profileId: "user-1", generation: 1, claimToken: "claim-1", succeeded: false, failureDetail: "auth-claim-update-failed" });
});
```

- [ ] **Step 2: Run service tests and verify RED**

Run: `npm test -- src/features/application/temporary-onboarding.service.test.mjs`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Add repository adapters**

Add typed wrappers for each Task 3 RPC. Validate every JSON result as an object, exact state, safe integer generation, matching profile, and UUID claim token. Convert database errors to the existing generic `ApplicationRepositoryError`.

- [ ] **Step 4: Implement the service**

`completePayment` delegates once to its repository. `completeKycAndApproval` calls approval, claims access sync, and:

- refreshes the cookie-backed Supabase session and returns for `succeeded`;
- reports `busy` as retryable unavailable;
- for `claimed`, obtains current `app_metadata` with `admin.auth.admin.getUserById`, preserves unrelated keys, writes `role: "reporter"` and `reporter_access_generation: generation`, completes the exact claim, then calls `createClient().auth.refreshSession()` so the current cookies carry the new claims;
- on Auth failure, attempts exact failed completion with `auth-claim-update-failed` and throws a generic retryable error.

- [ ] **Step 5: Verify service tests GREEN**

Run: `npm test -- src/features/application/temporary-onboarding.service.test.mjs`

Expected: PASS.

- [ ] **Step 6: Write failing action/UI contract tests**

Assert actions call `requireReporterSession`, require applicant state and matching current application ownership, reject when the flag is off, and revalidate `/application` or redirect `/dashboard`. Assert temporary controls render only for `draft/payment_pending/kyc_pending`, label buttons `Complete dummy ₹100 payment` and `Complete dummy KYC`, disable while pending, and announce errors.

- [ ] **Step 7: Run action/UI tests and verify RED**

Run: `npm test -- src/features/application/temporary-onboarding-ui.contract.test.mjs`

Expected: FAIL because actions and controls do not exist.

- [ ] **Step 8: Implement Server Actions and controls**

The payment action requires owned `draft` or `payment_pending`; the KYC action requires owned `kyc_pending`. Both fail closed unless `env.server.temporaryOnboarding`. Use `useActionState` controls with explicit client-preview copy. On approval success, call `redirect("/dashboard")`; outside temporary mode render the existing `ReporterCheckout` and hosted KYC controls unchanged.

- [ ] **Step 9: Verify application changes**

Run: `npm test -- src/features/application && npm run typecheck`

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add reporter/src/features/application reporter/src/app/'(protected)'/application/page.tsx
git commit -m "feat(reporter): complete dummy onboarding flow"
```

---

### Task 5: Prove story and live approvals remain enforced

**Files:**
- Modify: `reporter/src/features/submissions/submission.service.test.mjs`
- Modify: `reporter/src/features/live/live-request.service.test.mjs`
- Modify: `reporter/src/features/live/live-session.service.test.mjs`
- Modify: `reporter/src/features/application/temporary-onboarding.persistence.test.mjs`

**Interfaces:**
- Consumes: approved reporter state from Task 3.
- Produces: no production interface; regression evidence only.

- [ ] **Step 1: Add story regression test**

Create an approved temporary reporter fixture and assert ordinary `submitForReview` returns/records the review path, not direct publication. Mutation check: setting `can_publish_directly=true` would change the branch, while the actual temporary RPC leaves it false.

- [ ] **Step 2: Add live regression tests**

Assert `canBroadcastLive=true` permits request creation, but session authorization rejects a pending request and accepts only an approved request whose current time lies within `approvedStartsAt <= now < approvedEndsAt`.

- [ ] **Step 3: Run focused tests and verify behavior**

Run: `npm test -- src/features/submissions/submission.service.test.mjs src/features/live/live-request.service.test.mjs src/features/live/live-session.service.test.mjs src/features/application/temporary-onboarding.persistence.test.mjs`

Expected: PASS; no application code change should be necessary. If a test exposes a bypass, stop and fix only the shared authorization boundary before continuing.

- [ ] **Step 4: Commit test evidence**

```bash
git add reporter/src/features/submissions/submission.service.test.mjs reporter/src/features/live/live-request.service.test.mjs reporter/src/features/live/live-session.service.test.mjs reporter/src/features/application/temporary-onboarding.persistence.test.mjs
git commit -m "test(reporter): preserve editorial and live approvals"
```

---

### Task 6: Remote migration, deployment, and end-to-end verification

**Files:**
- Modify only if verification finds an in-scope defect.
- Local-only: `reporter/.env.local`
- Vercel preview environment: add only `REPORTER_TEMPORARY_ONBOARDING=true` plus the already filtered reporter secrets.

**Interfaces:**
- Validates the complete user journey and linked Supabase project `uoykitlsdawvpqfjeuqm`.

- [ ] **Step 1: Run the complete local verification gate**

Run:

```bash
cd reporter
npm test
npm run typecheck
npm run build
cd ..
git diff --check
```

Expected: all tests pass, typecheck/build exit 0, no whitespace errors.

- [ ] **Step 2: Preflight the linked database**

Run:

```bash
supabase db push --linked --dry-run
supabase db lint --linked --schema public,private --level error --fail-on error
supabase db advisors --linked --type security --level error
```

Expected: exactly `20260824170000_temporary_reporter_onboarding.sql` pending; lint exits 0. Review the four already accepted owner-executed public projection view findings separately and reject any new advisor error.

- [ ] **Step 3: Apply the authorized migration**

Run: `supabase db push --linked --yes`

Expected: migration `20260824170000` applies once. If any statement fails, stop, diagnose from PostgreSQL evidence, write a failing regression, and resume only after the root cause is fixed.

- [ ] **Step 4: Verify remote schema and privileges**

Run migration parity and a read-only query asserting all four RPCs exist, all have service-role execute, anon/authenticated do not, `payment_provider/review_mode` columns exist, and no temporary reporter has `can_publish_directly=true`.

Run database lint and security advisors again; accept no new finding.

- [ ] **Step 5: Configure and deploy a Vercel preview**

Use the Vercel deployment skill. Set `REPORTER_TEMPORARY_ONBOARDING=true` only for Preview, never Production. Deploy `reporter`, wait for Ready, and confirm project protection permits the client URL.

- [ ] **Step 6: Browser walkthrough**

Using the QA/browser skill, complete:

1. New Indian mobile + `1234` sign-in.
2. Application and all consents.
3. Dummy ₹100 payment.
4. Dummy KYC and automatic application approval.
5. Reporter dashboard session refresh.
6. New story save and submit; verify it shows under review, not published.
7. Live request submit; verify studio remains unavailable until CMS approval.
8. Approve the live request in CMS, then verify the studio opens only inside its approved window.
9. Refresh and sign back in with the same mobile + `1234`.

Use synthetic client-approved data only. Do not enter real Aadhaar, payment, or private identity data.

- [ ] **Step 7: Final fresh verification and commit any QA-only fix**

After any fix, rerun the affected focused test, full `npm test`, `npm run typecheck`, `npm run build`, database lint, migration dry-run, and browser path. Confirm `git status --short` is clean and `supabase db push --linked --dry-run` says the remote database is up to date.
