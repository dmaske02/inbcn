# Phase 1 database schema

The baseline migration is stored in
`supabase/migrations/20260730000000_phase_1_schema.sql`.

## Tables

- `languages` defines supported editorial languages and their native labels.
- `categories` stores localized, hierarchical content categories.
- `sources` records API, RSS, website, social, and manually managed news
  origins, including a localized fallback category for ingestion.
- `profiles` extends Supabase Auth users with an application identity, preferred
  language, and one of the approved editorial or reader roles.
- `stories` is the central multilingual publishing record. It supports
  aggregated, staff, and citizen content; translation groups; editorial review;
  scheduling; publication; external provenance; flags; and SEO overrides.
- `media` is the canonical Cloudinary-backed asset table. Assets may originate
  from a story or exist independently for reuse. Phase 5 promotes `title`,
  `original_filename`, and `credit` from legacy JSON metadata into normalized
  columns while retaining the JSON object for backward compatibility.
- `ingest_runs` records ingestion lifecycle state, counts, errors, and source
  provenance.
- `push_subscriptions` stores Web Push endpoints for authenticated or anonymous
  readers.
- `reporter_applications` stores one active onboarding application per profile,
  minimal hosted-KYC results, the 30-day paid-completion deadline, and the
  admin decision. It never stores provider payloads or identity artifacts.
- `reporter_profiles` stores approved public identity, locality, membership
  dates, the two independent trust grants, and public-photo verification.
- `reporter_payments` stores fixed INR 100 application and renewal receipts,
  unique Razorpay identifiers, refund state, and the membership period credited.
- `reporter_consents` stores immutable, versioned notice receipts by application,
  notice key, version, and locale.
- `webhook_events` stores unique provider receipts and safe processing state for
  idempotent Razorpay, hosted-KYC, and LiveKit callback handling. LiveKit
  receipts bind the immutable event UUID/type to one exact Egress ID without
  retaining the provider body, authorization, error, or location.
- `reporter_notifications` stores in-app notifications and optional delivery
  state without coupling delivery success to the underlying business event.
- `audit_events` stores append-only, safe actor/action/subject metadata for
  security and reporter lifecycle transitions.
- `reporter_live_requests` stores private reporter-proposed broadcasts and the
  per-request admin decision, approved window, DB-derived room, and termination.
- `live_recordings` stores private LiveKit Egress recording segments, output
  facts, private provider metadata, replay fields, retention deadline, and hold.
  Provider starts use service-only UUID claims and a five-minute DB lease; a
  partial unique index allows only one pending/recording segment per request.
  A service-only final authorization rechecks current reporter/request access
  and durable recording state immediately before publisher token issuance.
- `live_recording_editorial_private` stores one immutable bounded rejection
  reason per rejected recording for active editor/admin review only.
- `live_recording_legal_hold_events` stores an append-only event for each
  actual legal-hold state change, including the admin actor, new state,
  bounded private reason, and database clock. Private reasons and actors never
  enter generic audit metadata or public data.
- `public_live_replays` is the closed-by-default publication projection with
  only replay, request, category, thumbnail, duration, and publication facts.
  It contains no storage key, provider field, profile/account UUID, private
  reason, signed URL, or exact location. A later task owns anonymous exposure.

## Reporter foundation

`supabase/migrations/20260822090000_reporter_foundation.sql` adds the `reporter`
profile role and the reporter onboarding relations. Application and renewal
payments are constrained to `10000` paise and `INR`; provider order, payment,
refund, event, and non-null hosted-KYC references are unique. Pending and
verified KYC states require the provider/reference pair, while unstarted drafts
may keep both null. Partial indexes enforce one active application per profile
and support admin, expiry, incomplete-application, refund, and webhook queues.

