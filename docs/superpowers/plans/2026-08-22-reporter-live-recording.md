# Reporter Live Broadcast and Recording Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-event admin-approved reporter broadcasts, time-limited LiveKit publishing sessions, server-side recordings, private editorial review, and public replay.

**Architecture:** Reporter live requests and recordings are private Supabase records. Admin approval atomically reserves a unique LiveKit room; the reporter server issues a room-scoped publisher token only inside the approved window, starts Room Composite Egress to private S3-compatible storage, and persists webhook-confirmed outputs for CMS review.

**Tech Stack:** Next.js 16.3, Supabase PostgreSQL/RLS, LiveKit Server SDK 2.17, LiveKit Client 2.21, LiveKit Egress, private S3-compatible storage.

**Spec:** `docs/superpowers/specs/2026-08-22-reporter-portal-design.md`

## Global Constraints

- Complete the foundation/onboarding plan first.
- General `can_broadcast_live` never bypasses per-event admin approval.
- Direct publishing and live broadcasting are disabled during grace, expiry, or suspension.
- Live tokens grant only the approved room and publishing capability and expire around its approved window.
- Every approved room starts server-side recording; the phone does not own the archive copy.
- Recording failure alerts admins but does not automatically end the broadcast.
- Recordings are private until editor approval.
- Unpublished/rejected recordings expire after 90 days unless on legal hold; published recordings are retained.
- Never expose storage credentials or raw private object URLs to browsers.

---

### Task 1: Add live request and recording schema

**Files:**
- Create: `supabase/migrations/20260822160000_reporter_live_recording.sql`
- Modify: `packages/database/src/database.types.ts`
- Create: `reporter/src/features/live/live-schema.contract.test.mjs`
- Modify: `docs/database-schema.md`
- Modify: `docs/row-level-security.md`

**Interfaces:**
- Produces: `reporter_live_requests`, `live_recordings`; functions `approve_reporter_live_request`, `reject_reporter_live_request`, `terminate_reporter_live_request`, `set_live_recording_legal_hold`.

- [ ] **Step 1: Write the failing schema contract**

```js
test("live schema requires approval and keeps recordings private", () => {
  assert.match(sql, /create table public\.reporter_live_requests/u);
  assert.match(sql, /create table public\.live_recordings/u);
  assert.match(sql, /create function public\.approve_reporter_live_request/u);
  assert.doesNotMatch(sql, /grant select on public\.live_recordings to anon/u);
  assert.match(sql, /retention_delete_at/u);
  assert.match(sql, /legal_hold/u);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test --workspace @inbcn/reporter -- live-schema.contract.test.mjs`  
Expected: FAIL because the migration is absent.

- [ ] **Step 3: Implement schema and atomic decisions**

Constrain request status, approved window, expected duration, room-name uniqueness, decision/termination reasons, egress ID uniqueness, recording status, storage key, duration/bytes, replay publication fields, 90-day deletion timestamp, and legal hold. Reporter RLS permits only own requests; admin functions verify role through JWT claims and audit every decision. Public receives no base-table access.

- [ ] **Step 4: Apply and regenerate types**

Run: `npx supabase db reset && npx supabase gen types typescript --local > packages/database/src/database.types.ts`  
Run: `npm test --workspace @inbcn/reporter && npm run typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260822160000_reporter_live_recording.sql packages/database/src/database.types.ts reporter/src/features/live/live-schema.contract.test.mjs docs/database-schema.md docs/row-level-security.md
git commit -m "feat(database): add reporter live requests and recordings"
```

### Task 2: Add reporter live requests and CMS approval

**Files:**
- Create: `reporter/src/features/live/{live-request.model,live-request.model.test.mjs,live-request.repository,live-request.service,live-request.actions,live-request-form,live-request-list}.ts*`
- Create: `reporter/src/app/(protected)/live/page.tsx`
- Create: `reporter/src/app/(protected)/live/request/page.tsx`
- Create: `cms/src/app/admin/(protected)/reporters/live/page.tsx`
- Create: `cms/src/app/admin/(protected)/reporters/live/[id]/page.tsx`
- Create: `cms/src/features/admin/reporters/live/{live-review.model,live-review.model.test.mjs,live-review.repository,live-review.service,live-review.actions,live-review-list,live-review-detail}.ts*`

**Interfaces:**
- Produces: `createLiveRequest(input)`, `approveLiveRequest(id, window, reason)`, `rejectLiveRequest(id, reason)`, `terminateLiveRequest(id, reason)`.

- [ ] **Step 1: Test live eligibility and windows**

```ts
assert.equal(canRequestLive({ membership: "active", canBroadcastLive: true }), true);
assert.equal(canRequestLive({ membership: "grace_period", canBroadcastLive: true }), false);
assert.equal(validateApprovedWindow("2026-08-22T10:00:00Z", "2026-08-22T11:00:00Z").ok, true);
assert.equal(validateApprovedWindow("2026-08-22T11:00:00Z", "2026-08-22T10:00:00Z").ok, false);
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test --workspace @inbcn/reporter -- live-request.model.test.mjs`  
Expected: FAIL because live-request logic is absent.

