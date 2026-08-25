# Reporter Submissions and Public Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let approved reporters create multilingual location-backed media stories, pass through revision-safe CMS review or trusted direct publication, and receive public verified bylines/profile pages.

**Architecture:** Reporter submissions reuse canonical `stories` and `media`; private coordinates and immutable submitted snapshots live in separate RLS-protected tables. CMS review extends the current story workflow, while website story DTOs join only the safe public reporter projection.

**Tech Stack:** Next.js 16.3, React 19, Supabase PostgreSQL/RLS, Cloudinary signed uploads, Zod 4, browser Geolocation and localStorage.

**Spec:** `docs/superpowers/specs/2026-08-22-reporter-portal-design.md`

## Global Constraints

- Complete `2026-08-22-reporter-portal-foundation-onboarding.md` first.
- Reuse `stories`, `media`, `languages`, categories, CMS workflow, and public revalidation.
- Reporter stories use `story_type = 'citizen_report'`.
- English, Hindi, and Marathi are the only version-one languages.
- Exact current latitude, longitude, accuracy, and capture time are mandatory at submission and never enter public DTOs.
- All submissions require review unless the reporter has an effective direct-publication grant.
- Submitted revisions are immutable; published stories cannot be silently changed by reporters.
- Public attribution uses verified legal name and separately identity-verified/admin-approved photo.
- Use local draft recovery only; do not create full offline synchronization.
- Use direct signed Cloudinary uploads and existing canonical media rows; do not create another media store.

---

### Task 1: Add submission revisions, locations, and reporter story authorization

**Files:**
- Create: `supabase/migrations/20260822150000_reporter_submissions.sql`
- Modify: `packages/database/src/database.types.ts`
- Create: `reporter/src/features/submissions/submission-schema.contract.test.mjs`
- Modify: `docs/story-management.md`
- Modify: `docs/row-level-security.md`

**Interfaces:**
- Produces: `story_revisions`, `story_locations`; functions `submit_reporter_story`, `direct_publish_reporter_story`, `withdraw_reporter_story`, `request_reporter_changes`.

- [ ] **Step 1: Write the failing schema contract**

```js
test("reporter submission SQL keeps coordinates private and transitions atomic", () => {
  assert.match(sql, /create table public\.story_revisions/u);
  assert.match(sql, /create table public\.story_locations/u);
  assert.match(sql, /create function public\.submit_reporter_story/u);
  assert.match(sql, /create function public\.direct_publish_reporter_story/u);
  assert.doesNotMatch(sql, /grant select on public\.story_locations to anon/u);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test --workspace @inbcn/reporter -- submission-schema.contract.test.mjs`
Expected: FAIL because the migration is absent.

- [ ] **Step 3: Implement tables, constraints, functions, and RLS**

Revisions contain snapshot JSON constrained to an object, monotonically increasing revision number, immutable trigger, submitter, submitted time, and review outcome. Locations contain numeric range checks, positive accuracy, capture/receipt timestamps, locality, retention date, and legal hold. Atomic functions lock reporter membership/profile and story, verify ownership/type/state, snapshot fields/media, validate fresh location, then transition the canonical story. Direct publish additionally requires active membership and `can_publish_directly`; it sets approval/publication timestamps and audit action `story.direct_published`.

- [ ] **Step 4: Apply migration and regenerate types**

Run: `npx supabase db reset && npx supabase gen types typescript --local > packages/database/src/database.types.ts`
Run: `npm test --workspace @inbcn/reporter && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260822150000_reporter_submissions.sql packages/database/src/database.types.ts reporter/src/features/submissions/submission-schema.contract.test.mjs docs/story-management.md docs/row-level-security.md
git commit -m "feat(database): add reporter story revisions and locations"
```

### Task 2: Implement reporter story domain, repository, service, and actions

**Files:**
- Create: `reporter/src/features/submissions/{submission.model,submission.model.test.mjs,submission.repository,submission.service,submission.actions}.ts`
- Create: `reporter/src/app/(protected)/stories/page.tsx`
- Create: `reporter/src/app/(protected)/stories/new/page.tsx`
- Create: `reporter/src/app/(protected)/stories/[id]/page.tsx`

**Interfaces:**
- Produces: `ReporterStoryInput`, `CapturedLocation`, `saveReporterDraft()`, `submitReporterStory()`, `directPublishReporterStory()`, `withdrawReporterStory()`, `getReporterStoryEditor(id)`.

- [ ] **Step 1: Test submission validation**

```ts
assert.equal(parseCapturedLocation({ latitude: 19.076, longitude: 72.8777, accuracy: 15, capturedAt: now }).ok, true);
assert.equal(parseCapturedLocation({ latitude: 95, longitude: 72, accuracy: 10, capturedAt: now }).ok, false);
assert.equal(isFreshCapture(new Date(now).getTime() - 4 * 60_000, now), true);
assert.equal(isFreshCapture(new Date(now).getTime() - 31 * 60_000, now), false);
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test --workspace @inbcn/reporter -- submission.model.test.mjs`
Expected: FAIL because the model is absent.

