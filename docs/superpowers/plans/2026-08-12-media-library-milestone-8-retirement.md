# INBCN Media Library Milestone 8 Retirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add database-authoritative media usage visibility, safe retirement, and restoration without deleting database records or Cloudinary objects.

**Architecture:** Treat `stories.featured_media_id` as the sole authoritative usage relationship. Serialize Story assignment and retirement on the media row, expose lifecycle changes through guarded RPCs, and retain the existing reducer-free Server Action pattern for Media Library mutations.

**Tech Stack:** Next.js 16 App Router and Server Actions, React 19, TypeScript, Supabase/PostgreSQL/RLS, Zod, Radix/shadcn UI, Node test runner.

---

## Scope invariants

- Do not create `media_usages` or a cleanup/outbox table.
- Do not call Cloudinary `destroy` for retirement or restoration.
- Do not permanently delete `public.media` rows.
- Do not modify Homepage Builder, Live TV, Story rendering, or public homepage contracts.
- Use strict red-green TDD and preserve the cumulative Milestone 1–7 worktree.

### Task 1: Lock the schema and consumer contract

**Files:**
- Create: `src/features/admin/media/media-retirement-schema.contract.test.mjs`
- Modify later: `supabase/migrations/<next_timestamp>_media_retirement.sql`

- [ ] **Step 1: Write the failing schema contract**

```js
test("retirement is RPC-only and Story assignment rejects retired media", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /create or replace function public\.retire_media_asset/u);
  assert.match(sql, /create or replace function public\.restore_media_asset/u);
  assert.match(sql, /before insert or update of featured_media_id/u);
  assert.match(sql, /for key share/u);
  assert.match(sql, /for update/u);
  assert.match(sql, /revoke delete on table public\.media from authenticated/u);
  assert.doesNotMatch(sql, /media_usages|cloudinary|cleanup|retention/u);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/features/admin/media/media-retirement-schema.contract.test.mjs`

Expected: FAIL because the retirement migration does not exist.

- [ ] **Step 3: Create the additive migration**

Use the next unused migration timestamp after checking `supabase/migrations`. The migration must implement this transaction shape:

```sql
create or replace function public.assert_story_featured_media_active()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare selected_media public.media%rowtype;
begin
  if new.featured_media_id is null then return new; end if;
  select * into selected_media
  from public.media
  where id = new.featured_media_id
  for key share;
  if not found or selected_media.deleted_at is not null or selected_media.media_type <> 'image' then
    raise exception using errcode = '23514', message = 'Featured media is unavailable';
  end if;
  return new;
end;
$$;

create trigger stories_featured_media_active
before insert or update of featured_media_id on public.stories
for each row execute function public.assert_story_featured_media_active();
```

Create `retire_media_asset(media_id uuid, expected_updated_at timestamptz)` with editor/admin role validation, `SELECT ... FOR UPDATE`, stale timestamp comparison, a Story existence check, and one update setting `deleted_at`, `deleted_by`, `updated_at`, and `updated_by`. Create the symmetric restore function clearing the deletion columns. Revoke direct media delete and lifecycle-column updates from authenticated callers; grant only the non-lifecycle columns required by current repository writes.

- [ ] **Step 4: Run the schema contract and verify GREEN**

Run: `npm test -- src/features/admin/media/media-retirement-schema.contract.test.mjs`

Expected: PASS with no `media_usages`, cleanup, or provider deletion SQL.

- [ ] **Step 5: Commit after the implementation session receives commit approval**

```powershell
git add supabase/migrations/<next_timestamp>_media_retirement.sql src/features/admin/media/media-retirement-schema.contract.test.mjs
git commit -m "feat(media): add authoritative retirement boundary"
```

### Task 2: Verify database concurrency and permissions

**Files:**
- Create: `supabase/verification/media-retirement-verification.sql`
- Modify: `src/features/admin/media/media-retirement-schema.contract.test.mjs`

- [ ] **Step 1: Add failing contracts for the verification script**

```js
test("verification covers roles, stale writes, and both lock orders", async () => {
  const sql = await readFile("supabase/verification/media-retirement-verification.sql", "utf8");
  for (const scenario of ["writer", "editor", "admin", "stale", "assignment wins", "retirement wins", "simultaneous retirement"])
    assert.match(sql, new RegExp(scenario, "iu"));
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- src/features/admin/media/media-retirement-schema.contract.test.mjs`

Expected: FAIL because the verification script is absent.

- [ ] **Step 3: Add transactional SQL scenarios**

The script must create disposable fixtures, use two explicit sessions for each lock-order case, assert writer denial, editor/admin success, referenced-media denial, retired assignment denial, stale conflict, idempotent second retirement behavior, restore, direct update denial, and direct delete denial. It must roll back all fixtures.