- [ ] **Step 3: Implement request and admin review surfaces**

Collect title, purpose, intended locality, expected start, and duration. Do not collect public exact coordinates here. Admin approval requires an explicit window and creates a server-owned room name using request UUID. Rejection/termination require reasons and create reporter notifications/audit events. Editors may view status but admins alone approve or terminate.

- [ ] **Step 4: Verify portal and CMS**

Run: `npm test --workspace @inbcn/reporter && npm test --workspace @inbcn/cms && npm run typecheck`  
Expected: PASS for permission, membership gating, ownership, window validation, admin-only approval, duplicate approval, and termination.

- [ ] **Step 5: Commit**

```bash
git add reporter/src/features/live reporter/src/app/'(protected)'/live cms/src/features/admin/reporters/live cms/src/app/admin/'(protected)'/reporters/live
git commit -m "feat(reporter): add approved live requests"
```

### Task 3: Issue scoped broadcaster sessions and start Egress

**Files:**
- Create: `reporter/src/features/live/{live-session.model,live-session.model.test.mjs,livekit.server,egress.server,live-session.service,live-session.service.test.mjs}.ts`
- Create: `reporter/src/app/api/live/[requestId]/session/route.ts`
- Modify: `reporter/src/config/env.ts`

**Interfaces:**
- Produces: `requestReporterLiveSession(requestId)` returning `{ serverUrl, token, roomName, startsAt, endsAt, recordingState }`; `startRoomRecording(request)`.

- [ ] **Step 1: Write session-policy tests**

```ts
assert.equal(sessionPolicy({ status: "approved", now: start, startsAt: start, endsAt: end, activeMember: true }).ok, true);
assert.equal(sessionPolicy({ status: "approved", now: afterEnd, startsAt: start, endsAt: end, activeMember: true }).ok, false);
assert.equal(sessionPolicy({ status: "approved", now: start, startsAt: start, endsAt: end, activeMember: false }).ok, false);
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test --workspace @inbcn/reporter -- live-session.model.test.mjs live-session.service.test.mjs`  
Expected: FAIL because session service is absent.

- [ ] **Step 3: Reuse LiveKit patterns with narrower grants**

Create the approved room with bounded empty timeout. Generate an access token whose identity is the reporter profile ID and request ID, with `roomJoin: true`, `room: approvedRoomName`, `canPublish: true`, `canSubscribe: false`, and no room-admin grant. Set TTL to the remaining approved window plus a small disconnect allowance. Start one Room Composite Egress MP4 to the configured private bucket, using a storage key derived only from request/recording UUIDs. Insert the recording row before Egress; duplicate session calls reuse the active room/egress instead of starting another recording.

- [ ] **Step 4: Verify grants and idempotency**

Run: `npm test --workspace @inbcn/reporter`  
Expected: PASS for wrong reporter, pre-window, post-window, revoked permission, grace, suspension, exact token grants, duplicate session, Egress start failure alert, and successful recording start.

- [ ] **Step 5: Commit**

```bash
git add reporter/src/features/live reporter/src/app/api/live reporter/src/config/env.ts
git commit -m "feat(reporter): create scoped recorded live sessions"
```

### Task 4: Build the mobile broadcast studio and emergency termination

**Files:**
- Reuse/adapt: `cms/src/features/broadcast-studio/client/*`
- Reuse/adapt: `cms/src/features/broadcast-studio/components/*`
- Create: `reporter/src/features/live/client/{livekit-client,media-devices,broadcast-controller}.ts`
- Create: `reporter/src/features/live/components/{reporter-broadcast-studio,broadcast-controls,camera-preview,connection-status,recording-banner}.tsx`
- Create: `reporter/src/app/(protected)/live/[requestId]/page.tsx`
- Create: `cms/src/app/api/reporters/live/[id]/terminate/route.ts`

**Interfaces:**
- Consumes: Task 3 session credentials.
- Produces: reporter camera/microphone studio, reconnect behavior, visible recording state; admin emergency termination endpoint.

- [ ] **Step 1: Port controller tests before UI**

```ts
assert.equal(reduceBroadcast(state, { type: "permissions-granted" }).phase, "preview");
assert.equal(reduceBroadcast(liveState, { type: "room-disconnected", reason: "admin-terminated" }).phase, "ended");
assert.equal(recordingAnnouncement("recording"), "This live broadcast is being recorded.");
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test --workspace @inbcn/reporter -- broadcast-controller.test.mjs`  
Expected: FAIL because reporter studio is absent.

- [ ] **Step 3: Implement the smallest adapted studio**

Reuse the existing media-device, preview, connection, and LiveKit client behavior by moving only truly shared pure modules into `packages/domain` if both apps can import them without app config. Keep reporter authorization/session code separate. Show recording disclosure before join and persistent recording/connection indicators during broadcast. Admin termination calls LiveKit room deletion and marks the request terminated; the reporter receives an explicit ended state.

