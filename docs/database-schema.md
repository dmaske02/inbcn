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
  idempotent Razorpay, hosted-KYC, and LiveKit callback handling.
- `reporter_notifications` stores in-app notifications and optional delivery
  state without coupling delivery success to the underlying business event.
- `audit_events` stores append-only, safe actor/action/subject metadata for
  security and reporter lifecycle transitions.

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
Renewal extends from the prior expiry through grace, or starts from capture
after grace.

`public_reporter_profiles` exposes only public slug, verified legal display
name, approved avatar, public status, district, bio, beats, and published-story
count. Date of birth, KYC references, payment identifiers, consent receipts,
review notes, city/state, and trust controls remain in private base tables.

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
