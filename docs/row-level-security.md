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
- `reporter_live_requests`: eligible active reporters can create only their own
  pending requests after a signed-generation, active membership, access-sync,
  and live-trust check. They can read only their own requests, with no direct
  update or delete capability. Active admins and active signed editors may read
  request rows; editors receive no request mutation or unrelated reporter,
  KYC, payment, provider, or private recording-storage access.
- `live_recordings`: there is no anonymous or reporter base-table access.
  Active editors/admins can select only explicit safe review columns; browser
  grants exclude the Egress ID, storage key, provider error, checksum, claim,
  terminal-reconciliation marker, and private metadata. Direct service-role
  recording DML is revoked; service mutations cross guarded functions, and the
  service role cannot set legal hold directly.
  Provider starts use service-role-only reserve/complete/fail/final-authorization
  security-definer RPCs with empty search paths and CAS claims; all other execute
  grants are revoked. Final authorization repeats current ownership, active
  membership/trust/access-generation, request-window, room, and recording checks
  immediately before the server issues a publisher token. Any unresolved
  `unknown` sibling fences reservation and final authorization for the whole
  request; exact provider-confirmed terminal resolution releases that quarantine.
  The one operational quarantine-resolution RPC is also service-role-only,
  locks request before recording, requires exact provider-confirmed terminal
  facts, preserves prior audit evidence, and emits no provider identifier,
  object key, reason, location, or payload in its generic resolution audit.
- `live_recording_editorial_private`: only active signed editors/admins may read
  the immutable bounded rejection reason. Direct inserts, updates, and deletes
  remain revoked; a trigger also rejects mutation after insertion.
- `live_recording_legal_hold_events`: only active signed editors/admins may read
  the safe event columns. Each actual admin hold-state change appends its actor,
  state, private bounded reason, and database time. Direct DML remains revoked
  and an immutable trigger rejects updates/deletes. Exact retries lock and
  compare the latest event; same-state calls with a different reason conflict.
  Publication/rejection/hold RPCs recheck the signed role against the active
  matching profile and row-lock before mutation.
- `public_live_replays`: RLS is enabled and all table privileges are revoked
  from `public`, `anon`, `authenticated`, and `service_role`.
- `public_replays`: anonymous and authenticated roles may select only this
  fixed owner-executed security-barrier view. Its database-time predicate hides
  unpublished, incomplete, held, and expired rows. Base replay, recording, and
  request tables remain closed. The empty-search-path
  `get_public_replay_storage_key` function is executable only by `service_role`,
  reuses the current public projection, and returns only a canonical MP4 key.

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

The authenticated `save_reporter_story_draft` function is the only reporter
path that changes canonical draft fields or `media.story_id` ordering. It
rechecks the same profile, signed generation, active-or-grace membership,
ownership, explicit reporter provenance, draft state, current classification,
and completed canonical media facts in one transaction. Reporter RLS remains
read-only on `stories` and `media`, so callers cannot bypass the function with
direct draft or media-association DML. Existing writer/editor/admin story
policies remain available to their signed CMS roles. The function persists
canonical event time with a five-minute future-clock allowance but writes no
revision, location, audit coordinate, or lifecycle field. Public submit/direct
functions then read that event time from the locked story; their older
event-argument implementations are ungranted internal functions.

The shared reporter-story predicate requires either a reporter-profile creator
or existing immutable reporter revision evidence and is evaluated against both
old and new rows for guarded transitions. Revision evidence keeps the
classification historical even if later membership changes. Legacy
writer/admin citizen reports without either provenance signal continue through
the pre-existing CMS policies and are not given reporter revisions or a
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

Live approval, rejection, termination, and legal hold are separate
empty-search-path `SECURITY DEFINER` functions. Every command requires both the
signed `app_metadata.role = admin` claim and an active matching database admin.
Approval locks the request and rechecks the target reporter's active (not grace)
membership, active profile, synchronized reporter role, and live trust grant;
the general grant never creates an unapproved room. Audit metadata and reporter
notifications contain only safe status facts, not provider identifiers,
storage keys, notes, or decision/termination reasons.

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
