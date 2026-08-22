# Task 4 implementer report

Status: `DONE`

## Outcome

Added a single mobile-first `StoryEditor` client island while keeping both story
pages as server components for authentication, ownership, and reference reads.
The editor recovers only bounded, versioned, user-and-story-scoped editable
draft fields; it does not persist exact location evidence, files, credentials,
session data, or provider errors.

New drafts keep the server-preallocated UUID for idempotent save retries while
using the current-user-only `new` local-recovery alias across page refreshes.
After a confirmed first save the island clears that alias before navigating to
the persisted editor. Save acknowledgements are tied to monotonic edit
generations and unique attempts, so an earlier save cannot clear a later edit;
every successful action result is handled independently.
Existing drafts support explicit restore/discard, debounced and blur local
persistence, canonical media ordering/removal, image-only featured selection,
and direct uploader callbacks that carry only a canonical media ID plus safe
label/type. The editor is the sole owner of `mediaIds` when that callback is in
use, preventing duplicate form values. Submission/direct-publication controls
require a saved draft, a fresh explicit browser capture, and detailed locality.
Coordinates are displayed as private evidence and submitted only through hidden
action fields.

Local recovery accepts ordinary in-progress field values (including an empty
event time) and matches the UI/server 100,000-character body bound. Quota or
storage failure remains non-fatal and is announced accessibly while the live
editor state stays intact.

The existing server actions remain the authentication/authorization and
validation boundary. The save action now returns the existing redirect intent,
so the client can clear recovery data before navigating.

## TDD

The review follow-up began RED for the new-draft alias/save-generation exports
and uploader ownership contract. A further RED case covered the delayed dirty
cleanup racing a subsequent edit. GREEN now covers save/edit interleaving,
repeated successes, exact user-scoped new aliases, partial recovery fields,
single `mediaIds` ownership, server language format, and ISO-Z datetime-local
conversion. Final focused coverage is 23/23.

## Verification

All commands used bundled Node `v24.19.0`.

- Focused local-draft/editor/model contracts: 23 passed.
- Reporter tests: 197 passed.
- Root tests: website 213, CMS 587, reporter 197 passed.
- Reporter and root typecheck/lint: passed.
- `git diff --check`: passed.
- Fresh reviewer verification with bundled Node completed the production build
  successfully.

## Security and accessibility review

- Browser recovery is untrusted, schema-bounded, versioned, scope-checked, and
  storage failures are non-fatal and announced; server validation remains
  authoritative.
- Save cleanup is exact-snapshot-only: it cannot discard a newer local edit or
  mark it clean after an older save resolves.
- No browser recovery payload includes latitude, longitude, accuracy, capture
  time, locality, uploads, signatures, files, or session/profile/payment data.
- Geolocation uses high accuracy, no cached result, a 15-second timeout, finite
  range/accuracy validation, and safe permission/unavailable/timeout feedback.
- There are no manual coordinate inputs, nested forms, or client authority
  checks. Location evidence is hidden only for action submission.
- Native labels, live status/error feedback, visible focus, 44px-ish controls,
  keyboard media ordering, and image-only featured selection are present.

Commit subject: `feat(reporter): add mobile field story editor`

## New-story recovery follow-up

An initial new-story save now always replaces the route with the server-returned
story ID. If edits advanced while that first save was pending, the current
in-memory fields are first persisted under that returned UUID, with a timestamp
strictly after the server's saved timestamp, then only the user-scoped `new`
alias is cleared. The persisted editor therefore offers the newer local draft
for explicit restoration. Exact-generation saves clear the alias and navigate
without creating a recovery copy.

An ordinary refresh of an unsaved new editor now offers the current user's
validated `new` alias directly. This path intentionally does not compare that
draft to the synthetic blank-page timestamp; persisted editors retain the
normal newer-than-server comparison. No user enumeration or cross-user key
access was introduced.

Follow-up RED covered the missing alias migration, explicit new-editor restore
policy, returned saved timestamp, and action revalidation/new-target contract;
GREEN focused coverage is 26/26. Full root tests passed (website 213, CMS 587,
reporter 200), as did root and reporter typecheck/lint and `git diff --check`.
The fresh reviewer bundled-Node production build remains the recorded passing
build verification.

## Storage-safety follow-up

Local moves now read and validate the destination before writing. Their
deterministic candidate timestamp is the later of client time and one
millisecond after the server save time; an equal-or-newer validated destination
wins, while only an older destination is replaced. A copied destination is
reread before removal, and removal reports success only when the source key is
actually absent. Consequently a quota/write failure keeps the source alias,
and a failed removal leaves at least one restorable copy rather than reporting
a completed move.

The editor checks every initial-save migration or recovery-clear result. A
failure leaves its live fields mounted, announces an accessible recovery error,
and avoids navigation. Save responses must match the preallocated server action
target; retries therefore remain bound to that already-created UUID rather than
creating a second draft.

RED runtime probes covered equal/newer/older destination timestamps, no-op
removal, quota failure, and persistence clear results. GREEN focused coverage
is 27/27. Full root tests passed (website 213, CMS 587, reporter 201), as did
root and reporter typecheck/lint and `git diff --check`. The fresh reviewer
bundled-Node production build remains the recorded passing build verification.
