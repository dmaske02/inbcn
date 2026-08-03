# INBCN Public Backend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every hardcoded public editorial item with one repository-backed homepage snapshot while preserving the approved UI markup and CSS.

**Architecture:** Extend the existing homepage view model so one cached server service call composes stories, categories, and managed alerts. Bind that view model into the existing prototype chrome and homepage JSX without altering class names or CSS. Keep category, search, story-reader, admin, and Supabase repository boundaries authoritative.

**Tech Stack:** Next.js 16 Server Components, React 19, TypeScript, Supabase, next-intl, Node test runner.

## Global Constraints

- Do not modify CSS, visual class names, component hierarchy, spacing, typography, colors, responsive behavior, or animations.
- Public stories require status published, non-null published_at, and published_at no later than the query time.
- Use existing repositories and services; do not add a public API or query Supabase inside UI components.
- Homepage collections are mutually exclusive in this order: Featured, Breaking, Top Headlines, Trending, Category Rails, Latest, Editor Picks.
- Hide empty optional sections; never synthesize, repeat, or display placeholder editorial content.

---

### Task 1: Enforce public-story eligibility in repository queries

**Files:**
- Modify: `src/features/news/server/stories.repository.ts`
- Modify: `src/features/news/server/stories.search-query.mjs`
- Test: `src/features/news/server/stories.search-query.test.mjs`
- Create: `src/features/news/server/stories.public-eligibility.contract.test.mjs`

**Interfaces:**
- Produces: every public repository query filters `status = published`, requires `published_at`, and applies `published_at <= now`.
- Consumes: existing `getStoriesByLanguage`, `getStoryBySlug`, category pagination, and search interfaces unchanged.

- [ ] **Step 1: Write failing eligibility tests**

Assert that the search builder and every public story-query path contains an upper-bound publication filter:

```js
assert.equal(capturedUrl.searchParams.get("published_at"), `lte.${now}`);
assert.match(repositorySource, /\.lte\("published_at", new Date\(\)\.toISOString\(\)\)/u);
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON src/features/news/server/stories.search-query.test.mjs src/features/news/server/stories.public-eligibility.contract.test.mjs`

Expected: FAIL because scheduled future rows are not currently bounded.

- [ ] **Step 3: Add the minimal query filters**

Add `.lte("published_at", new Date().toISOString())` to public list, detail, category, featured-candidate, and related-story queries. Pass a stable `now` into `buildPublishedStorySearchRequest` so its tests remain deterministic.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/features/news/server/stories.repository.ts src/features/news/server/stories.search-query.mjs src/features/news/server/stories.search-query.test.mjs src/features/news/server/stories.public-eligibility.contract.test.mjs
git commit -m "fix: exclude scheduled stories from public queries"
```

### Task 2: Compose one deduplicated homepage snapshot

**Files:**
- Modify: `src/features/news/server/services/homepage.model.ts`
- Modify: `src/features/news/server/services/homepage.service.ts`
- Test: `src/features/news/server/services/homepage.model.test.mjs`
- Create: `src/features/news/server/services/homepage.service.contract.test.mjs`

**Interfaces:**
- Produces: `HomepageViewModel` with `featured`, `breaking`, `pinnedAlert`, `topHeadlines`, `latest`, `trending`, `categoryRails`, and `editorPicks`.
- Consumes: `getStoriesByLanguage(locale)`, `getCategories(locale)`, and `getPublicBreakingAlerts(locale)`.

- [ ] **Step 1: Write failing composition tests**

Create stories with overlapping Featured and Breaking flags and assert exact priority and mutual exclusion:

```js
const ids = [
  result.featured?.id,
  ...result.breaking.map(({ id }) => id),
  ...result.topHeadlines.map(({ id }) => id),
  ...result.trending.map(({ id }) => id),
  ...result.categoryRails.flatMap(({ stories }) => stories.map(({ id }) => id)),
  ...result.latest.map(({ id }) => id),
  ...result.editorPicks.map(({ id }) => id),
].filter(Boolean);
assert.equal(new Set(ids).size, ids.length);
```

Also assert newest Featured wins, Breaking is descending, zero-story categories are absent, and empty datasets produce null/empty collections.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON src/features/news/server/services/homepage.model.test.mjs src/features/news/server/services/homepage.service.contract.test.mjs`

