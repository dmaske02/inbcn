# Breaking News and Alert Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver database-backed alert management and targeted public rendering without changing existing story or ingestion behavior.

**Architecture:** A pure model defines alert behavior; repository and service layers own persistence and business rules; server actions and route components provide CMS workflows; `PublicLayout` is the single public integration point.

**Tech Stack:** Next.js 16 App Router, TypeScript, React 19, Zod, Supabase/PostgreSQL/RLS, Node test runner.

## Global Constraints

- Additive migration only; do not repurpose `stories.is_breaking`.
- Keep alert business logic outside UI and Supabase access inside repositories.
- Leave all changes uncommitted.

---

### Task 1: Pure alert model

**Files:** Create `src/features/alerts/breaking-alerts.model.ts`; test `breaking-alerts.model.test.mjs`.

- [ ] Write failing behavior tests for validation, schedule, ordering, targeting, and presentation.
- [ ] Run the focused tests and confirm missing-module failure.
- [ ] Implement schemas and pure view composition.
- [ ] Run focused tests until green.

### Task 2: Database and repository

**Files:** Create migration `supabase/migrations/20260803020000_breaking_alerts.sql`, repository, repository tests; modify generated database types.

- [ ] Write failing migration/repository contract tests.
- [ ] Add the approved table, constraints, indexes, trigger, grants, and RLS.
- [ ] Implement active lookup, CMS pagination, references, CRUD, and duplicate insert.
- [ ] Run focused tests and typecheck.

### Task 3: Service and server actions

**Files:** Create service, service tests, actions, and notification extension types.

- [ ] Write failing command and authorization tests.
- [ ] Implement list/editor view models, create/save/duplicate/activate/deactivate/archive/delete.
- [ ] Implement safe server actions and route revalidation.
- [ ] Run focused tests.

### Task 4: Admin routes

**Files:** Create `/admin/alerts`, `/admin/alerts/new`, `/admin/alerts/[id]`, list and form components; modify admin navigation.

- [ ] Add list filters, summaries, pagination, actions, preview, and responsive form.
- [ ] Verify route-level authorization and form accessibility with typecheck/lint.

### Task 5: Public integration

**Files:** Create public alert components; modify `PublicLayout` and category/story page calls.

- [ ] Fetch active alerts through the service using locale and optional target IDs.
- [ ] Render emergency, breaking, and pinned placements in priority order.
- [ ] Add dismissible client behavior without changing search results or SEO.

### Task 6: Full verification

- [ ] Run `npm test`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check` and audit uncommitted files.
