# INBCN Reporter Portal Design

**Date:** 2026-08-22  
**Status:** Product design approved; KYC and SMS vendors require client confirmation  
**Scope:** Architecture and product behavior only. This document does not implement application code, migrations, infrastructure, or vendor accounts.

## Objective

Add a separate mobile-first portal for external field reporters without giving them access to the staff CMS. Anyone aged 18 or older may apply, pay a ₹100 annual fee, complete identity verification, and await admin approval. Approved reporters can submit stories from anywhere. Content is moderated by default; admins may independently trust selected reporters for direct publication and permit selected reporters to request live broadcasts.

The design keeps the existing website and CMS publishing pipeline authoritative. It does not create a second story, media, or live-streaming system.

## Approved Product Decisions

- The reporter portal is a third Next.js workspace and separate Vercel application, expected at `reporter.inbcn.com`.
- Authentication uses mobile OTP through Supabase Auth.
- Applicants must be at least 18 years old.
- Application submission requires a ₹100 Razorpay payment.
- Payment is made manually at application and at each annual renewal; no recurring mandate is used.
- Aadhaar KYC uses a hosted provider flow. The client will choose the provider after compliance and commercial review.
- INBCN never collects or stores Aadhaar numbers, Aadhaar OTPs, raw offline XML, or Aadhaar images.
- All reporters may submit text, photos, recorded video, and detailed current location from anywhere.
- Exact location is private to CMS editors/admins. Public stories show only an editorial locality/city unless an editor deliberately publishes something more precise.
- All submissions require review by default.
- Admins may independently grant `can_publish_directly` and `can_broadcast_live`; both are revocable.
- Every live broadcast requires its own admin approval, even if the reporter has live permission.
- Every approved live broadcast is recorded server-side and remains private until an editor approves replay publication.
- Public article attribution uses the reporter's KYC-verified legal name and a separately captured, identity-verified, admin-approved profile photo.
- Reporter applications, trust permissions, live requests, payments, refunds, recordings, suspension, and publication actions are audited.

## System Architecture

```text
reporter.inbcn.com ─┐
                    ├─ Supabase Auth + PostgreSQL ─ CMS review ─ Public website
cms.inbcn.com ──────┘              │
                                   ├─ Cloudinary story media
                                   ├─ Razorpay payments/refunds
                                   ├─ Hosted KYC provider
                                   └─ LiveKit rooms + Egress recording
                                              │
                                              └─ private S3-compatible storage
```

The monorepo becomes:

```text
website/             public news website
cms/                 staff editorial application
reporter/            external mobile-first reporter portal
packages/database/   generated database types and shared database contracts
packages/domain/     shared domain types and validation where genuinely common
supabase/migrations/ canonical schema, grants, functions, and RLS
```

Each application is deployed independently. They share one Supabase project and the existing canonical content model. The reporter portal uses only reporter-specific server operations and user-scoped Supabase sessions. It never imports privileged CMS server actions or a service-role client.

## Identity, Authentication, and Authorization

### Mobile OTP

- Registration and login use Supabase phone OTP.
- The SMS vendor is a client decision and must support Indian TRAI DLT requirements.
- CAPTCHA, OTP cooldowns, delivery rate limits, and attempt limits protect the public authentication boundary.
- A verified phone session identifies an applicant; it does not itself grant reporter privileges.
- A phone-number change requires OTP verification of the new number and admin review.

### Roles

Applicants remain ordinary authenticated users while their application is pending. Approval changes the database profile and signed `app_metadata.role` to `reporter`. The CMS continues accepting only `writer`, `editor`, and `admin`, so a reporter session cannot enter staff routes.

Authorization uses both server-side checks and RLS. Role and trust flags are server-controlled; the browser cannot mutate them. New public tables receive explicit Data API grants rather than relying on defaults.

### Trust permissions

The reporter record owns two independent boolean capabilities:

- `can_publish_directly`
- `can_broadcast_live`

Admins alone grant or revoke these capabilities. Membership state gates their effect: both are disabled during grace, expiry, or suspension even if the stored grant remains true. Paying a valid renewal restores a still-granted capability; an admin may revoke it at any time.

## Application and Membership Lifecycle

```text
draft
  → payment_pending
  → kyc_pending
  → under_review
  → approved
      → grace_period
      → expired
  ↘ rejected → refund_pending → refunded
  ↘ abandoned after 30 days → refund_pending → refunded

Any approved account may become suspended by admin action.
```

