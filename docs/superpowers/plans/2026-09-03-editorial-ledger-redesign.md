# INBCN Editorial Ledger Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a cohesive editorial-ledger presentation across the INBCN public shell, homepage, category, search, and Live TV routes without changing their loaders, view models, localization, or URLs.

**Architecture:** Keep `PublicLayout` as the server boundary and move interactive shell behavior into focused client components. Build shared, view-model-only editorial primitives, then migrate each route family and both homepage renderer paths onto them while leaving all service and routing contracts intact.

**Tech Stack:** Next.js 16.3 App Router, React 19.2, TypeScript 5, Tailwind CSS 4, next-intl 4, lucide-react, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-03-editorial-ledger-redesign-design.md`

## Global Constraints

- Preserve all current Supabase repositories, route loaders, DTO mapping, metadata, JSON-LD, and public URLs.
- Preserve all three locales and locale-switch path/query/hash behavior.
- Use page `oklch(98% 0.004 95)`, surface `oklch(100% 0.002 95)`, ink `oklch(20% 0.018 70)`, muted `oklch(48% 0.012 70)`, soft tint `oklch(96% 0.006 95)`, border `oklch(90% 0.006 95)`, crimson `oklch(45% 0.17 28)`, and inverted `oklch(17% 0.018 70)`.
- Use an 1180px public container, serif headlines, system sans body copy, and monospace metadata.
- Sponsor media reserves `8 / 1` on desktop and `3 / 1` on mobile.
- Do not add a search API, suggestion service, saved-story backend, new stream provider, or database migration.
- Read the applicable Next.js 16 docs in `node_modules/next/dist/docs/` before implementing App Router, client-boundary, image, link, font, or CSS changes.
- Apply TDD to each task and preserve unrelated working-tree changes.

---

## File Structure

### New files

- `website/src/components/layout/public/editorial-shell.tsx` — interactive universal masthead, edition strip, drawer, breaking ticker, and pinned alert.
- `website/src/components/layout/public/search-dialog.tsx` — accessible localized modal search form.
- `website/src/components/layout/public/editorial-footer.tsx` — universal editorial footer.
- `website/src/components/layout/public/editorial-shell.contract.test.mjs` — source contracts for shell routing, localization, interaction boundaries, and footer.
- `website/src/components/editorial/editorial-section-header.tsx` — reusable rule-based section heading.
- `website/src/components/editorial/ledger-story-row.tsx` — shared story listing row.
- `website/src/components/editorial/editorial-sponsor-row.tsx` — stable inline advertising row.
- `website/src/components/editorial/ranked-story-list.tsx` — zero-padded ranked list.
- `website/src/components/editorial/story-action-buttons.tsx` — persistent local save and share fallback.
- `website/src/components/editorial/index.ts` — public exports for editorial primitives.
- `website/src/components/editorial/editorial-primitives.contract.test.mjs` — interface, persistence, share, and layout contracts.

### Modified files

- `website/src/app/globals.css` — semantic token layer, shared typography/layout utilities, and removal/replacement of legacy cream/boxed presentation.
- `website/src/app/layout.tsx` — retain multilingual font loading while exposing the approved system/serif/mono stacks.
- `website/src/components/layout/public/public-layout.tsx` — render the editorial shell/footer and supply localized strings.
- `website/src/components/layout/public/index.ts` — export new shared shell components where needed.
- `website/messages/en.json`, `website/messages/hi.json`, `website/messages/mr.json` — localized search-dialog and shell labels.
- `website/src/features/news/components/homepage-sections.tsx` — split hero, ledger feed, ranked discovery, editor feature, and category rails.
- `website/src/features/news/components/homepage.tsx` — fallback homepage composition and sponsor row.
- `website/src/features/homepage-renderer/components/homepage-builder-layout.tsx` — 1180px builder grid and 5:4 hero composition.
- `website/src/features/homepage-renderer/components/homepage-block-renderers.tsx` — shared Live TV briefing and editorial block boundaries.
- `website/src/features/homepage-renderer/components/hero-sidebar-renderer.tsx` — editor-feature presentation.
- `website/src/app/[locale]/category/[slug]/page.tsx` — ledger results and inline sponsor placement.
- `website/src/app/[locale]/search/page.tsx` — ledger results and inline sponsor placement.
- `website/src/features/live-tv/components/live-tv-experience.tsx` — inverted player/schedule briefing.
- `website/src/features/live-tv/components/live-tv-story-section.tsx` — ledger-compatible related story presentation.
- Existing relevant contract tests — update assertions from `.proto-*` implementation details to editorial semantic contracts.

---

### Task 1: Editorial Tokens and Global Foundations

**Files:**
- Create: `website/src/app/editorial-tokens.contract.test.mjs`
- Modify: `website/src/app/globals.css`
- Modify: `website/src/app/layout.tsx`

**Interfaces:**
- Produces CSS custom properties `--editorial-bg`, `--editorial-surface`, `--editorial-fg`, `--editorial-muted`, `--editorial-fg-soft`, `--editorial-border`, `--editorial-accent`, `--editorial-inverted`, `--editorial-serif`, `--editorial-sans`, `--editorial-mono`, and `--editorial-container`.
- Produces utility classes `.editorial-container`, `.editorial-headline`, `.editorial-meta`, `.editorial-hairline`, and `.editorial-page`.

- [ ] **Step 1: Read the Next.js CSS and font guides**

Read:

```text
node_modules/next/dist/docs/01-app/01-getting-started/11-css.md
node_modules/next/dist/docs/01-app/01-getting-started/13-fonts.md
```

Confirm global CSS stays imported only from the root layout and existing `next/font` variables remain available as multilingual fallbacks.

- [ ] **Step 2: Write the failing token contract**

Create a Node source-contract test that reads `globals.css` and asserts every exact OKLCH value, the 1180px container, `text-wrap:balance`, system sans/serif/mono stacks, one-pixel hairlines, and a reduced-motion rule. Assert `.public-site` no longer assigns the legacy `#f6f3ed` canvas.

