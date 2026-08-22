# Task 5 implementer report

Status: `DONE`

## Outcome

Added a read-only reporter-submission review surface to the existing CMS story
editor. Editors and administrators can compare the latest immutable submitted
revision with the canonical story, inspect approved reporter identity and
submitted media, see visibly private exact-location evidence, and review only
that story's audit history. Reporter stories never render the normal editable
story form and their command set excludes save and delete.

Review actions reuse the established database owners. Changes requests call
`request_reporter_changes` with the exact latest revision ID. Approval,
publication, scheduling, rejection, and archive use the canonical guarded story
transition path, leaving Task 1's evidence guard/finalizer authoritative. A
database trigger emits one generic in-app rejection notification only for a
true reporter story's real `pending_review` to `rejected` edge.

Added an administrator-only reporter directory and detail page. The detail
reuses the existing application review component, and therefore the existing
suspend, reinstate, and access-sync retry actions, instead of duplicating that
logic. Trust controls show both raw and currently effective direct-publication
and live-request state and require an explicit enable/disable choice plus a
bounded reason.

One additive migration owns the two missing database APIs:

- `get_reporter_story_review(uuid)` is an empty-search-path, field-safe private
  projection for a signed editor/admin whose matching database profile is
  active. It does not add an editor policy to reporter profile, application,
  payment, consent, KYC, or token tables.
- `set_reporter_trust(uuid, text, boolean, text)` permits exactly the two trust
  capabilities, locks reporter then profile rows in the established order,
  gates enables on active synchronized current membership, permits disables in
  any existing reporter state, updates only the selected capability and its
  grant/revoke provenance, treats equal desired state as a no-op, and writes
  one audit event and one generic in-app notification for a real transition.

Manual database types cover only those two new RPC signatures. Public profile
delivery and live broadcasting were not started.

## TDD

The first focused run was RED on the missing reporter-review authorization and
command surface. With the initial model helpers present, the contract was 2/9
passing and 7/9 failing on the absent projection, action/service delegation,
rejection notification, trust RPC, directory, private panel, and manual types.
Subsequent RED cases caught nullable trust capabilities, an effective-trust UI
calculation that omitted membership start, and over-broad reporter cache
revalidation. GREEN focused coverage is 29/29 across the new contract, story
model regression, and protected navigation contract.

## Verification

All JavaScript checks used bundled Node `v24.19.0`.

- Focused reporter-review/model/navigation contracts: 29 passed.
- Full CMS tests: 596 passed.
- Full reporter tests: 202 passed.
- Fresh root tests: website 213, CMS 596, reporter 202; 1,011 total passed.
- Root typecheck: database, domain, website, CMS, and reporter passed.
- Root lint: website, CMS, and reporter passed with no errors or warnings.
- CMS Next.js 16.3 production build: compiled, typechecked, generated all 24
  pages, and listed `/admin/reporters` and `/admin/reporters/[id]`.
- `git diff --check`: passed.

macOS library validation rejected the repository's ad-hoc-signed SWC and
Parcel native addons when loaded directly by the ChatGPT-signed bundled Node.
The successful build used a temporary ad-hoc-signed copy of that exact bundled
Node 24.19.0 in `/tmp`; it did not modify the repository or dependencies. The
build also supplied the documented production-only placeholder
`NEXT_PUBLIC_CMS_URL=https://cms.inbcn.test`. A root multi-app production build
was not proportional because this task changes CMS and database contracts, not
website or reporter application source; root tests, lint, and typechecks still
covered all workspaces.

Docker is unavailable. The migration was not applied locally and generated
types were not regenerated. Static SQL contracts and the required manual RPC
type parity are present; live migration apply and type generation remain
explicitly deferred.

## Security, privacy, and state review

- Every new page/action/service checks its role, and database functions repeat
  the signed-role plus active matching database-profile check. Writers cannot
  review reporter submissions; editors cannot list or mutate reporter trust.
- Reporter provenance uses `is_reporter_story`. Legacy citizen reports retain
  the ordinary CMS workflow.
- The review projection explicitly builds its response from allowed fields and
  returns only the latest revision's canonical media and location plus audits
  scoped to `subject_type = 'story'` and that story ID. It exposes no KYC,
  payment, consent, access-sync claim, suspension token, or unrelated audit.
- Exact coordinates remain only in the private projection/panel. They are not
  copied to generic DTOs, reporter directory rows, action URLs, logs, public
  routes, notifications, or audit metadata.
- Reporter content remains non-saveable and non-deletable in CMS. Request
  changes retains latest-revision conflict locking; all other lifecycle writes
  retain the existing database evidence guard and finalizer, including one-year
  location retention and terminal-state rules.
- Rejection notification is tied to the actual old/new status edge and the true
  reporter predicate, so same-status writes, reporter withdrawal, and legacy
  citizen reports do not notify.
- Trust enables exclude grace and expired membership. Null/unknown capability,
  null desired value, missing/non-reporter target, inactive/suspended target,
  and stale access sync fail closed. Equal desired state returns before update,
  audit, or notification.
- Both new callable RPCs revoke PUBLIC, anon, authenticated, and service-role
  execute first, then grant only authenticated; in-function checks remain the
  authority. The trigger helper remains non-callable.
- Action failures expose stable newsroom messages rather than SQL/provider
  details. Public-news revalidation occurs only for publish/archive or an edit
  to already published ordinary content; reporter-only changes invalidate only
  the relevant CMS/reporter views.
- Forms have native labels, required bounds, pending disabled states, keyboard
  operation, and polite accessible status feedback. Visibility and
  irreversibility wording is explicit.

No schema, workflow, RLS, or interface conflict remains. The deliberately
deferred surfaces are live migration/type generation, public website reporter
profiles, and live broadcasting.

Commit subject: `feat(cms): review reporter submissions and trust`
