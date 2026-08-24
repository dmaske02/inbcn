# Temporary Reporter Onboarding Design

## Goal

Let client-preview users complete the reporter journey with real Supabase accounts and reporter data while mobile OTP, Razorpay, and Aadhaar KYC providers are unavailable.

The temporary journey is:

1. Sign up or sign in with an Indian mobile number and the fixed code `1234`.
2. Submit the existing reporter application and consent form.
3. Complete a clearly labelled dummy ₹100 payment.
4. Complete clearly labelled dummy KYC.
5. Receive automatic application approval and reporter access.
6. Write and submit stories through the existing editorial workflow.
7. Request a live window through the existing CMS approval workflow, then broadcast only during an approved window.

Story publication and live-window approval remain staff decisions. Automatic approval applies only to the reporter application.

## Deployment Boundary

Temporary onboarding is enabled only when a server-side `REPORTER_TEMPORARY_ONBOARDING=true` flag is present and the runtime is not a Vercel production deployment. The application must reject the configuration when `VERCEL_ENV=production`.

The fixed OTP is verified only by server code. Provider-backed OTP, Razorpay, and KYC endpoints remain unchanged so they can be enabled later without replacing the temporary implementation. The UI must identify every simulated step as temporary; it must never claim that money or identity evidence was processed by a real provider.

## Authentication

The temporary authentication service accepts only valid Indian E.164 mobile numbers and the exact code `1234`. It uses the Supabase service role to create a confirmed phone user when none exists, then establishes a normal Supabase session for that user. The same code permits returning users to sign in while temporary mode is enabled.

This deliberately weak sign-in method is limited to local and preview environments. It must not share a callable path with production deployments, and errors must not reveal whether an arbitrary phone number already exists.

## Dummy Payment, KYC, and Approval

New service-role-only database RPCs perform these transitions using the current reporter state machine:

- Dummy payment records ₹100 as captured with an explicit temporary provider identity and advances the owned application to KYC pending.
- Dummy KYC stores simulated verification evidence, the application's declared legal name as the verified legal name, and advances the application to review.
- Automatic approval reuses the existing membership and access-sync invariants, grants reporter access for one year plus the existing seven-day grace period, and enables permission to request live broadcasts.

Each transition locks the owned application and related payment/profile rows, validates the expected previous state, writes an audit event with no private identity data, and returns the existing result on retry. Dummy provider identifiers must be namespaced and unique so they cannot be mistaken for Razorpay or future KYC receipts.

Access-claim synchronization remains mandatory. The server completes the existing database and Supabase Auth role synchronization before redirecting the user to the reporter dashboard.

## Reporter Workflows

Approved temporary reporters use the existing protected application:

- Story drafts use existing persistence, location evidence, media completion, and submission RPCs.
- Ordinary story submissions enter editorial review. Existing direct-publication trust remains disabled unless a CMS administrator grants it separately.
- Reporters may submit live requests because temporary approval enables live-request eligibility.
- A live request still requires CMS approval and a bounded approved time window before LiveKit authorization succeeds.
- LiveKit recording and replay review continue through the existing recording lifecycle.

No temporary flag is consulted by story publication, direct-publication, live-window approval, recording, or replay publication authorization.

## User Interface

The login screen changes to a mobile-number and code flow when temporary mode is enabled and explains that the client-preview code is `1234`.

The application status screen replaces unavailable provider controls with two explicit actions: `Complete dummy ₹100 payment` and `Complete dummy KYC`. Successful KYC completion runs automatic reporter approval and redirects to the dashboard after access synchronization. Pending and retry states remain visible, and repeated clicks do not duplicate payments, profiles, memberships, or audit events.

Outside temporary mode, the existing provider-backed UI remains unchanged.

## Error Handling

- Invalid phone numbers or codes return field-safe validation errors.
- Production activation fails closed during environment validation.
- Authentication and onboarding errors return generic messages without leaking service-role or provider details.
- Ambiguous database or Auth synchronization failures remain retryable and never roll back already committed evidence by guessing.
- Story and live authorization failures continue using existing safe error codes.

## Verification

Implementation follows test-first development and must cover:

- environment gating and production rejection;
- new and returning temporary mobile authentication with `1234`;
- rejection of any other code;
- idempotent dummy payment, dummy KYC, approval, membership, and access synchronization;
- story submission still entering CMS review;
- live requests still requiring CMS approval and an active approved window;
- temporary paths being unavailable when the flag is off;
- the full reporter test suite and TypeScript typecheck;
- Supabase migration parity, database lint, security advisor review, and focused live schema checks;
- a browser walkthrough from signup through story submission and live-request submission.

## Deferred Provider Work

Real mobile OTP, Razorpay capture/refunds, and Aadhaar KYC remain deferred. Enabling them later removes the temporary flag and uses the existing provider boundaries; it does not change editorial or live approval rules.