- [ ] **Step 3: Run the token contract and confirm red**

Run:

```bash
cd website && npm test -- src/app/editorial-tokens.contract.test.mjs
```

Expected: FAIL because the editorial variables and utilities do not exist.

- [ ] **Step 4: Implement the semantic token and utility layer**

Add the exact variables to the existing Tailwind theme/root layer, map public background/foreground/border tokens to them, and define the five shared utilities. Retain `next/font` language support but make the editorial serif stack begin with Charter/Iowan/Georgia and the metadata stack begin with `ui-monospace`.

- [ ] **Step 5: Remove conflicting public-shell washes**

Replace the legacy public cream canvas, repeated hard-coded beige surfaces, generic heavy shadows, and harsh dashed/boxed presentation used by the public shell with semantic variables. Do not remove styles still required by unmigrated page components in this task; layer the new tokens so Tasks 5–8 can migrate safely.

- [ ] **Step 6: Verify and commit the foundation**

Run:

```bash
cd website && npm test -- src/app/editorial-tokens.contract.test.mjs
cd website && npm run typecheck
```

Expected: both PASS.

Commit only the token test, global CSS, and root layout changes with `feat: add editorial design tokens`.

### Task 2: Search Dialog

**Files:**
- Create: `website/src/components/layout/public/search-dialog.tsx`
- Create: `website/src/components/layout/public/search-dialog.contract.test.mjs`
- Modify: `website/messages/en.json`
- Modify: `website/messages/hi.json`
- Modify: `website/messages/mr.json`

**Interfaces:**
- Produces `SearchDialog({ locale, labels }: { locale: PublicLocale; labels: SearchDialogLabels }): React.JSX.Element`.
- `SearchDialogLabels` contains `open`, `close`, `title`, `description`, `placeholder`, and `submit` strings.
- Submits a GET form with `name="q"` to `/${locale}/search`.

- [ ] **Step 1: Read the client-boundary and forms guides**

Read:

```text
node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md
node_modules/next/dist/docs/01-app/02-guides/forms.md
node_modules/next/dist/docs/03-architecture/accessibility.md
```

