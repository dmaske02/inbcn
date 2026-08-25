# Mobile Live TV Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the existing localized Live TV route as the first item in the public website's mobile drawer without changing desktop navigation.

**Architecture:** Extend the active `PrototypeChrome` mobile drawer only. Reuse `navigationHref(locale, "live-tv")`, the existing `labels.actions.liveTv` translation, semantic Next.js `Link`, and the drawer's existing close handler.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind/global CSS, Node test runner.

---

### Task 1: Mobile Live TV regression contract

**Files:**
- Modify: `website/src/components/layout/public/prototype-fidelity.contract.test.mjs`

- [ ] Add a focused source contract asserting the drawer contains a Live TV `Link` before the category map, targets `navigationHref(locale, "live-tv")`, uses `labels.actions.liveTv`, and calls `setDrawerOpen(false)` on click.
- [ ] Run `npm test --workspace @inbcn/website -- website/src/components/layout/public/prototype-fidelity.contract.test.mjs` and confirm the new assertion fails because the drawer link is absent.

### Task 2: Mobile drawer link

**Files:**
- Modify: `website/src/components/layout/public/prototype-chrome.tsx`
- Modify: `website/src/app/globals.css`

- [ ] Insert the semantic Live TV `Link` before the drawer category links, using `navigationHref(locale, "live-tv")`, `labels.actions.liveTv`, and `onClick={() => setDrawerOpen(false)}`.
- [ ] Reuse the red Live TV visual treatment while adding a minimum 44px tap target and `focus-visible` outline for keyboard users.
- [ ] Re-run the focused test and confirm it passes.

### Task 3: Verification

- [ ] Run website and repository tests, typecheck, ESLint, production build, and `git diff --check`.
- [ ] Verify desktop markup remains unchanged and inspect localized link construction for `en`, `hi`, and `mr`.
- [ ] Exercise the mobile drawer at 320, 375, 390, 414, and 430px, confirming first-item placement, navigation, and drawer closure.