1. The applicant signs in with mobile OTP and completes the 18+ application.
2. The backend creates a ₹100 Razorpay Order. The application cannot be submitted without a captured payment.
3. The backend verifies the Checkout signature, while the signed webhook remains the authoritative asynchronous confirmation.
4. The applicant is redirected to the selected hosted KYC provider.
5. A signed KYC callback records only the provider reference, result, timestamps, verified legal name, verified age outcome, and the minimum approved profile data.
6. An admin approves or rejects the application.
7. Approval starts a one-year membership from the approval date.
8. Rejection triggers a full Razorpay refund.
9. A paid application not completed within 30 days is cancelled and fully refunded after reminders.
10. Once approved, the fee is non-refundable except for duplicate charges or payment errors. Suspension for misconduct does not create a refund.

### Manual renewal

- The portal sends reminders before expiry.
- Renewal uses a new Razorpay Order; no subscription or mandate is created.
- A renewal paid before expiry extends membership by one year from the existing expiry.
- Payment during the seven-day grace period also extends from the previous expiry.
- Payment after grace starts a new one-year period from the successful payment date.
- During grace, reporters may create and submit ordinary reviewed content, but cannot publish directly or broadcast live.
- After grace, the portal becomes read-only except for renewal, receipts, account support, and access to prior work.
- Suspended reporters cannot submit, broadcast, direct-publish, or purchase renewal until reinstated.

### Money safety

Razorpay callback signatures are verified on the server. Provider event IDs and payment identifiers are unique, so duplicate webhook delivery cannot duplicate membership or refunds. Refunds use `refund_pending`, `refunded`, and `refund_failed` states. A failed refund alerts admins and can be safely retried against the same payment.

## KYC Boundary and Client Decision Gate

The portal integrates through a small hosted-flow boundary:

1. Server creates a verification session for an internal application ID.
2. Browser redirects to the provider's hosted page.
3. Provider redirects the browser back for user experience only.
4. A signed server-to-server callback determines the verified state.
5. INBCN stores only the minimal result and provider reference.

The client must select and contract an eligible provider before KYC implementation. Decentro, Signzy, HyperVerge, Surepass, and Protean are candidates for commercial and compliance review; the software does not assume any provider-specific response shape until the selection is made.

Aadhaar verification must be voluntary. The final onboarding policy must provide a viable alternative, such as consented DigiLocker-issued identity documents plus manual admin review. The selected KYC approach and alternative must receive the client's legal/compliance approval before production activation.

## Reporter Public Profile and Attribution

The public profile contains only approved editorial fields:

- KYC-verified legal name
- Admin-approved public profile photo
- `Verified Reporter`, `Former Reporter`, or `Suspended` status
- Home city/district
- Short biography
- Preferred reporting beats
- Published article history

The legal name and approved photo appear on every public reporter article. Applicants must receive a clear notice before payment and KYC that these fields will be public. Phone number, date of birth, address, payment data, KYC metadata, review notes, and exact coordinates are never part of the public profile.

The public portrait is a separate reporter-supplied image, not a retained Aadhaar/KYC artifact. The chosen KYC process or an admin identity check must establish that it depicts the verified applicant before approval.

Expiry, suspension, or departure does not erase historical attribution. Previously published stories retain the reporter name and photo, while the profile status changes. Any exceptional removal from published journalism requires editorial and legal review.

## Story Submission Workflow

The reporter portal reuses `stories`, `media`, `languages`, `categories`, and the current CMS workflow.

### Supported content

- English, Hindi, and Marathi
- Headline
- Summary
- Article body
- Category and reporting beat
- Event date/time
- Mandatory captured location
- Public locality/city
- Private supporting/editorial notes
- Photos
- Recorded video

The portal creates `citizen_report` stories, not staff articles. Reporter rows retain their reporter identity through `created_by` and public byline resolution.

### Drafts and uploads

Text drafts auto-save locally on the phone and synchronize to Supabase when online. This provides draft recovery, not a speculative full offline synchronization engine. Media uses short-lived signed Cloudinary uploads with server-side validation and a persisted media row only after upload confirmation. Failed uploads remain retryable and cannot silently disappear.

The browser requests current geolocation at submission. Latitude, longitude, accuracy, and capture time are mandatory. Denial, stale coordinates, or capture failure leaves the item as a draft and explains how to retry. The reporter also supplies or confirms the human-readable locality that editors may change.

### Review states

```text
draft → submitted → pending_review → approved/published
                         ↘ changes_requested → new submitted revision
                         ↘ rejected

A reporter may withdraw before publication.
```