- [ ] **Step 4: Verify browser behavior**

Run: `npm test --workspace @inbcn/reporter && npm run lint --workspace @inbcn/reporter && npm run build --workspace @inbcn/reporter`  
Expected: PASS for device denial, preview cleanup, join/leave, reconnect, recording notice, admin termination, and accessible controls.

- [ ] **Step 5: Commit**

```bash
git add reporter/src/features/live reporter/src/app/'(protected)'/live cms/src/app/api/reporters/live packages/domain/src
git commit -m "feat(reporter): add recorded mobile broadcast studio"
```

### Task 5: Process LiveKit callbacks and add recording editorial review

**Files:**
- Create: `reporter/src/app/api/webhooks/livekit/route.ts`
- Create: `reporter/src/features/live/{livekit-webhook.service,livekit-webhook.service.test.mjs,recording.repository}.ts`
- Create: `cms/src/app/admin/(protected)/reporters/recordings/page.tsx`
- Create: `cms/src/app/admin/(protected)/reporters/recordings/[id]/page.tsx`
- Create: `cms/src/features/admin/reporters/recordings/{recording.model,recording.model.test.mjs,recording.repository,recording.service,recording.actions,recording-list,recording-review}.ts*`

**Interfaces:**
- Produces: `processLiveKitWebhook(rawBody, authorization)`, `publishRecording(id, metadata)`, `rejectRecording(id, reason)`, `setRecordingLegalHold(id, enabled, reason)`.

- [ ] **Step 1: Write callback/review tests**

```ts
assert.equal(mapEgressStatus("EGRESS_COMPLETE"), "ready");
assert.equal(mapEgressStatus("EGRESS_FAILED"), "failed");
assert.equal(canPublishRecording("editor", "ready"), true);
assert.equal(canPublishRecording("editor", "recording"), false);
assert.equal(retentionDate("2026-08-22T00:00:00Z"), "2026-11-20T00:00:00.000Z");
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test --workspace @inbcn/reporter -- livekit-webhook.service.test.mjs`  
Expected: FAIL because callback processing is absent.

- [ ] **Step 3: Implement verified callbacks and review**

Use the LiveKit webhook receiver verification from the installed server SDK. Store unique event receipt before processing. Persist only egress ID, status, file location key, duration, bytes, timestamps, and safe error. Editors can preview through a short-lived authenticated URL, set title/description/category/thumbnail, and publish or reject. Admins additionally control legal hold. Publication writes a safe public replay projection; it never exposes the private object key.

- [ ] **Step 4: Verify callback idempotency and editorial controls**

Run: `npm test --workspace @inbcn/reporter && npm test --workspace @inbcn/cms`  
Expected: PASS for invalid signature, duplicate event, multiple completed segments, failure alert, editor publish/reject, admin legal hold, and private URL expiry.

- [ ] **Step 5: Commit**

```bash
git add reporter/src/app/api/webhooks/livekit reporter/src/features/live cms/src/app/admin/'(protected)'/reporters/recordings cms/src/features/admin/reporters/recordings
git commit -m "feat(cms): review reporter live recordings"
```

### Task 6: Publish replay pages without exposing storage

**Files:**
- Create: `website/src/features/replays/{replay.model,replay.model.test.mjs,replay.repository,replay.service,replay-player}.ts*`
- Create: `website/src/app/[locale]/replays/[id]/page.tsx`
- Create: `website/src/app/[locale]/replays/[id]/not-found.tsx`
- Modify: `cms/src/features/admin/public-revalidation.ts`

**Interfaces:**
- Produces: `getPublicReplay(id, locale)` and public replay route.

- [ ] **Step 1: Test public projection**

```ts
const replay = mapPublicReplay(row);
assert.equal(replay.status, "published");
assert.equal("storageKey" in replay, false);
assert.equal("egressId" in replay, false);
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test --workspace @inbcn/website -- replay.model.test.mjs`  
Expected: FAIL because replay support is absent.

- [ ] **Step 3: Implement safe replay delivery**

Return published metadata and a CDN/signed playback URL produced server-side from the private object. Render reporter attribution using the public reporter projection and existing responsive player conventions. Unpublished, rejected, expired, or held-private recordings return not found. Revalidate replay route after editor publication changes.

- [ ] **Step 4: Verify public replay**

Run: `npm test --workspace @inbcn/website && npm run typecheck --workspace @inbcn/website && npm run build --workspace @inbcn/website`  
Expected: PASS with no object key, credential, egress ID, exact reporter location, or private notes in anonymous responses.

- [ ] **Step 5: Commit**

```bash
git add website/src/features/replays website/src/app/'[locale]'/replays cms/src/features/admin/public-revalidation.ts
git commit -m "feat(website): publish approved broadcast replays"
```

## Live Plan Exit Gate

Run `npm run lint && npm run typecheck && npm test && npm run build`. In LiveKit's test project, verify denied unapproved access, approved-window access, server recording, interrupted output, duplicate callbacks, active admin termination, private editor preview, replay publication, and anonymous inability to read storage metadata.