- [ ] **Step 2: Write the failing dialog contract**

Assert the component is a client boundary, exposes a button with `aria-haspopup="dialog"`, renders `role="dialog"` and `aria-modal="true"`, submits the localized GET form using `q`, supports Escape and backdrop dismissal, focuses the input on open, restores trigger focus on close, and locks document scrolling while open.

- [ ] **Step 3: Run the dialog contract and confirm red**

Run `cd website && npm test -- src/components/layout/public/search-dialog.contract.test.mjs`.

Expected: FAIL because `search-dialog.tsx` does not exist.

- [ ] **Step 4: Implement the dialog**

Use React state and refs in one client component. Render the dialog only when open, store the trigger element, focus the search input after mount, attach an Escape listener, prevent body scroll with cleanup, and close only when the pointer event targets the backdrop itself. Keep submission native and localized; do not fetch results client-side.

- [ ] **Step 5: Add localized labels**

Add the same six `publicChrome.searchDialog` keys to English, Hindi, and Marathi, with native translations and no missing-message fallback.

- [ ] **Step 6: Verify and commit the dialog**

Run:

```bash
cd website && npm test -- src/components/layout/public/search-dialog.contract.test.mjs src/components/layout/public/public-chrome.messages.test.mjs
cd website && npm run typecheck
```

Expected: all PASS.

Commit the dialog, test, and message files with `feat: add localized editorial search dialog`.

### Task 3: Universal Editorial Masthead and Edition Strip

**Files:**
- Create: `website/src/components/layout/public/editorial-shell.tsx`
- Create: `website/src/components/layout/public/editorial-shell.contract.test.mjs`
- Modify: `website/src/components/layout/public/public-layout.tsx`
- Modify: `website/src/components/layout/public/index.ts`
- Modify: `website/src/components/layout/public/prototype-data.contract.test.mjs`
- Modify: `website/src/components/layout/public/prototype-fidelity.contract.test.mjs`

**Interfaces:**
- Produces `EditorialShellProps` with the existing `locale`, `breaking`, `pinnedAlert`, `currentDate`, and localized chrome labels plus `searchDialog` labels.
- Consumes `SearchDialog` from Task 2.
- Preserves `navigationHref(locale, path)` and `localizePublicPath(...)` behavior.

- [ ] **Step 1: Write failing shell contracts**

Assert the shell contains sticky positioning, 12px backdrop blur, logo home link, existing category path mappings, Live TV route, `SearchDialog`, sign-in control, edition strip, date, weather, all locale buttons, mobile drawer, Live TV as the first drawer destination, breaking-story links, dismissible pinned alert, and reduced-motion-friendly ticker classes. Assert the old inline header search form is absent.

- [ ] **Step 2: Run shell contracts and confirm red**

Run:

```bash
cd website && npm test -- src/components/layout/public/editorial-shell.contract.test.mjs src/components/layout/public/prototype-data.contract.test.mjs src/components/layout/public/prototype-fidelity.contract.test.mjs
```

Expected: FAIL because `EditorialShell` is absent and old structural assertions still target `PrototypeChrome`.

- [ ] **Step 3: Implement the universal shell**

Move the existing route tables and locale-preserving navigation logic into `editorial-shell.tsx`. Compose desktop navigation, Live TV indicator, search dialog, sign-in action, and menu trigger in the sticky masthead. Place the edition strip directly below it. Preserve server-formatted dates, breaking data, pinned-alert state, and mobile drawer behavior.

- [ ] **Step 4: Switch `PublicLayout` to the new shell**

Import `EditorialShell`, expand translated labels for the dialog, and render the shell whenever homepage snapshot data is available. Keep slot overrides unchanged so callers can still provide a custom header/footer.

- [ ] **Step 5: Restyle shell surfaces**

Add focused `.editorial-shell-*` CSS rules using only the Task 1 variables. Ensure desktop category links underline on hover/focus, tablet navigation scrolls horizontally, mobile controls remain at least 44px, and no shell layer creates horizontal overflow.

- [ ] **Step 6: Update existing contracts and verify**