Every submitted version is immutable in `story_revisions`. A changes request creates a new editable revision while preserving the reviewed version. Reporters cannot silently modify a published story. Editors may correct, return, reject, publish, archive, or unpublish content and must record a reason for adverse actions.

For a reporter with an effective direct-publication grant, the server validates current membership and the grant, snapshots the revision, and transitions the story directly to published. This bypasses the queue but not validation, attribution, audit, editor unpublish authority, or later moderation.

Exact coordinates, private notes, review comments, and unpublished media never enter public story DTOs.

## Live Broadcast Workflow and Recording

### Approval

1. Only an active reporter with `can_broadcast_live` may create a live request.
2. The request includes title, purpose, intended location, expected start, expected duration, and optional supporting notes.
3. An admin approves or rejects the individual request.
4. Approval creates a narrowly scoped, time-limited LiveKit room/session.
5. The reporter sees recording and connection status before entering.
6. Admins monitor the active session and can immediately stop the room and revoke its token.

General live permission never allows an unscheduled or unapproved room. The token grants only the required room and publishing capability and expires around the approved window.

### Server-side recording

LiveKit Room Composite Egress starts with the approved room and records the broadcast independently of the reporter's phone. The output is an MP4 in a private S3-compatible bucket. Successful output metadata is stored in `live_recordings`; an interrupted session may create multiple successful segments rather than discarding completed material.

Recording failure does not automatically terminate the broadcast, but it alerts the active CMS operator. The reporter UI clearly states that the session is being recorded.

Recordings are private by default. An editor supplies public title, description, category, thumbnail, and replay status before publication. Published recordings remain part of the editorial archive. Rejected or never-published recordings are deleted after 90 days unless an admin applies legal hold. Direct bucket URLs are never exposed publicly.

## Data Model

### Existing tables reused

- `profiles`: authenticated identity, legal display name, approved avatar, bio, role, and active state
- `stories`: canonical drafts and published stories
- `media`: canonical photo and recorded-video metadata
- `live_streams`: existing public/live channel model
- `languages`, `categories`: existing editorial classification

### New `reporter_applications`

One current application per applicant, with historical decisions retained through audit:

- applicant profile ID
- application status
- date submitted and 30-day completion deadline
- 18+ declaration and verified-age outcome
- hosted KYC provider key, opaque reference, status, and timestamps
- reviewed by/at, decision reason
- approved at or rejected at

Raw KYC artifacts do not belong in this table.

### New `reporter_profiles`

One row per approved reporter:

- profile ID and public slug
- home city, district, and state
- preferred beats
- public profile status
- membership start, expiry, and grace end
- direct-publication and live-broadcast grants
- grant/revoke actor and timestamp metadata
- public-photo verification actor and timestamp

The two current booleans support fast authorization; `audit_events` preserves their history.

### New `reporter_payments`

One row per application payment or renewal:

- reporter/application relationship
- purpose: `application` or `renewal`
- amount and currency fixed to ₹100/INR for this product version
- Razorpay Order, payment, and refund identifiers
- payment/refund status and timestamps
- membership period credited by the payment
- unique provider identifiers for idempotency

### New `story_locations`

One private row per story submission location:

- story and submitted revision
- latitude and longitude
- accuracy in metres
- device capture timestamp and server receipt timestamp
- public locality/city text
- deletion or legal-hold metadata

Keeping coordinates outside `stories` prevents accidental inclusion in existing public story selects.

### New `story_revisions`

Immutable snapshots of reporter-submitted editorial fields and associated media IDs, with revision number, submitter, submitted time, and review outcome. The canonical `stories` row remains the current CMS/public state.

### New `reporter_live_requests`

Reporter, proposed schedule, purpose, location summary, expected duration, decision, decision reason, approved window, associated LiveKit room, and termination metadata.

### New `live_recordings`

Live request/stream relationship, LiveKit egress ID, private storage key, output status, duration, size, checksum/provider metadata, replay publication state, retention deadline, and legal hold.

### New `audit_events`

Append-only security/editorial audit records with actor, action, subject type/ID, safe structured metadata, request correlation ID, and timestamp. Secrets, Aadhaar data, OTPs, full payment payloads, and exact coordinate values are excluded from generic audit metadata.

### New `webhook_events`

Minimal provider receipt records for Razorpay, the selected KYC provider, and LiveKit: provider, unique event ID, event type, signature-verified timestamp, processing state, attempt count, safe failure detail, and related internal subject. This table provides durable idempotency and replay without placing full sensitive provider payloads in the generic audit log.