- [ ] **Step 4: Execute against a disposable Supabase database**

Run: `psql "$env:SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/verification/media-retirement-verification.sql`

Expected: every assertion passes; production/linked databases are not used.

### Task 3: Add usage and lifecycle repository methods

**Files:**
- Modify: `src/features/admin/media/media.repository.ts`
- Modify: `src/features/admin/media/media.types.ts`
- Modify: `src/features/admin/media/media.repository.test.mjs`

- [ ] **Step 1: Write failing repository contracts**

```js
test("repository loads Story usage and invokes lifecycle RPCs without delete", async () => {
  const source = await readFile("src/features/admin/media/media.repository.ts", "utf8");
  assert.match(source, /getMediaStoryUsages/u);
  assert.match(source, /title, status, language_id/u);
  assert.match(source, /rpc\("retire_media_asset"/u);
  assert.match(source, /rpc\("restore_media_asset"/u);
  assert.doesNotMatch(source, /from\("media"\)\.delete|export async function deleteMedia/u);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- src/features/admin/media/media.repository.test.mjs`

Expected: FAIL because usage/RPC methods are absent and hard delete remains.

- [ ] **Step 3: Define focused types and methods**

```ts
export type MediaStoryUsage = Readonly<{
  storyId: string;
  title: string;
  status: DatabaseEnum<"story_status">;
  languageId: string;
  languageCode: string;
  adminHref: string;
}>;

export async function retireMediaRecord(id: string, expectedUpdatedAt: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("retire_media_asset", {
    media_id: id,
    expected_updated_at: expectedUpdatedAt,
  });
  assertRepositoryQuerySucceeded(error, "retire media");
}
```

Add the symmetric restore method and a Story usage query ordered by title/id. Add a separate lifecycle loader that can read active or retired media for managers. Remove `deleteMedia`.

- [ ] **Step 4: Run and verify GREEN**

Run: `npm test -- src/features/admin/media/media.repository.test.mjs && npx tsc --noEmit`

Expected: repository tests and TypeScript pass.

### Task 4: Replace hard deletion with retirement service behavior

**Files:**
- Modify: `src/features/admin/media/media.operations.ts`
- Modify: `src/features/admin/media/media.service.ts`
- Modify: `src/features/admin/media/media.operations.test.mjs`
- Create: `src/features/admin/media/media-lifecycle.service.test.mjs`

- [ ] **Step 1: Write failing lifecycle tests**

```js
test("referenced media cannot retire and no provider deletion occurs", async () => {
  const calls = [];
  const result = await retireMedia(admin, mediaId, updatedAt, dependencies(calls));
  assert.equal(result.code, "IN_USE");
  assert.deepEqual(calls.filter((call) => call.kind === "cloudinary"), []);
});
```

Cover unused success, used denial, retired/not found, stale conflict, restore, unauthorized writer, and sanitized persistence failure.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- src/features/admin/media/media.operations.test.mjs src/features/admin/media/media-lifecycle.service.test.mjs`

Expected: FAIL because retirement/restoration results are absent.

- [ ] **Step 3: Implement minimum service boundary**

```ts
export type MediaLifecycleResult =
  | Readonly<{ ok: true; state: "retired" | "active" }>
  | Readonly<{ ok: false; code: "NOT_FOUND" | "IN_USE" | "CONFLICT" | "ALREADY_RETIRED" }>;