Change old tests only where they assert `.proto-*` implementation details. Retain assertions for route mappings, server data, locale preservation, Live TV order, labels, and dismissible breaking content.

Run:

```bash
cd website && npm test -- src/components/layout/public/editorial-shell.contract.test.mjs src/components/layout/public/prototype-data.contract.test.mjs src/components/layout/public/prototype-fidelity.contract.test.mjs src/components/layout/public/public-chrome.messages.test.mjs
cd website && npm run typecheck
```

Expected: all PASS.

Commit shell files and related contracts with `feat: replace public chrome with editorial shell`.

### Task 4: Universal Editorial Footer and Phase 1–2 Checkpoint

**Files:**
- Create: `website/src/components/layout/public/editorial-footer.tsx`
- Modify: `website/src/components/layout/public/editorial-shell.contract.test.mjs`
- Modify: `website/src/components/layout/public/public-layout.tsx`
- Modify: `website/src/components/layout/public/index.ts`

**Interfaces:**
- Produces `EditorialFooter({ locale }: { locale: PublicLocale }): Promise<React.JSX.Element>`.
- Preserves all existing company, policy, service, Live TV, fact-check, newsletter, and contact destinations and localized footer copy.

- [ ] **Step 1: Extend the failing shell contract for the footer**

Assert the footer uses the shared container and semantic inverted/accent tokens, renders all current localized navigation groups, retains the newsletter email field, and contains no legacy `.proto-footer` class.

- [ ] **Step 2: Run the footer contract and confirm red**

Run `cd website && npm test -- src/components/layout/public/editorial-shell.contract.test.mjs`.

Expected: FAIL because `EditorialFooter` is absent.

- [ ] **Step 3: Implement and wire the footer**

Move the current localized footer content to the new focused server component, preserve links and form semantics, and update `PublicLayout` to use it by default while preserving the `footer` slot override.

- [ ] **Step 4: Verify Phases 1–2**

Run:

```bash
cd website && npm test -- src/app/editorial-tokens.contract.test.mjs src/components/layout/public/search-dialog.contract.test.mjs src/components/layout/public/editorial-shell.contract.test.mjs src/components/layout/public/prototype-data.contract.test.mjs src/components/layout/public/prototype-fidelity.contract.test.mjs src/components/layout/public/public-chrome.messages.test.mjs
cd website && npm run lint
cd website && npm run typecheck
```

Start or reuse the local dev server and verify desktop and mobile shell rendering, drawer operation, localized routes, locale switching, search submission, Live TV navigation, breaking links, no console errors, and zero horizontal document overflow.

- [ ] **Step 5: Commit and report checkpoint**

Commit footer files with `feat: add universal editorial footer`. Report Phase 1–2 completion to the user before starting Task 5.

### Task 5: Shared Editorial Presentation Primitives

**Files:**
- Create: `website/src/components/editorial/editorial-section-header.tsx`
- Create: `website/src/components/editorial/ledger-story-row.tsx`
- Create: `website/src/components/editorial/editorial-sponsor-row.tsx`
- Create: `website/src/components/editorial/ranked-story-list.tsx`
- Create: `website/src/components/editorial/story-action-buttons.tsx`
- Create: `website/src/components/editorial/index.ts`
- Create: `website/src/components/editorial/editorial-primitives.contract.test.mjs`

**Interfaces:**
- `EditorialSectionHeader({ id?, kicker?, title, action? })` renders an accessible rule-based heading.
- `LedgerStory` is a presentation-only shape containing `id`, `href`, `title`, `summary`, `category`, `publishedAt`, optional `author`, and `image`.
- `LedgerStoryRow({ story, locale, priority?, showActions? })` accepts only `LedgerStory` and formatting inputs.
- `EditorialSponsorRow({ label, slotId?, className? })` reserves `8 / 1` desktop and `3 / 1` mobile geometry.
- `RankedStoryList({ title, stories })` accepts readonly `{ id, href, title }[]`.
- `StoryActionButtons({ storyId, title, url })` persists IDs under `inbcn:saved-story-ids:v1` and shares or copies `url`.

