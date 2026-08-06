# Category Consistency Audit and Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish one canonical category identity across database records, CMS selection, imports, repositories, and all public news surfaces without altering UI or repository architecture.

**Architecture:** Audit persisted category and story relationships first, then trace every category consumer back to the repository DTO. Place any correction at the earliest shared normalization boundary so CMS, RSS, homepage, category pages, search, and reader services consume the same identity without component-specific mappings.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase/PostgreSQL, Node test runner.

## Global Constraints

- Do not modify UI, CSS, layout, typography, spacing, colors, responsive behavior, or component hierarchy.
- Do not introduce public APIs, duplicate repository logic, or temporary mappings.
- Audit before editing production code.
- Use TDD for the correction and do not commit, merge, or push.

---

### Task 1: Database and Story Inventory

**Files:**
- Read: `supabase/migrations/*.sql`
- Read: `src/lib/supabase/database.types.ts`
- Create only if required by the identified data defect: `supabase/migrations/20260806xxxxxx_*.sql`

**Interfaces:**
- Consumes: `languages`, `categories`, `stories`, and `sources` tables.
- Produces: category inventory, translated-name grouping, counts, duplicate/orphan findings, and affected story IDs.

- [ ] Query all languages and categories with active state and published-story counts.
- [ ] Detect duplicate slugs per language, duplicate semantic categories, missing references, and inactive-category references.
- [ ] Query every published story with category, language, source, headline, and publication timestamp.
- [ ] Compare persisted constraints with the intended canonical identity model.

### Task 2: Application Category-Path Audit

**Files:**
- Read: `src/features/news/server/categories.repository.ts`
- Read: `src/features/news/server/stories.repository.ts`
- Read: `src/features/news/server/services/homepage.model.ts`
- Read: `src/features/news/server/services/homepage.service.ts`
- Read: `src/features/news/server/services/category.model.ts`
- Read: `src/features/news/server/services/category.service.ts`
- Read: `src/features/news/server/services/search.model.ts`
- Read: `src/features/news/server/services/story-reader.service.ts`
- Read: `src/features/admin/stories/**`
- Read: `src/features/admin/imports/rss.model.ts`
- Read: `src/features/admin/imports/external-import.operations.ts`
- Read: `src/components/layout/public/**`

**Interfaces:**
- Consumes: repository DTOs and route locale/slug inputs.
- Produces: an exact map of CMS values, import normalization, route queries, homepage allocation, search filters, and related-story filters.

- [ ] Trace CMS category option label, stored ID, and slug.
- [ ] Trace RSS category text through normalization and category selection.
- [ ] Trace every navigation destination to its repository query.
- [ ] Trace category identity through homepage, search, and reader composition.
- [ ] Locate every hardcoded slug or duplicated category alias.

### Task 3: Centralized Regression Fix

**Files:**
- Test: the closest existing model/repository test beside the identified shared boundary.
- Modify: only the shared category normalization or repository boundary proven defective.
- Modify if data repair is required: one additive Supabase migration.

**Interfaces:**
- Consumes: raw category labels/slugs and locale-aware category records.
- Produces: one canonical category ID/slug resolution result used by every caller.

- [ ] Write a failing test reproducing the National/India mismatch and any equivalent translated aliases.
- [ ] Run the focused test and confirm it fails for the identified mapping reason.
- [ ] Implement the minimum centralized resolution change.
- [ ] Run the focused test and dependent category/import tests until green.
- [ ] Apply a data migration only if existing persisted rows require repair.

### Task 4: End-to-End Re-audit and Verification

**Files:**
- Modify: none unless verification reveals the same centralized defect remains.

**Interfaces:**
- Consumes: repaired database and application category resolver.
- Produces: final inventory and evidence for CMS/public parity.

- [ ] Re-run inventory and compare CMS-published versus repository-returned counts by locale/category.
- [ ] Verify homepage rails, navigation, search, related stories, and RSS category selection.
- [ ] Run `npm test`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.
- [ ] Report inventory, defects, root cause, files changed, and why the centralized fix covers all consumers.