export async function retireMedia(
  admin: AdminIdentity,
  id: string,
  expectedUpdatedAt: string,
): Promise<MediaLifecycleResult> {
  requireMediaManager(admin);
  return runLifecycleRpc(() => retireMediaRecord(id, expectedUpdatedAt));
}
```

Remove the `remove` operation and all Cloudinary destroy calls associated with user deletion. Keep destroy only for upload compensation and replacement cleanup.

- [ ] **Step 4: Run and verify GREEN**

Run: `npm test -- src/features/admin/media/media.operations.test.mjs src/features/admin/media/media-lifecycle.service.test.mjs`

Expected: all lifecycle tests pass and no retirement path references Cloudinary.

### Task 5: Add authenticated lifecycle Server Actions

**Files:**
- Modify: `src/features/admin/media/media.actions.ts`
- Create: `src/features/admin/media/media-lifecycle.actions.test.mjs`

- [ ] **Step 1: Write failing action contracts**

```js
test("lifecycle actions authenticate, require stale tokens, and revalidate only after success", async () => {
  const source = await readFile("src/features/admin/media/media.actions.ts", "utf8");
  assert.match(source, /retireMediaAction[\s\S]*requireAdminUser/u);
  assert.match(source, /restoreMediaAction[\s\S]*expectedUpdatedAt/u);
  assert.doesNotMatch(source, /deleteMediaAction|changed=deleted/u);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- src/features/admin/media/media-lifecycle.actions.test.mjs`

Expected: FAIL because lifecycle actions do not exist.

- [ ] **Step 3: Add typed actions**

Return `success`, `in-use`, `conflict`, `not-found`, or sanitized `error`. On success call the existing media refresh helper for `/admin/media`, `/admin/stories`, `/en`, `/hi`, and `/mr`. Do not redirect on failure, call Cloudinary, or accept `deletedBy` from form data.

- [ ] **Step 4: Run and verify GREEN**

Run: `npm test -- src/features/admin/media/media-lifecycle.actions.test.mjs`

Expected: PASS.

### Task 6: Add usage and retirement UI

**Files:**
- Create: `src/features/admin/media/media-usage-list.tsx`
- Create: `src/features/admin/media/media-lifecycle-controls.tsx`
- Modify: `src/features/admin/media/media-preview-dialog.tsx`
- Modify: `src/features/admin/media/media-library.tsx`
- Create: `src/features/admin/media/media-lifecycle.contract.test.mjs`

- [ ] **Step 1: Write failing accessibility/UI contracts**

```js
test("used media explains Story references and cannot expose retirement", async () => {
  const source = await readFile("src/features/admin/media/media-lifecycle-controls.tsx", "utf8");
  assert.match(source, /Used by .* Stories/u);
  assert.match(source, /Cannot retire/u);
  assert.match(source, /aria-live="polite"/u);
  assert.match(source, /expectedUpdatedAt/u);
  assert.doesNotMatch(source, /delete permanently|Cloudinary|media UUID/u);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- src/features/admin/media/media-lifecycle.contract.test.mjs`

Expected: FAIL because lifecycle components do not exist.

- [ ] **Step 3: Implement accessible lifecycle presentation**

Render Story title, status, locale, and admin link. Show optional “Also placed in Hero Story/Hero Sidebar” annotations only when derived from persisted configuration. Disable retirement while usage exists. Add confirmation, pending state, conflict/in-use announcements, Retired filtering, and Restore. Keep UUIDs and provider internals hidden; preserve Radix focus restoration.

- [ ] **Step 4: Run and verify GREEN**

Run: `npm test -- src/features/admin/media/media-lifecycle.contract.test.mjs`

Expected: PASS.

### Task 7: Regression and full verification

**Files:**
- Modify: `src/features/admin/media/media-picker.contract.test.mjs`
- Modify: `src/features/admin/stories/story-media-integration.contract.test.mjs`
- Modify: `src/features/homepage-builder/homepage-media-compatibility.contract.test.mjs`
- Modify: `docs/media-library.md`

- [ ] **Step 1: Add regression assertions**

Assert active library/picker queries exclude `deleted_at`, restored assets return, Story rendering keeps `featured_media_id`, Homepage Builder remains Story/category based, and no lifecycle code imports Cloudinary destroy.

- [ ] **Step 2: Run focused verification**

```powershell
npm test -- src/features/admin/media/media-retirement-schema.contract.test.mjs src/features/admin/media/media.repository.test.mjs src/features/admin/media/media.operations.test.mjs src/features/admin/media/media-lifecycle.service.test.mjs src/features/admin/media/media-lifecycle.actions.test.mjs src/features/admin/media/media-lifecycle.contract.test.mjs src/features/admin/media/media-picker.contract.test.mjs src/features/admin/stories/story-media-integration.contract.test.mjs src/features/homepage-builder/homepage-media-compatibility.contract.test.mjs
```

Expected: all focused tests pass.

- [ ] **Step 3: Run full verification**

```powershell
npm test
npx tsc --noEmit
npm run lint
npm run build
git diff --check
git status --short
```

Expected: zero failures/errors; only approved Milestone 8 implementation files plus the cumulative earlier milestone worktree appear.

- [ ] **Step 4: Audit prohibited scope**

```powershell
rg -n "media_usages|cleanup_queue|retention|permanent delete" src supabase/migrations
git diff -- package.json package-lock.json .env .env.local src/features/homepage-builder src/features/live-tv
```

Expected: no new usage table, cleanup queue, dependency/environment change, Homepage Builder change, or Live TV change.

## Plan self-review

- The plan uses Story FK data as the sole retirement authority.
- Every production behavior begins with a focused failing test.
- The trigger/RPC lock protocol covers assignment/retirement races.
- No task adds permanent deletion, provider cleanup, retention, `media_usages`, Homepage Builder changes, or Live TV integration.
- Function/type names are consistent across repository, service, actions, and UI tasks.