- [ ] **Step 1: Write failing primitive contracts**

Assert each file exports the exact interface above, imports no server repository/service, sponsor geometry is fixed, ranks are zero-padded, images use `next/image`, actions are client-only, storage access is guarded, and the share path checks `navigator.share` before clipboard fallback.

- [ ] **Step 2: Run contracts and confirm red**

Run `cd website && npm test -- src/components/editorial/editorial-primitives.contract.test.mjs`.

Expected: FAIL because the components are absent.

- [ ] **Step 3: Implement minimal primitives**

Build focused components with semantic class names and accessible labels/status text. Keep storage/share code isolated to `StoryActionButtons`; keep all other components server-compatible and view-model-only.

- [ ] **Step 4: Verify and commit**

Run the primitive contract and typecheck. Commit with `feat: add shared editorial presentation primitives`.

### Task 6: Homepage and Homepage Builder Migration

**Files:**
- Modify: `website/src/features/news/components/homepage-sections.tsx`
- Modify: `website/src/features/news/components/homepage.tsx`
- Modify: `website/src/features/news/components/homepage-sections.contract.test.mjs`
- Modify: `website/src/features/news/components/homepage.backend-data.contract.test.mjs`
- Modify: `website/src/features/homepage-renderer/components/homepage-builder-layout.tsx`
- Modify: `website/src/features/homepage-renderer/components/homepage-builder-layout.test.mjs`
- Modify: `website/src/features/homepage-renderer/components/homepage-block-renderers.tsx`
- Modify: `website/src/features/homepage-renderer/components/hero-sidebar-renderer.tsx`
- Modify: `website/src/features/homepage-renderer/homepage-renderer.blocks.contract.test.mjs`

**Interfaces:**
- Consumes all Task 5 primitives.
- Preserves every existing homepage component export and Homepage Builder renderer function signature.

- [ ] **Step 1: Rewrite homepage contracts first**

Assert a 5:4 split hero with 16:10 media, image-first mobile ordering, ledger feed usage, 2:1 discovery composition, zero-padded ranking, Editor's Pick feature, category links, and shared sponsor/Live TV presentation. Preserve data-field and renderer-registry assertions.

- [ ] **Step 2: Run homepage tests and confirm red**

Run the homepage section, builder layout, renderer block, integration, and backend-data contracts. Expected: layout assertions FAIL while data/routing assertions continue to pass.

- [ ] **Step 3: Refactor shared homepage sections**

Replace `.proto-*` composition with the editorial primitives. Keep hero image presentation and priority behavior. Convert feed items to `LedgerStoryRow`; compose Most Read and Editor's Pick without changing story allocation.

- [ ] **Step 4: Refactor both assembly paths**

Update fallback `Homepage` and builder layout/renderers so both paths share the new presentation while builder block order, width, adjacency, and IDs remain untouched.

- [ ] **Step 5: Verify and commit**

Run all homepage/builder tests plus typecheck. Commit with `feat: apply editorial layout to homepage`.

### Task 7: Category and Search Ledger Feeds

**Files:**
- Modify: `website/src/app/[locale]/category/[slug]/page.tsx`
- Modify: `website/src/app/[locale]/search/page.tsx`
- Create: `website/src/features/news/components/editorial-listings.contract.test.mjs`

**Interfaces:**
- Consumes `LedgerStoryRow` and `EditorialSponsorRow` from Task 5.
- Adapts `CategoryStoryCardModel` and `SearchResultCardModel` inline without changing either type or loader.

- [ ] **Step 1: Write failing listing contracts**

Assert both pages retain their existing data services, metadata, JSON-LD, breadcrumbs, forms/filters, pagination, and related categories. Assert both use `LedgerStoryRow` and deterministic `EditorialSponsorRow` placement and no longer render banner/rectangle `AdvertisementPlaceholder` blocks.

- [ ] **Step 2: Run tests and confirm red**

Run the new listing contract and existing category/search service tests. Expected: presentation contract FAIL; service tests PASS.

- [ ] **Step 3: Migrate category output**

