# Phase 1 Row Level Security

The policies are defined in
`supabase/migrations/20260730010000_phase_1_rls.sql`.

Application roles are read from the signed `app_metadata.role` JWT claim.
User-editable `user_metadata` is never trusted for authorization. Authentication
provisioning must keep `app_metadata.role` and `profiles.role` synchronized.
Users without an application role claim are treated as readers for self-profile
updates and receive no editorial privileges.

## Access model

- `languages`: anonymous and authenticated users can read enabled languages;
  admins manage all rows.
- `categories`: anonymous and authenticated users can read active categories;
  admins manage all rows.
- `sources`: the public can read active source metadata; editors and admins have
  full CRUD access.
- `profiles`: authenticated users can read and update their own active profile
  without changing their identity or role; admins have full access.
- `stories`: the public can read published stories. Writers can create drafts,
  read all of their own stories, update drafts, and submit them for review.
  After submission, writers can no longer edit them. Editors can read every
  story and perform review, scheduling, rejection, and publication updates.
  Admins have full CRUD access.
- `media`: public visibility requires a published parent story. Writers can
  manage media only on their own drafts. Editors and admins manage all media.
- `ingest_runs`: only editors and admins can access or manage ingestion history.
- `push_subscriptions`: authenticated users manage rows tied to their own
  profile. Admins can additionally read all subscriptions.
- `reporter_applications`: applicants can create, read, and edit only their own
  draft input columns. Payment, KYC, review, decision, and refund fields are
  server-controlled. Admins can read the review queue.
- `reporter_profiles` and `reporter_payments`: reporters/applicants can read
  only their own private membership and receipts; admins can read all rows.
- `reporter_consents`: applicants can insert immutable receipts only for their
  own draft application and read only their receipts; admins can read them.
- `webhook_events` and `audit_events`: admins have read-only access. The service
  role may insert webhook receipts and update only processing/result columns;
  provider, event, signature, and creation identity cannot be changed or deleted.
  Audit access is append-only (`SELECT`/`INSERT`) for the service role.
- `reporter_notifications`: reporters read their own rows and may update only
  `read_at`; notification creation and delivery state are server-controlled.
- `public_reporter_profiles`: anonymous and authenticated users can select the
  deliberately narrow public projection; neither role can select its base table.

## Reporter transition functions

Reporter payment and decision transitions use `SECURITY DEFINER` functions
with an empty fixed search path, fully qualified relations, row locks, explicit
role/state checks, and an audit insert in the same transaction. Approval and
rejection require the signed `app_metadata.role = admin` claim. Payment capture
and 30-day incomplete-application cancellation are executable only by
`service_role`. The overdue transition requires `kyc_pending`, a reached
completion deadline, and a captured, not-yet-refund-eligible payment. It accepts
only the application ID and uses PostgreSQL's clock for both the eligibility
decision and persisted transition timestamps. Payment capture is idempotent for
an exact repeat of an already captured identifier.

The functions never call Razorpay. Rejection changes the captured payment to
`refund_pending`, allowing the server-side refund worker to call Razorpay and
record the eventual provider result separately. The follow-up Razorpay lifecycle
functions are also `service_role`-only, use row locks and compare-and-set lease
tokens, and validate exact provider identifiers, fixed money fields, and expected
states before capture or refund completion. Refund reservation additionally
rechecks that the supplied actor is an active database `admin` profile.

## Security notes

- RLS is enabled on every Phase 1 table.
- Anonymous access has explicit `SELECT` grants only for public-facing data.
- Anonymous writes, profile enumeration, draft access, ingestion access, and
  push-subscription access are denied.
- Authenticated roles receive only row-oriented CRUD grants; `TRUNCATE` is not
  granted.
- The `service_role` retains privileged server-side access and must never be
  exposed to browsers.
- Reporter authorization extends `profile_role` with `reporter`, but still uses
  only the signed `app_metadata.role` claim for user roles. `user_metadata` is
  never consulted.
- Reporter base tables revoke default Data API access before adding explicit
  table/column grants. Applicants cannot write lifecycle, KYC, payment, trust,
  photo-verification, notification-delivery, webhook, or audit fields.
- Storage policies remain outside Phase 1.