`approve_reporter_application`, `reject_reporter_application`, and
`apply_reporter_payment` own the row-locked decision and capture transitions.
`mark_overdue_reporter_application` atomically cancels a still-incomplete paid
application at or after its 30-day deadline and queues its captured payment for
refund. It accepts only the application ID and derives the transition time from
PostgreSQL's clock, so the service caller cannot choose the eligibility time.
First approval starts membership at approval, expires it one year later, and
adds seven days of grace. Rejection and overdue processing queue refund
eligibility in PostgreSQL; external Razorpay calls remain outside the database.
`supabase/migrations/20260822100000_razorpay_payment_lifecycle.sql` adds leased,
atomic order creation and Razorpay webhook/refund transitions. Order creation
temporarily uses `order_creating`, enforces the six current persisted consent
versions, and prevents concurrent active orders. Webhook receipts are claimed
before business processing and may be reclaimed after a five-minute failed or
abandoned lease. Refund requests keep `refund_pending` until an exact signed
Razorpay `refund.processed` event confirms the payment ID, refund ID, `10000`
paise amount, and `INR` currency.

Renewal paid before or through the inclusive seven-day grace boundary extends
one calendar year from the prior expiry and preserves the original membership
start. Payment after grace starts a new membership at the provider capture
time. Signed Razorpay event time is authoritative for webhooks; verified
payment-entity `created_at` is the API reconciliation fallback. The first
verified capture wins and cannot be shifted by later delivery. The capture
function remains the single atomic owner of payment, application/membership,
deadline, and audit changes.

`supabase/migrations/20260822140000_reporter_foundation_final_hardening.sql`
removes authenticated Data API writes to applications and consent receipts.
Authenticated owners retain safe reads, while validated reporter Server Actions
write through the server-only service-role client. Database constraints mirror
the calendar-age, field-length, beat, and Cloudinary portrait-provenance
boundaries.

`public_reporter_profiles` exposes only public slug, verified legal display
name, approved avatar, public status, district, bio, beats, and published-story
count. The count includes only citizen reports with reporter-profile or
immutable-revision provenance; legacy writer/admin citizen reports are not
attributed to a reporter. Date of birth, KYC references, payment identifiers,
consent receipts, review notes, city/state, and trust controls remain in private
base tables.

`supabase/migrations/20260822160000_reporter_live_recording.sql` keeps the
existing `live_streams` channel model unchanged. A live request may receive one
DB-derived approved room and many recording segments. Egress IDs are unique
when present. Lifecycle triggers own recording transition timestamps and assign
terminal private/rejected recordings a 90-day `retention_delete_at`; published
recordings receive no deadline and `legal_hold` excludes a row from the queue.
Storage keys, provider errors, supporting notes, and private metadata remain
base-table-only fields.

## Design notes

- Story slugs are unique within a language.
- A story and its category must use the same language.
- Translation variants share a `translation_group_id`.
- External source records use restrictive deletion so published provenance and
  ingestion history cannot be orphaned.
- Profile deletion cascades from `auth.users`; authored and approved story
  history is retained by setting profile references to `null`.
- `stories.featured_media_id` references reusable `media.id` values. Deleting a
  featured media row clears the Story reference; deleting an originating Story
  clears nullable `media.story_id` without deleting the reusable media row.
- Active media has `deleted_at is null`. The `deleted_at` and `deleted_by`
  fields establish retirement metadata for later lifecycle work; Milestone 1
  only excludes retired rows from active library queries.
- `media.updated_by` and `media.deleted_by` reference `profiles` with
  `ON DELETE SET NULL`, preserving media records when a profile is removed.
- The active-library index orders by media type, retirement state,
  `created_at desc`, and `id desc`. No search extension or search index is added
  in Milestone 1 because the existing multi-field `ilike` query has not yet
  been measured against representative production-scale data.
- `updated_at` is application-managed because Phase 1 intentionally defines no
  database triggers or functions.
- Row Level Security, policies, seed data, and application integrations are
  intentionally outside this migration.
- Reporter statuses and fixed fee/currency rules are database constraints.
  Hosted-KYC storage is limited to the provider key, opaque reference, minimal
  result, verified legal name/adult outcome, and timestamps. Aadhaar numbers,
  OTPs, XML, identity images, and full provider payloads are not schema fields.