### New `reporter_notifications`

One in-app notification row per reporter event, with type, safe message, destination, created/read timestamps, and optional delivery state for critical SMS or browser push. Notification failure never changes the underlying application, payment, editorial, or live state.

### Public reporter projection

A read-only public view exposes only approved legal name, photo, public status, district, bio, beats, public slug, and published work. Public clients cannot select the private base tables.

## RLS and Security Rules

- Applicants can select/update only their own incomplete application fields permitted by its state.
- Reporters can select their own membership, payment receipts, stories, revisions, locations, notifications, and live requests.
- Reporters can insert or update only their own drafts; submitted revisions are immutable.
- Direct publication is a server/database command that rechecks membership and permission atomically. It is not a broad client update policy.
- Reporters never receive access to other reporters' private rows.
- Public users see only published stories, approved replay records, and the safe reporter projection.
- Editors review stories and recordings but cannot grant reporter trust or approve live rooms unless product policy later changes.
- Admins review applications, manage reporter state and trust, approve live requests, terminate rooms, and manage legal hold.
- KYC, Razorpay, LiveKit, Cloudinary signing, refunds, role changes, and scheduled lifecycle jobs run only in authenticated server boundaries with the minimum necessary credentials.
- Payment, KYC, and LiveKit webhook signatures are verified before state changes.
- Role changes update signed `app_metadata`; user-editable metadata is never authorization input.

## Portal Routes

The precise locale route convention will follow the repository's Next.js 16 guidance during implementation. Product surfaces are:

- Login/mobile OTP
- Application and age declaration
- Razorpay payment and receipt
- Hosted KYC handoff and application status
- Reporter dashboard
- Story list, create, and edit
- Submission/revision detail and editorial feedback
- Live request and approved broadcast room
- Recording status
- Notifications
- Public-profile preview
- Membership and manual renewal
- Account/support

The portal is mobile-first and accessible. Camera, video, geolocation, upload progress, validation errors, OTP input, and live controls require explicit labels, keyboard access where applicable, visible focus, and screen-reader status announcements.

## CMS Changes

- Reporter application queue with payment, KYC result, deadline, decision, and refund status
- Reporter directory with membership, public profile, suspension, and trust controls
- Reporter submissions integrated into the existing story review queue
- Revision comparison, review comments, changes requests, rejection, and withdrawal state
- Live-request queue, scheduling, active monitoring, recording status, and emergency termination
- Private recording library with replay publication, legal hold, and retention controls
- Razorpay reconciliation and failed-refund recovery
- Searchable audit history

Only admins approve applications, grant/revoke trust, suspend reporters, and approve individual live sessions. Editors retain ordinary story and recording review responsibilities.

## Notifications

- In-app notifications cover every application, payment, membership, editorial, live, and recording state change.
- SMS is limited to critical events: application approval/rejection, refund, changes requested, live approval/cancellation, expiry, and grace reminders.
- Browser push is optional and requires explicit permission.
- Notification failure never rolls back the authoritative state change; it is recorded for retry and visible to operators.

## Scheduled Lifecycle Job

One daily idempotent scheduled job handles:

- incomplete-application reminders and 30-day cancellation/refund
- renewal and expiry reminders
- transition into seven-day grace
- transition from grace to expired
- retry/alert for pending refunds
- deletion of eligible unpublished recordings after 90 days
- deletion of eligible exact coordinates after one year

Rows are selected by state and due timestamp. Each transition includes a state guard so reruns are harmless. Provider operations use stored unique identifiers. Legal-hold rows are skipped.

## Consent, Privacy, and Retention

Before payment, separate unselected consent notices are presented in English, Hindi, or Marathi for:

- payment, refund, and renewal terms
- KYC purpose and requested information
- public legal name and approved photo
- mandatory precise submission location
- live-broadcast recording
- editorial rules, suspension, and historical attribution

INBCN stores the minimum data required for onboarding, editorial evidence, attribution, payment reconciliation, and security. Reporter phone, exact address, date of birth, exact coordinates, payment data, and KYC metadata are private.

Retention rules approved for this product:

- paid incomplete/rejected application profile and KYC metadata: delete 90 days after refund, except legally required payment/consent/audit records
- exact story coordinates: delete one year after final publication, rejection, or withdrawal unless on legal hold
- rejected or unpublished live recordings: delete after 90 days unless on legal hold
- published stories, attribution, and published recordings: retained as editorial records
- payment, consent, and security records: retained according to the client's final legal/accounting schedule

