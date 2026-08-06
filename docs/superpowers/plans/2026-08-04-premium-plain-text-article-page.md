# Premium Plain-Text Article Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a premium, server-rendered public article experience around the existing plain-text story model.

**Architecture:** Extend the existing story-reader model/service using only collections it already loads. Keep the route server-rendered and isolate only progress/share behavior in small client components.

**Tech Stack:** Next.js App Router, React Server Components, TypeScript, Next Image, existing Supabase repositories, Node test runner, CSS/Tailwind utilities.

## Global Constraints

- Do not modify repositories, database schema, CMS, importers, public APIs, homepage, or admin UI.
- Do not parse rich HTML or Markdown and do not modify `stories.content`.
- Do not create duplicate repository queries or N+1 calls.
- Reuse `resolvePublicStoryImage`, `calculateReadTime`, and existing metadata composition.
- Do not commit changes.

---

### Task 1: Article Composition Model

**Files:**
- Modify: `src/features/news/server/services/story-reader.model.ts`
- Modify: `src/features/news/server/services/story-reader.model.test.mjs`

**Interfaces:**
- Produces `composeInlineRelated(paragraphCount, related, interval = 6)`.
- Produces `selectAdjacentStories(currentStoryId, preferred, fallback)`.
- Produces `composeArticleSidebar(currentStoryId, stories)` with deduplicated `breaking`, `latest`, `editorPicks`, and `trending` IDs.
- Extends `buildArticleJsonLd` input with `readTime` and output with `timeRequired`.

- [ ] Add failing tests for sixth-paragraph placement, short-story after-body fallback, current-story exclusion, adjacent publication ordering, sidebar mutual exclusion, and ISO reading duration.
- [ ] Run `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON src/features/news/server/services/story-reader.model.test.mjs` and verify the new assertions fail for missing behavior.
- [ ] Implement the pure composition helpers without repository access.
- [ ] Re-run the focused model tests and verify they pass.

### Task 2: Server ViewModel Composition

**Files:**
- Modify: `src/features/news/server/services/story-reader.service.ts`
- Add or modify contract test beside `story-reader.model.test.mjs`.

**Interfaces:**
- Extends `StoryReaderViewModel` with `inlineRelated`, `previous`, `next`, and `sidebar`.
- Reuses `sameCategoryStories` and `latestStories` already loaded by the service.
- Maps every card through `resolvePublicStoryImage` and `buildPublicStoryUrl`.

- [ ] Add a failing source/service contract test proving no new repository method is imported or called and all new fields are composed from existing collections.
- [ ] Run the focused test and verify RED.
- [ ] Extend the view model and service composition, filtering the current story and preserving deduplication.
- [ ] Re-run the focused tests and verify GREEN.

### Task 3: Progress and Share Client Islands

**Files:**
- Create: `src/features/news/components/reading-progress.tsx`
- Modify: `src/features/news/components/story-share-actions.tsx`
- Create: `src/features/news/components/article-interactions.contract.test.mjs`

**Interfaces:**
- `ReadingProgress({ articleId: string })` observes document scroll with a passive listener and animation-frame updates.
- `StoryShareActions` supports desktop vertical and mobile bottom presentation without changing URL construction or copy behavior.

- [ ] Add failing source-contract tests for passive scroll cleanup, progressbar ARIA state, all seven share actions including Telegram, desktop sticky presentation, and mobile fixed presentation.
- [ ] Run the focused contract test and verify RED.
- [ ] Implement the two small client interaction surfaces with no backend fetches.
- [ ] Re-run the focused contract test and verify GREEN.

### Task 4: Premium Server-Rendered Article Page

**Files:**
- Modify: `src/app/[locale]/story/[slug]/page.tsx`
- Create: `src/features/news/components/story-page.contract.test.mjs`
- Modify: `src/app/globals.css` only for article-scoped selectors that cannot be expressed cleanly with existing utilities.

**Interfaces:**
- Consumes the extended `StoryReaderViewModel`.
- Renders inline related stories after model-provided paragraph positions.
- Renders server-side previous/next navigation, author card, caption, and sidebar groups.
- Uses Hero `loading="eager" fetchPriority="high"`; every below-fold image uses `loading="lazy"`.

- [ ] Add failing page contract tests for semantic header order, conditional updated time/caption, inline placement consumption, author card, previous/next navigation, sidebar groups, Hero priority, and lazy secondary images.
- [ ] Run the focused page contract test and verify RED.
- [ ] Implement the premium article structure while preserving the existing INBCN typography family and color tokens.
- [ ] Re-run the focused page contract test and verify GREEN.

### Task 5: SEO and Metadata Completion

**Files:**
- Modify: `src/features/news/server/services/story-reader.model.ts`
- Modify: `src/features/news/server/services/story-reader.service.ts`
- Modify: `src/app/[locale]/story/[slug]/page.tsx`
- Modify: `src/features/news/server/services/story-reader.model.test.mjs`

**Interfaces:**
- Metadata includes author, published time, modified time, canonical, OpenGraph image, and Twitter image.
- NewsArticle JSON-LD includes author, timestamps, Hero image, canonical, and `timeRequired`.

- [ ] Add failing assertions for metadata authors and JSON-LD `timeRequired`/image/timestamps.
- [ ] Run focused tests and verify RED.
- [ ] Extend the existing metadata output without replacing its canonical/OpenGraph/Twitter logic.
- [ ] Re-run focused tests and verify GREEN.

### Task 6: Full Verification and Visual Audit

**Files:**
- No production files unless verification finds a scoped defect.

- [ ] Run `npm test` and record test/pass/fail counts.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.
- [ ] Verify a live backend article: progress, Hero eager/high priority, secondary images lazy, caption behavior, inline cards, previous/next, sidebar deduplication, desktop sticky surfaces, mobile CSS behavior, and no homepage/admin file changes from this task.
- [ ] Report files modified, components added, view-model changes, performance/accessibility impact, and before/after evidence.
