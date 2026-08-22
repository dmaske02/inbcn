# Task 3 implementer report

Status: `DONE_WITH_CONCERNS`

## Outcome

Implemented the smallest signed direct-to-Cloudinary upload lifecycle for
reporter-owned editable drafts. Both routes authenticate through the reporter
server boundary and the upload service independently reloads current JWT
claims, profile/access-sync generation, membership, reporter provenance, story
ownership, and true reporter-draft state before signing or completing.

The server owns a version-four UUID public ID under
`inbcn/reporter/story/<profile>/<story>/<object>`, signs only fixed upload
parameters with `overwrite=false`, and never returns the API secret or service
key. Completion verifies the original signed intent, reloads the immutable
asset through Cloudinary's authenticated `resource_by_asset_id` Admin API, and
revalidates exact asset/public IDs, resource and delivery types, format, bytes,
dimensions or duration, secure Cloudinary URL, and provider creation time.

The browser uploader supports the exact image/video allowlists and caps,
accessible progress, cancellation, retry without losing the selected file,
and safe completion retry after an ambiguous persistence failure. Files at or
below 100 MiB use one direct browser upload; larger accepted videos use 20 MiB
Cloudinary chunks with a stable upload ID and exact content ranges, so the
250 MiB cap is not buffered through Next.js.

## Atomic canonical completion

Added `20260822152000_reporter_media_completion.sql` and the matching manual
database RPC type. The security-definer completion owner:

- preserves the established reporter-profile/profile/story lock order;
- repeats live access-generation, active-or-grace membership, ownership,
  provenance, draft-state, source, allowlist, byte, and metadata checks;
- inserts verified media unattached (`story_id = null`) so Task 2 remains the
  sole owner of atomic story-media association and ordering;
- permanently binds the reporter upload path to its origin profile/story via a
  table constraint;
- uses existing unique public ID plus a partial unique expression index on
  immutable Cloudinary `asset_id` metadata, `ON CONFLICT DO NOTHING`, and a
  locked exact-fact comparison for idempotency;
- therefore makes concurrent completions with the same asset ID but different
  public IDs conflict instead of racing through an `EXISTS` precheck;
- revokes the exact function signature from `PUBLIC`, `anon`,
  `authenticated`, and `service_role`, then grants only `service_role` execute.

Reporter application code has no direct canonical media insert/update path.
Existing staff media behavior is retained.

## TDD record

RED:

- The initial focused run failed because the upload model did not exist.
- Successive focused contracts failed before authoritative provider
  verification, service access rules, Cloudinary signing, the atomic SQL
  owner, routes, chunked browser transfer, and the uploader existed.
- The concurrency review added an explicit same-asset/different-public-ID
  contract that required the asset-ID unique expression index in addition to
  conflict detection.
- A build-generated Next 16 route contract exposed unsupported custom exports
  from the new route modules; factories and constants were moved to the upload
  feature boundary so the production route modules export only `runtime` and
  `POST`.
- Final self-review added malformed non-object payload coverage; it failed with
  a `TypeError` before the service boundary was changed to return the safe
  `invalid-upload` error.

GREEN:

- Final focused upload contracts: 23/23 passed.
- Final reporter workspace suite: 175/175 passed.
- Root website/CMS/reporter suites: 213/213, 587/587, and 175/175 passed.

## Verification

All commands used bundled Node `v24.19.0` from
`/Applications/ChatGPT.app/Contents/Resources/cua_node/bin`.

- Focused upload tests: 23 passed, 0 failed.
- Reporter tests: 175 passed, 0 failed.
- Reporter typecheck: passed.
- Reporter lint: passed with no warnings.
- Root tests: all three workspaces passed (975 total tests).
- Root typecheck: database, domain, website, CMS, and reporter passed.
- Root lint: website, CMS, and reporter passed.
- `git diff --check`: passed.

The default reporter production build did not complete on this machine. Next
could not load the signed native Darwin ARM64 SWC binding, so Turbopack refused
its WASM fallback. The documented `next build --webpack` fallback reached CSS
compilation but could not load the Darwin ARM64 Lightning CSS native binding.
The root build also stopped while loading native SWC/@parcel watcher bindings
for the website. These reproduced environment failures did not report an
upload application-code compile error. Generated `.next` artifacts were
removed before the final typecheck.

## Security self-review

- Both routes authenticate before body reads and cap declared and streamed raw
  JSON bodies at 16 KiB.
- Signing accepts no client folder/public ID and exposes only the documented
  public Cloudinary fields. Signatures cover the timestamp and fixed upload
  parameters; local freshness follows Cloudinary's documented one-hour
  signature validity rather than claiming a shorter provider TTL.
- Completion trusts no browser asset facts beyond identifiers and metadata;
  authoritative provider facts are reloaded and validated before the RPC.
- The app and SQL owner both deny wrong owners, legacy citizen reports,
  non-drafts, sourced stories, inactive/suspended/expired memberships, and
  stale or incomplete access synchronization.
- Image alt text and all titles/filenames are bounded; formats, MIME types,
  byte caps, image dimensions, and video duration are reapplied to the
  authoritative provider record.
- Ambiguous provider/database errors expose stable safe codes. Once provider
  upload succeeds, retry repeats completion and never deletes the asset.
- Exact per-signature RPC privileges, the asset-ID unique index, immutable
  origin binding, and absence of reporter media DML policies are asserted by
  focused static contracts.

## Concerns

- Docker/Postgres remained unavailable, so the migration was not applied to a
  live local database and Supabase types were not regenerated. Strong static
  SQL/function/privilege/concurrency contracts and manual type parity are in
  place, but a disposable migrated Supabase project still needs migration
  apply, generated-type diff, and live concurrent completion verification.
- Production build verification remains blocked by the local native SWC,
  @parcel watcher, and Lightning CSS bindings described above.

Commit subject: `feat(reporter): add signed field media uploads`