Reporters receive mechanisms to request access, correction, consent withdrawal, and account closure. Withdrawing Aadhaar consent stops further use and invokes the approved alternative identification path. Removal from already published journalism is an editorial/legal decision, not an automatic account operation.

The client must have counsel confirm the final KYC provider, alternative identification route, consent language, record-retention schedule, privacy notice, terms, tax treatment, and incident process before production launch.

## Error Handling and Operational Behavior

- Application state transitions are explicit and reject invalid transitions.
- Razorpay, KYC, and LiveKit webhooks are idempotent and replayable.
- Local text draft recovery protects field work during network loss.
- Media uploads expose progress and retry; unsuccessful media cannot be submitted as complete.
- Location denial or failure blocks submission without discarding the draft.
- A live recording failure alerts operators but does not automatically end the broadcast.
- Emergency termination closes the room and revokes the reporter's active token.
- Safe structured logs use correlation IDs. Database audit events provide business/security history without storing secrets.
- Version one uses Vercel runtime logs and database audit records; no new monitoring vendor is required.

## Verification Strategy

Minimum automated checks before release:

- membership start/renewal/grace/expiry transitions
- incomplete-application cancellation and refund eligibility
- Razorpay signature verification, webhook idempotency, duplicate payment, and refund retry
- KYC callback signature/nonce/state handling through a provider adapter test contract
- RLS tests proving cross-account isolation and CMS denial
- reporter submission, immutable revision, changes-request, review, direct publish, and unpublish flows
- mandatory location validation and public DTO exclusion of coordinates
- capability grant/revoke and membership gating
- individual live approval, token scope/expiry, emergency termination, egress callback, legal hold, and retention
- public reporter profile and historical attribution states
- daily lifecycle job rerun safety
- mobile end-to-end application, payment, submission, upload, location, renewal, and live flows
- CMS end-to-end application approval, refund, review, suspension, live termination, and recording publication
- accessibility and poor-network testing on representative Android devices

Production verification must use provider sandboxes/test modes before any real payment, KYC, SMS, or broadcast credential is enabled.

## Explicitly Deferred Client Decisions

These are external procurement/compliance choices, not unresolved product behavior:

1. Hosted KYC vendor and its approved non-Aadhaar alternative flow
2. TRAI-DLT-compliant SMS provider for Supabase phone OTP and critical notifications
3. Exact S3-compatible private storage vendor for LiveKit Egress
4. Final legal/accounting retention schedule where statute or company policy controls it

The implementation plan must put these behind deployment configuration and documented activation gates. It must not create fake vendor integrations or accept production traffic without the required decisions and credentials.

## Out of Scope for Version One

- Native iOS or Android applications
- Automatic recurring payment mandates
- Unapproved or spontaneous live broadcasting
- Full offline media synchronization
- Reporter-to-reporter messaging or social networking
- Public display of exact coordinates
- Automated AI moderation, scoring, or trust promotion
- Payroll, commissions, expense reimbursement, or assignments marketplace
- Multiple KYC providers active simultaneously
- A replacement CMS publishing pipeline

## Success Criteria

The feature is ready for controlled production rollout when an adult applicant can pay, complete the client-approved identity flow, receive admin approval, sign in by phone, submit multilingual location-backed media stories, respond to review, renew manually, and appear under their verified legal identity on published content. Trusted permissions must be independently revocable, live sessions must require per-event approval and record reliably, exact locations and identity/payment data must remain private, and all critical state and money transitions must be testable, idempotent, and auditable.

## Primary External References

- [Supabase phone login](https://supabase.com/docs/guides/auth/phone-login)
- [Razorpay Standard Checkout integration](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/)
- [Razorpay payment integration practices](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/best-practices/)
- [UIDAI OVSE registration](https://uidai.gov.in/pu/2-uncategorised/19593-ovse-registration.html)
- [UIDAI OVSE consent and alternative-identification FAQ](https://www.uidai.gov.in/images/FAQ_OVSE.pdf)
- [DigiLocker partner/requester portal](https://api.digitallocker.gov.in/)
- [LiveKit Egress outputs](https://docs.livekit.io/transport/media/ingress-egress/egress/outputs/)
- [LiveKit automatic Egress](https://docs.livekit.io/transport/media/ingress-egress/egress/autoegress/)
- [MeitY DPDP Act commencement notification](https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf)