Adapt hero and story card models to ledger rows, insert the sponsor row after a deterministic result index on page one, preserve empty state and pagination, and use the shared 1180px page container.

- [ ] **Step 4: Migrate search output**

Keep the existing search form/filter/result count logic and map results to ledger rows. Insert the sponsor row deterministically without changing query parameters or structured data.

- [ ] **Step 5: Verify and commit**

Run listing contracts, category/search tests, and typecheck. Commit with `feat: use ledger feeds for category and search`.

### Task 8: Inverted Live TV Briefing

**Files:**
- Modify: `website/src/features/live-tv/components/live-tv-experience.tsx`
- Modify: `website/src/features/live-tv/components/live-tv-story-section.tsx`
- Modify: `website/src/features/live-tv/components/live-tv-page.contract.test.mjs`
- Modify: `website/src/features/homepage-renderer/components/homepage-block-renderers.tsx`
- Modify: `website/src/features/homepage-renderer/homepage-renderer.blocks.contract.test.mjs`

**Interfaces:**
- Preserves `LiveTvExperience` props and `renderLiveTv(section)` signature.
- Consumes existing `LiveTvPlayer`, `LiveViewer`, schedule models, metadata, and JSON-LD unchanged.

- [ ] **Step 1: Extend Live TV contracts first**

Assert the page and builder renderer use the semantic inverted token, preserve aspect-video player geometry, combine player/programme/schedule in a briefing boundary, and retain live, offline, next-scheduled, internal-broadcast, related-story, metadata, and JSON-LD branches.

- [ ] **Step 2: Run tests and confirm red**

Run Live TV component, player, viewer integration, model, and renderer contracts. Expected: new briefing assertions FAIL while provider/model tests PASS.

- [ ] **Step 3: Implement page briefing**

Wrap player and programme context in the charcoal surface, integrate schedule beneath/alongside according to breakpoint, retain fixed player geometry, and move related stories to the editorial ledger language.

- [ ] **Step 4: Implement builder briefing**

Use the same semantic briefing boundary for live and offline builder blocks without changing data resolution or player props.

- [ ] **Step 5: Verify and commit**

Run all Live TV and homepage-renderer tests plus typecheck. Commit with `feat: add inverted Live TV briefing`.

### Task 9: Full Verification and Delivery

**Files:**
- Modify only files required to correct verified regressions.

**Interfaces:**
- Consumes the completed route and component work from Tasks 1–8.
- Produces verification evidence for the final handoff.

- [ ] **Step 1: Run automated validation**

Run:

```bash
npm --workspace website run test
npm --workspace website run lint
npm --workspace website run typecheck
npm --workspace website run build
```

Expected: all commands exit 0. Fix regressions test-first and rerun the affected command followed by the full command.

- [ ] **Step 2: Verify desktop routes**

At desktop width, inspect `/${locale}`, `/${locale}/category/[existing-slug]`, `/${locale}/search?q=[existing-term]`, and `/${locale}/live-tv`. Confirm the 1180px grid, sticky shell, search dialog, 5:4 hero, ledger rhythm, discovery 2:1 layout, sponsor row, and inverted briefing.

- [ ] **Step 3: Verify tablet and mobile**

At tablet and mobile widths, confirm horizontal category scrolling, stacked hero/discovery/briefing, image-first hero, compact masthead, drawer order, full-width search sheet, compact ledger rows, stable sponsor geometry, and accessible touch targets.

- [ ] **Step 4: Verify behavior and runtime health**

Exercise locale switching, category routes, Live TV link, search submission, drawer dismissal, dialog keyboard behavior, save persistence after reload, share/copy fallback, pagination, and breaking links. Confirm `document.documentElement.scrollWidth === document.documentElement.clientWidth`, no console errors, no uncaught exceptions, and no hydration overlays.

- [ ] **Step 5: Final diff and completion commit**

Run `git diff --check`, inspect `git status --short`, and ensure unrelated Supabase and generated-file changes are not included. Commit only any final verified corrections with `fix: complete editorial ledger verification` if a final correction commit is necessary.
