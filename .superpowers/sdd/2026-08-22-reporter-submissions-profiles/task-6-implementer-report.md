# Task 6 implementer report

Status: `DONE`

## Outcome

Published verified reporter attribution on the existing public article route and
added localized public reporter profiles at
`/[locale]/reporters/[slug]`. Reporter attribution appears only when the
canonical story is published and the existing `is_reporter_story(stories)`
predicate confirms reporter provenance. Legacy citizen reports, staff stories,
and imported/external stories retain their existing author and schema.org
Organization behavior.

One additive migration provides the missing association without exposing a
reporter account UUID. `public_reporter(stories) -> jsonb` is a PostgREST
computed field with an unnamed row parameter, so it is selectable/filterable as
a virtual story field but is not exposed as a standalone `/rpc` endpoint. It is
`STABLE`, `SECURITY DEFINER`, has an empty search path and exact execute grants,
checks published status plus canonical reporter provenance, associates by the
protected creator only inside the function, and builds JSON from exactly seven
columns already present in `public_reporter_profiles`.

The same computed field owns both call sites:

- Article detail selects the safe reporter JSON together with the existing
  provenance boolean. App mapping repeats the published/provenance guard,
  validates every safe field, and fails closed on null or malformed data.
- Profile history filters canonical stories by the computed public slug, locale,
  published status/time, and newest-first publication order. No second RPC,
  public join table, base-table grant, or protected identifier was added.

`PublicReporter` contains exactly `slug`, `legalName`, `photoUrl`, `status`,
`district`, `bio`, and `beats`. Active and grace map to `verified`, expired maps
to `former`, and suspended maps to `suspended`; no status removes historical
attribution. The article header links the legal name and its author section
renders one server-only profile card with one approved portrait. Reporter
`NewsArticle.author` is a schema.org Person with an absolute localized profile
URL and approved image. Non-reporter author metadata remains unchanged.

The localized profile uses the existing story repository, image resolver, and
StoryCard. It has legal-name/bio/photo canonical metadata, safe not-found
handling, localized status semantics and empty-history copy, keyboard-visible
links, meaningful portrait alt text, and no client island. No reporter-profile
cache revalidation was added because these reads use the existing dynamic
anonymous server path and request-local React cache; existing publish/archive
revalidation remains authoritative.

No live-broadcast scope was started.

## TDD

The first exact focused run used bundled Node `v24.19.0` and was RED: 19
pre-existing checks passed and six intended checks failed on the missing public
reporter model, repository, migration/type contract, byline/profile UI, article
link/card integration, and reporter Person JSON-LD. The first npm multi-file
selector was not interpreted as separate paths, so the recorded RED evidence
came from Node's test runner invoked directly with the six exact test paths.

Focused GREEN is 33/33. Coverage includes:

- exact DTO keys and forbidden-field stripping;
- active/grace/expired/suspended normalization and retained attribution;
- null, malformed, insecure-URL, invalid-slug/status/beat, and bounded-data
  failure cases;
- the combined published plus true-provenance gate;
- localized safe profile URLs and absolute canonical metadata;
- safe-view-only repository fields and published locale/profile story filters;
- SQL signature, fixed search path, provenance/status checks, safe JSON keys,
  exact grants, manual type parity, and absence of private evidence sources;
- Organization versus Person JSON-LD behavior and forbidden JSON-LD fields;
- one server-rendered portrait card, header/profile links, localized status and
  not-found behavior, and all reporter copy in English, Hindi, and Marathi.

## Verification

All JavaScript checks used bundled Node `v24.19.0`.

- Focused reporter/article/SQL/UI checks: 33 passed.
- Full website tests: 227 passed.
- Full CMS tests: 600 passed.
- Full reporter tests: 202 passed.
- Fresh root tests: 1,029 passed in total.
- Root typecheck: database, domain, website, CMS, and reporter passed.
- Root lint: website, CMS, and reporter passed without warnings.
- Website Next.js 16.3 production build: compiled, typechecked, generated all
  13 static pages, and listed `/[locale]/reporters/[slug]` as a dynamic route.
- `git diff --check`: passed.

macOS library validation rejects repository native addons when the
ChatGPT-signed bundled Node loads them directly. The successful build used the
existing temporary ad-hoc-signed copy of that exact bundled Node 24.19.0 in
`/tmp` and supplied only the documented production placeholder
`NEXT_PUBLIC_APP_URL=https://inbcn.example`. It did not modify repository files,
dependencies, production services, or credentials. Expected build diagnostics
reported that optional public Supabase alert configuration was absent; the
build completed successfully.

Docker/Postgres is unavailable. The migration was not applied locally and
database types were not regenerated. The additive SQL contract and manual type
parity are present; live migration apply, anonymous HTTP integration against a
test project, and generated type refresh remain explicitly deferred.

## Security and privacy self-review

- The migration does not change SELECT on `reporter_profiles`, applications,
  payments, consents, revisions, locations, notifications, or audit data. The
  existing safe view remains the only public reporter profile source.
- The protected reporter/account UUID is used only for the internal association
  between the computed story row and safe view. It is not a JSON key, model
  field, select list, route parameter, link, metadata field, structured-data
  field, log, or rendered value.
- The computed field's unnamed composite parameter follows current PostgREST
  computed-field guidance and prevents standalone RPC exposure. It revokes
  PUBLIC and every Data API role before granting only the anon, authenticated,
  and service-role callers that already read public stories/safe profiles.
- The SQL output allowlist is exactly public slug, verified legal name,
  approved avatar, public status, district, bio, and beats. It references no
  story location/revision, KYC, application, payment, consent, suspension
  reason, trust provenance, notification, or audit source.
- SQL and application mapping both require published state and the existing
  reporter predicate. `story_type = 'citizen_report'` is never sufficient, so
  legacy citizen reports cannot acquire reporter identity or Person JSON-LD.
- The public model accepts only the three supported locales, bounded canonical
  slugs, HTTPS portraits without credentials, verified legal/district/bio
  bounds, four known public states, and the eight established beat values.
  Unknown/null data produces no byline/profile rather than a partial identity.
- Expired and suspended reporters remain safely attributable on historical
  published work while the current normalized status avoids implying current
  authority. Draft, scheduled, rejected, archived, future-dated, cross-locale,
  and other-reporter rows are excluded from profile history.
- Public reporter, story, profile, and JSON-LD objects contain none of the
  forbidden private evidence or reporter UUID keys. JSON-LD is escaped through
  the article page's existing safe serialization path.
- Reporter portraits render once in the article author card and once on the
  separate profile page, with legal-name alt text. The article hero remains the
  story image; no duplicate portrait or client-side identity fetch was added.
- Current Supabase changelog, grants/RLS, view, function, and PostgREST computed
  field guidance were reviewed. No relevant 2026 breaking change conflicts
  with this additive SQL surface.

No schema, workflow, RLS, privacy, or website interface conflict remains.

Commit subject: `feat(website): publish verified reporter profiles`