- [ ] **Step 3: Implement minimal server-first flow**

Validate title, summary, body, active language/category pair, event time, locality, coordinates, accuracy, and referenced owned media. Draft save never transitions status. Submit calls the database function rather than separate client writes. Return field-safe `useActionState` errors and revalidate reporter story routes.

- [ ] **Step 4: Verify service behavior**

Run: `npm test --workspace @inbcn/reporter && npm run typecheck --workspace @inbcn/reporter`
Expected: PASS for ownership, inactive/expired membership, grace reviewed submission, direct-publish eligibility, stale location, invalid category-language pair, immutable revision, withdrawal, and published-edit denial.

- [ ] **Step 5: Commit**

```bash
git add reporter/src/features/submissions reporter/src/app/'(protected)'/stories
git commit -m "feat(reporter): add story submission service"
```

### Task 3: Add signed Cloudinary photo/video uploads

**Files:**
- Create: `reporter/src/features/uploads/{upload.model,upload.model.test.mjs,cloudinary-signature.server,upload.repository,upload.service}.ts`
- Create: `reporter/src/app/api/uploads/sign/route.ts`
- Create: `reporter/src/app/api/uploads/complete/route.ts`
- Create: `reporter/src/features/submissions/media-uploader.tsx`

**Interfaces:**
- Produces: `requestSignedUpload({ storyId, mediaType, filename, bytes, mimeType })`; `completeSignedUpload(providerResult)`; owned `media` row IDs.

- [ ] **Step 1: Write allowlist and ownership tests**

```ts
assert.equal(validateUpload({ mediaType: "image", mimeType: "image/jpeg", bytes: 5_000_000 }).ok, true);
assert.equal(validateUpload({ mediaType: "video", mimeType: "video/mp4", bytes: 100_000_000 }).ok, true);
assert.equal(validateUpload({ mediaType: "document", mimeType: "application/pdf", bytes: 20 }).ok, false);
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test --workspace @inbcn/reporter -- upload.model.test.mjs`
Expected: FAIL because uploads are absent.

- [ ] **Step 3: Implement signed upload lifecycle**

Issue a short-lived Cloudinary signature only after checking reporter/story ownership and membership. Generate folder/public ID server-side; never sign client-selected paths. Completion verifies Cloudinary public ID prefix, resource type, format, bytes, dimensions/duration, and uniqueness before inserting `media`. Permit JPEG/PNG/WebP/AVIF up to 10 MiB and MP4/WebM up to 250 MiB for version one. Expose progress, cancellation, retry, and accessible status in the uploader.

- [ ] **Step 4: Verify upload boundary**

Run: `npm test --workspace @inbcn/reporter`
Expected: PASS for wrong owner, expired signature, unsupported MIME, oversized input, forged public ID, duplicate completion, and successful image/video rows.

- [ ] **Step 5: Commit**

```bash
git add reporter/src/features/uploads reporter/src/features/submissions/media-uploader.tsx reporter/src/app/api/uploads
git commit -m "feat(reporter): add signed field media uploads"
```

### Task 4: Build the mobile editor with local draft recovery and location capture

**Files:**
- Create: `reporter/src/features/submissions/{story-editor,local-draft,local-draft.test.mjs,location-capture,location-capture.test.mjs}.ts*`
- Modify: `reporter/src/app/(protected)/stories/new/page.tsx`
- Modify: `reporter/src/app/(protected)/stories/[id]/page.tsx`

**Interfaces:**
- Produces: `draftStorageKey(userId, storyId)`, debounced local persistence, `captureCurrentLocation()` returning `CapturedLocation`.

- [ ] **Step 1: Write pure recovery/capture tests**

```ts
assert.equal(draftStorageKey("u1", "new"), "inbcn:reporter-draft:u1:new");
assert.equal(chooseNewestDraft({ updatedAt: "2026-08-22T10:00:00Z" }, { updatedAt: "2026-08-22T11:00:00Z" }).source, "local");
assert.equal(mapGeolocationError({ code: 1 }), "Location permission is required to submit this story.");
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test --workspace @inbcn/reporter -- local-draft.test.mjs location-capture.test.mjs`
Expected: FAIL because helpers are absent.

- [ ] **Step 3: Implement focused client islands**

Keep the page/server data server-rendered. Use a client editor for form state, localStorage recovery, geolocation, and upload progress. Autosave text after a short debounce and after field blur. Clear local data only after confirmed server save. Require an explicit “Capture current location” action immediately before submit; show coordinates only as an accuracy/locality confirmation, not as a public promise.

- [ ] **Step 4: Verify mobile and accessibility contracts**

Run: `npm test --workspace @inbcn/reporter && npm run lint --workspace @inbcn/reporter && npm run build --workspace @inbcn/reporter`
Expected: PASS; controls have labels, focus behavior, `aria-live` progress/errors, and disabled states that preserve draft content.

- [ ] **Step 5: Commit**

