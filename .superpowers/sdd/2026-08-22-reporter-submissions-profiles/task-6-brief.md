# Task 6 brief — verified public reporter bylines and profiles

## Objective

Publish verified reporter attribution on true reporter stories and a localized public profile page, using only the existing safe reporter projection and published canonical stories. Preserve the current staff/external author behavior and historical attribution while membership status changes.

Base: `2b558c1`. Use the existing worktree/branch, bundled Node 24.19.0, TDD, Ponytail full, and `apply_patch`. Read the parent plan/spec/ledger, foundation `public_reporter_profiles`, Task 1 `is_reporter_story`, current public story repository/reader/JSON-LD/page, applicable `AGENTS.md`, Supabase skill/current RLS guidance, and Next/React guidance before acting. Do not start live broadcasting or add another profile/media store.

## Planned surface

- Modify `website/src/features/news/server/{stories.repository,dto}.ts` only as needed to obtain reporter provenance/attribution.
- Modify `website/src/features/news/server/services/{story-reader.service,story-reader.model}.ts` and their focused tests.
- Create `website/src/features/reporters/{public-reporter.repository,public-reporter.model,public-reporter.model.test.mjs,reporter-byline-card}.ts*`.
- Modify `website/src/app/[locale]/story/[slug]/page.tsx`.
- Create `website/src/app/[locale]/reporters/[slug]/{page,not-found}.tsx` and minimal localized copy in the three existing message files.
- Add at most one additive migration `supabase/migrations/20260822154000_public_reporter_profiles.sql`, its narrow static contract, and manual database type parity only if the current safe view cannot associate a published story/profile without exposing a protected account identifier.

## Binding public/privacy behavior

1. A reporter byline exists only when the canonical story is published and `public.is_reporter_story(story)` is true. `story_type='citizen_report'` alone is never enough. Legacy citizen reports, staff stories, and imported/external stories retain the existing Organization/external-author behavior.
2. Reuse `public.public_reporter_profiles`; do not widen anonymous SELECT on `reporter_profiles`, applications, KYC, payments, consents, revisions, locations, audit, or notifications. Do not expose `profile_id`/auth UUID merely to make the join convenient. If association needs a database API, use the smallest empty-search-path, read-only `SECURITY DEFINER` computed field/RPC with exact grants and a strict safe projection.
3. `PublicReporter` contains exactly: `slug`, KYC-verified `legalName`, separately approved `photoUrl`, normalized public `status`, `district`, `bio`, and `beats`. Map DB states as active/grace → `verified`, expired → `former`, suspended → `suspended`; do not imply current authority from historical publication.
4. Public DTOs and anonymous responses must contain no phone/email, DOB/age, address/home state, KYC provider/reference/metadata, application/payment/consent data, access/suspension tokens or reasons, trust provenance, review notes, revisions, exact/current story coordinates, accuracy, capture time, locality evidence, reporter account UUID, or generic audit history.
5. Historical published reporter stories retain the verified legal name/photo/link even when the current profile becomes expired/former or suspended. The profile remains reachable for historical attribution and shows the current normalized status. Exceptional erasure is outside this task.
6. The article header and author section render an accessible reporter link/card with legal name, approved photo, status, district, bio, and beats. Do not duplicate an image or create a client island. Metadata author name remains the legal name.
7. `NewsArticle.author` is a schema.org `Person` with legal name, absolute localized profile URL, and approved photo only for reporter stories. All non-reporter content keeps the existing `Organization` author. JSON-LD must not contain protected identifiers or private evidence.
8. `/[locale]/reporters/[slug]` validates the existing locale/slug path, loads only the safe projection, returns not-found for missing profiles, and lists only currently published true reporter stories for that reporter and locale, newest first. Reuse existing story-card/image/category/service patterns rather than inventing a second feed model. No drafts, archived/rejected stories, other reporters' stories, or exact locations.
9. Profile metadata uses the legal name/bio/photo and a canonical localized URL. The page is mobile-first, keyboard accessible, has meaningful alt text/status text, and handles empty bio/beats/history without fabrication.
10. Public reads stay anonymous-safe and cache-compatible. Existing publish/archive revalidation is authoritative; add reporter profile path revalidation only if required by the actual cache behavior, not speculatively.

## Minimal database shape if required

Prefer one computed field such as `public_reporter(stories) -> jsonb` that internally checks published status plus `is_reporter_story` and returns only the existing view columns, together with the smallest safe way to list published story IDs by public slug. If one function can own both call sites cleanly, use one; do not expose `created_by` or add a public join table. Revoke from PUBLIC first, grant only anon/authenticated/service_role as required, and assert exact signature/search path/provenance/status/safe keys in a static contract. Avoid dynamic SQL.

## Mandatory RED/GREEN coverage

- exact `PublicReporter` keys and state normalization;
- absent/invalid/null view data fails closed; photo is HTTPS and slug/status/beats are bounded/validated;
- serialized public reporter/story/profile/JSON-LD DTOs contain none of the forbidden private fields or protected reporter UUIDs;
- byline resolution requires both published and true reporter provenance; legacy citizen/staff/external paths are unchanged;
- `NewsArticle.author` is Person + absolute localized profile URL/image only for a reporter, Organization otherwise;
- profile repository/page lists only published true reporter stories in the requested locale and handles missing/empty profiles;
- SQL association surface, if added, has safe allowlist, no coordinates/private tables in output, empty search path, exact grants, and uses the existing safe view/provenance function;
- article/page links, image alt text, status semantics, and localized route behavior.

Run focused website + SQL contracts, full website/CMS/reporter/root tests, all typechecks/lint, a clean website production build, `git diff --check`, and a final anonymous-surface/privacy self-review. Docker is unavailable: live migration apply/typegen stays deferred and must not be claimed; static contracts/manual types are required.

Commit as `feat(website): publish verified reporter profiles` and write `task-6-implementer-report.md` in this SDD directory.