Expected: FAIL because the existing view model reuses stories and has no alert snapshot.

- [ ] **Step 3: Implement priority allocation**

Sort once by `publishedAt`, maintain an `assignedIds` set, and allocate collections in the specified order. Map active alert placement `pinned_banner` to:

```ts
type HomepagePinnedAlert = Readonly<{
  id: string;
  title: string;
  message: string;
  dismissible: boolean;
}>;
```

Wrap `getHomepageData` in React `cache` so the locale layout and page share one request snapshot.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/features/news/server/services/homepage.model.ts src/features/news/server/services/homepage.service.ts src/features/news/server/services/homepage.model.test.mjs src/features/news/server/services/homepage.service.contract.test.mjs
git commit -m "feat: compose live homepage snapshot"
```

### Task 3: Bind backend Breaking and Pinned data into the frozen chrome

**Files:**
- Modify: `src/components/layout/public/prototype-chrome.tsx`
- Modify: `src/components/layout/public/public-layout.tsx`
- Modify: `src/app/[locale]/layout.tsx`
- Test: `src/components/layout/public/prototype-fidelity.contract.test.mjs`
- Create: `src/components/layout/public/prototype-data.contract.test.mjs`

**Interfaces:**
- Consumes: cached `getHomepageData(locale)` snapshot.
- Produces: `PrototypeChrome({ locale, breaking, pinnedAlert })` with unchanged class names and DOM order.

- [ ] **Step 1: Write failing data-binding contracts**

Assert the chrome contains no editorial headline literals, no fixed date, no `Demo update`, and renders ticker items from `breaking.map`. Assert ticker and pinned wrappers are conditional.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON src/components/layout/public/prototype-fidelity.contract.test.mjs src/components/layout/public/prototype-data.contract.test.mjs`

Expected: FAIL on the current hardcoded ticker and alert.

- [ ] **Step 3: Bind props without changing visual classes**

Retain `proto-ticker`, `proto-breaking-surfaces`, `proto-pinned-alert`, animation track duplication, and dismiss behavior. Duplicate the backend Breaking array only inside the animation track, using stable story IDs and links; this is visual marquee repetition, not section duplication. Keep the approved non-editorial utility chrome unchanged, format the top-strip date from the request date, and remove only the prototype-only `Demo update` ticker action.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/components/layout/public/prototype-chrome.tsx src/components/layout/public/public-layout.tsx src/app/[locale]/layout.tsx src/components/layout/public/prototype-fidelity.contract.test.mjs src/components/layout/public/prototype-data.contract.test.mjs
git commit -m "feat: bind live alerts to public chrome"
```

### Task 4: Bind every homepage section to the snapshot

**Files:**
- Modify: `src/features/news/components/homepage.tsx`
- Modify: `src/features/news/components/homepage-skeleton.tsx` only if conditional data loading requires it; do not change visual geometry.
- Replace: `src/features/news/components/homepage.messages.test.mjs` with data-binding contracts if its old message assertions are obsolete.
- Create: `src/features/news/components/homepage.backend-data.contract.test.mjs`

**Interfaces:**
- Consumes: the Task 2 `HomepageViewModel`.
- Produces: the same approved JSX classes populated only from snapshot fields.

- [ ] **Step 1: Write failing hardcoded-content and visibility tests**

Assert no module-level story/rail arrays, no known demo headlines, no fake minute arithmetic, and conditional rendering for all optional collections. Assert each card links to `story.href`, uses `story.title`, `story.summary`, `story.categoryName`, `story.image`, and formats `story.publishedAt`.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON src/features/news/components/homepage.backend-data.contract.test.mjs`

Expected: FAIL because the approved JSX currently consumes static arrays.

- [ ] **Step 3: Replace values, not structure**

