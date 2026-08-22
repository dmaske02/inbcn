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
- `reporter_applications`: applicants can read only their own rows. Creation and
  mutation run through authenticated, validated reporter Server Actions and the
  server-only service-role repository. Payment, KYC, review, decision, photo
  provenance, and refund fields are server-controlled. Admins can read the
  review queue.
- `reporter_profiles` and `reporter_payments`: reporters/applicants can read
  only their own private membership and receipts; admins can read all rows.
- `reporter_consents`: applicants can read only their own immutable receipts;
  validated server actions persist current notice versions with server-owned
  receipt timestamps. Admins can read them.
- `webhook_events` and `audit_events`: admins have read-only access. The service
  role may insert webhook receipts and update only processing/result columns;
  provider, event, signature, and creation identity cannot be changed or deleted.
  Audit access is append-only (`SELECT`/`INSERT`) for the service role.
- `reporter_notifications`: reporters read their own rows and may update only
  `read_at`; notification creation and delivery state are server-controlled.
- `story_revisions`: authenticated reporters may read only their own immutable
  snapshots after the database-active reporter profile, membership window,
  access-sync state, signed role, and signed generation all match. Active editor
  and admin profiles may read revisions; writers cannot. Authenticated clients
  receive no insert, update, or delete grant; final outcomes move only once from
  `pending_review` through guarded database transitions.
- `story_locations`: authenticated reporters may read only location evidence
  attached to their own revisions. Exact coordinates are additionally readable
  only by database-active editors/admins; writers and anonymous users have no
  policy or grant. Security-definer transitions own inserts; service operations
  may update only retention/legal-hold fields. A later guarded retention worker
  owns deletion after the one-year due date.
- `media`: active or grace reporters with a synchronized signed generation may
  select only canonical media rows they own. This addition is read-only;
  reporters receive no direct media insert, update, or delete policy. A later
  server-only upload completion flow owns canonical media writes.
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

Reporter story submission functions use the same empty-search-path and row-lock
pattern. Every reporter call rechecks the signed `reporter` role, active database
profile, current access-sync generation, and live membership dates. Review
submission permits active or grace membership; direct publication requires
active membership and `can_publish_directly`. The functions validate an active
language/category relation, reject non-owned or retired canonical media, require
a server-received location captured within 30 minutes, and atomically snapshot,
store private evidence, transition the canonical story, and append coordinate-
free audit metadata.

Reporter story DML is limited to owned, explicitly reporter-provenanced
`citizen_report` drafts. The shared database predicate requires either a
reporter-profile creator or existing immutable reporter revision evidence and
is evaluated against both old and new rows for guarded transitions. Revision
evidence keeps the classification historical even if later membership changes.
Legacy writer/admin citizen reports without either provenance signal continue
through the pre-existing CMS policies and are not given reporter revisions or a
reporter byline. A trigger protects
server-owned identity, lifecycle, publication, origin, promotion, sponsorship,
and timestamp fields, while RLS prevents draft creation/update after membership
or access synchronization becomes invalid. A separate database guard freezes
submitted reporter content and provenance from `pending_review` onward. Every
non-draft state requires a locked latest revision whose snapshot, submitter,
outcome, and ordered canonical media IDs match the story. Draft exit and
changes-request return therefore work only after their owning RPC has written
the matching immutable evidence; terminal reporter stories cannot be restored
to draft. CMS transitions may change only their exact lifecycle fields, use the
database clock for review/publication/audit/retention time, and advance the
latest revision through an explicit monotonic outcome graph. Reporters cannot
create revisions or locations directly and cannot transition a story status
outside the RPCs.

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
  grants. Applicants have no application or consent DML grant/policy path and
  cannot write lifecycle, KYC, payment, trust, portrait, notification-delivery,
  webhook, or audit fields. The service-role key remains server-only.
- Exact latitude, longitude, accuracy, and capture time never appear in a public
  view, anonymous grant, generic audit payload, error, or documentation example.
  Location rows become deletion-eligible one year after publication, editorial
  rejection, or reporter withdrawal, calculated from the database transition
  clock rather than caller-controlled story timestamps; `legal_hold = true`
  excludes them from the retention queue.
- The reporter-provenance predicate returns only a boolean. It is executable by
  anonymous callers because the anonymous public-reporter projection uses it to
  exclude legacy citizen reports from reporter byline counts; its unnamed
  composite argument keeps it out of the standalone RPC surface.
- Storage policies remain outside Phase 1.