```bash
git add reporter/src/features/submissions reporter/src/app/'(protected)'/stories
git commit -m "feat(reporter): add mobile field story editor"
```

### Task 5: Extend CMS review for reporter revisions and trust controls

**Files:**
- Modify: `cms/src/features/admin/stories/story.model.ts`
- Modify: `cms/src/features/admin/stories/story.service.ts`
- Modify: `cms/src/features/admin/stories/story.actions.ts`
- Modify: `cms/src/features/admin/stories/story-editor.tsx`
- Create: `cms/src/features/admin/stories/reporter-revision-panel.tsx`
- Create: `cms/src/features/admin/stories/reporter-review.service.test.mjs`
- Create: `cms/src/app/admin/(protected)/reporters/page.tsx`
- Create: `cms/src/app/admin/(protected)/reporters/[id]/page.tsx`
- Create: `cms/src/features/admin/reporters/reporter-directory.tsx`

**Interfaces:**
- Consumes: current story workflow and new revision/location tables.
- Produces: editor `requestChanges`, `rejectReporterStory`, `publishReporterStory`; admin `setReporterTrust(profileId, capability, enabled, reason)`.

- [ ] **Step 1: Write review authorization/transition tests**

```ts
assert.equal(canSetReporterTrust("admin"), true);
assert.equal(canSetReporterTrust("editor"), false);
assert.equal(canReviewReporterStory("editor", "pending_review"), true);
assert.equal(canReviewReporterStory("writer", "pending_review"), false);
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test --workspace @inbcn/cms -- reporter-review.service.test.mjs`
Expected: FAIL because reporter review integration is absent.

- [ ] **Step 3: Implement review and directory UI**

Show immutable submitted revision, current canonical story, private locality/coordinate accuracy to staff only, media, reporter profile, membership, and audit history. Changes request and rejection require reasons and create notifications. Editors may publish/unpublish; admins alone grant/revoke trust, suspend, or reinstate. Reuse existing public revalidation after publish/unpublish.

- [ ] **Step 4: Verify CMS behavior**

Run: `npm test --workspace @inbcn/cms && npm run typecheck --workspace @inbcn/cms && npm run build --workspace @inbcn/cms`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cms/src/features/admin/stories cms/src/features/admin/reporters cms/src/app/admin/'(protected)'/reporters
git commit -m "feat(cms): review reporter submissions and trust"
```

### Task 6: Publish verified reporter bylines and profile pages

**Files:**
- Modify: `website/src/features/news/server/stories.repository.ts`
- Modify: `website/src/features/news/server/services/story-reader.service.ts`
- Modify: `website/src/features/news/server/services/story-reader.model.ts`
- Modify: `website/src/app/[locale]/story/[slug]/page.tsx`
- Create: `website/src/features/reporters/{public-reporter.repository,public-reporter.model,public-reporter.model.test.mjs,reporter-byline-card}.ts*`
- Create: `website/src/app/[locale]/reporters/[slug]/page.tsx`
- Create: `website/src/app/[locale]/reporters/[slug]/not-found.tsx`

**Interfaces:**
- Produces: `PublicReporter`, `getPublicReporter(slug, locale)`, reporter-aware `StoryReaderViewModel.story.reporter`.

- [ ] **Step 1: Test safe public mapping**

```ts
const publicReporter = mapPublicReporter(row);
assert.deepEqual(Object.keys(publicReporter).sort(), ["beats", "bio", "district", "legalName", "photoUrl", "slug", "status"]);
assert.equal(JSON.stringify(publicReporter).includes("latitude"), false);
assert.equal(JSON.stringify(publicReporter).includes("phone"), false);
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test --workspace @inbcn/website -- public-reporter.model.test.mjs`
Expected: FAIL because public reporter mapping is absent.

- [ ] **Step 3: Implement public attribution**

Join the safe public reporter view only for reporter-created published stories. Render legal name, approved image, status badge, district, bio, beats, and link. The profile lists published stories only. Preserve staff/aggregated author behavior. Update NewsArticle JSON-LD author to `Person` with profile URL for reporters and retain `Organization` for non-reporter content.

- [ ] **Step 4: Verify no private leakage**

Run: `npm test --workspace @inbcn/website && npm run typecheck --workspace @inbcn/website && npm run build --workspace @inbcn/website`
Expected: PASS; tests assert story/profile DTOs contain no phone, DOB, KYC reference, payment, exact coordinate, or review note.

- [ ] **Step 5: Commit**

```bash
git add website/src/features/news website/src/features/reporters website/src/app/'[locale]'/story website/src/app/'[locale]'/reporters
git commit -m "feat(website): publish verified reporter profiles"
```

## Submissions Plan Exit Gate

Run `npm run lint && npm run typecheck && npm test && npm run build`. In a test Supabase project, verify reviewed submission, changes request/revision, rejection, withdrawal, trusted direct publication, editor unpublish, public byline/profile, grace-period reviewed submission, and the absence of exact coordinates from every anonymous response.