Keep every `proto-*` class and the section order. Replace editorial literals and placeholder visual elements with backend fields and `next/image`. Render Featured, Breaking-dependent surfaces, Top Headlines, Trending, category rails, Latest, and Editor Picks only when their collections are non-empty. Keep advertisement labels because they are UI inventory rather than editorial data.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2 plus `npm test`. Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/features/news/components/homepage.tsx src/features/news/components/homepage-skeleton.tsx src/features/news/components/homepage.messages.test.mjs src/features/news/components/homepage.backend-data.contract.test.mjs
git commit -m "feat: render homepage from backend snapshot"
```

### Task 5: Complete related-story fallback and mutation revalidation

**Files:**
- Modify: `src/features/news/server/services/story-reader.service.ts`
- Modify: `src/features/news/server/services/story-reader.model.ts`
- Test: `src/features/news/server/services/story-reader.model.test.mjs`
- Modify: `src/features/admin/stories/story.actions.ts`
- Modify: `src/features/alerts/breaking-alerts.actions.ts`
- Modify: `src/features/admin/imports/ingestion.actions.ts`
- Create: `src/features/admin/public-revalidation.contract.test.mjs`

**Interfaces:**
- Consumes: existing story/category repositories and admin command services.
- Produces: same-category related stories with newest-published fallback and complete locale/category/story/search revalidation.

- [ ] **Step 1: Write failing related-story and revalidation tests**

Assert related selection excludes the current story, fills from same category first, then newest eligible stories. Assert story/alert mutations revalidate `/en`, `/hi`, `/mr`, affected category paths, story paths, and search pages.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON src/features/news/server/services/story-reader.model.test.mjs src/features/admin/public-revalidation.contract.test.mjs`

Expected: FAIL because fallback and complete public-path invalidation are absent.

- [ ] **Step 3: Implement fallback and centralized invalidation**

Add a small server-only helper that accepts changed locale/category/slug when known and calls `revalidatePath` for homepage, category, story, and search routes. Call it after successful create/save/command/bulk/alert/import mutations. Query newest eligible stories only when same-category related results do not fill the existing four-card limit.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/features/news/server/services/story-reader.service.ts src/features/news/server/services/story-reader.model.ts src/features/news/server/services/story-reader.model.test.mjs src/features/admin/stories/story.actions.ts src/features/alerts/breaking-alerts.actions.ts src/features/admin/imports/ingestion.actions.ts src/features/admin/public-revalidation.contract.test.mjs
git commit -m "feat: refresh public news after editorial changes"
```

### Task 6: Repository-wide editorial sweep and visual verification

**Files:**
- Modify only public presentation files identified by the scan as containing fake editorial values.
- Test: `src/components/layout/public/prototype-fidelity.contract.test.mjs`
- Test: `src/features/news/components/homepage.backend-data.contract.test.mjs`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified backend-only public content with unchanged approved visual geometry.

- [ ] **Step 1: Scan for forbidden public editorial content**

Run:

```powershell
rg -n -i "fixture|mock|demo|sample|fake|placeholder|dummy|const stories|const rails" src/app/[locale] src/features/news src/components/layout/public
```

Classify test fixtures, loading skeletons, image fallback assets, input placeholders, and advertisement slots as non-editorial. Remove every production editorial literal found.

- [ ] **Step 2: Run complete automated verification**

Run:

```powershell
npm test
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 3: Compare frozen UI before and after**

At the same desktop and mobile viewports, capture the public homepage with seeded backend records. Compare header, navigation, ticker placement, pinned alert placement, hero grid, section grids, footer, and responsive breakpoints. Only text wrapping caused by real backend content may differ; computed class names and layout geometry must remain unchanged.

- [ ] **Step 4: Verify live publication flow**

Create a draft in Admin and confirm it is absent publicly. Publish it and confirm it appears without restart. Toggle Featured and Breaking and confirm the hero/ticker update. Archive or unpublish it and confirm it disappears. Activate/deactivate a managed pinned alert and confirm visibility follows backend state.

- [ ] **Step 5: Commit verification-only test changes if any**

```powershell
git add src
git commit -m "test: verify backend-only public news"
```
