# Two-App Monorepo Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the combined INBCN Next.js application into independently buildable `website` and `cms` workspace applications while retaining one Supabase schema and canonical shared types.

**Architecture:** The website owns localized public routes and anonymous published-data reads. The CMS owns authentication, editorial mutations, preview, ingestion, media uploads, and cron. Small workspace packages expose generated database types and pure shared domain types; CMS-to-website cache invalidation uses a signed HTTP endpoint.

**Tech Stack:** npm workspaces, Next.js 16.3, React 19, TypeScript, Supabase SSR, Cloudinary, next-intl, Vercel Functions and Cron.

---

### Task 1: Workspace and shared packages

**Files:** root `package.json`, `packages/database/**`, `packages/domain/**`

- [ ] Add npm workspace declarations and orchestration scripts without changing dependency versions.
- [ ] Move the canonical generated Supabase types into `packages/database` and expose stable type aliases.
- [ ] Add `packages/domain` with only locale and cross-deployment revalidation event contracts.
- [ ] Install the workspace lockfile and run shared TypeScript checks.

### Task 2: Independent website application

**Files:** `website/**`

- [ ] Scaffold website configuration from the current Next.js 16 application.
- [ ] Copy only localized public routes, public presentation, public repositories, and required shared renderer/viewer features.
- [ ] Split website environment validation and Supabase public-data clients.
- [ ] Split proxy responsibility to locale routing only.
- [ ] Add a failing contract for an authenticated, event-allowlisted `POST /api/revalidate` endpoint.
- [ ] Implement the endpoint with `WEBSITE_REVALIDATION_SECRET` and approved event-to-path mapping.
- [ ] Run website lint, tests, type checking, and production build; confirm no admin or cron route exists.

### Task 3: Independent CMS application

**Files:** `cms/**`

- [ ] Scaffold CMS configuration and copy admin, protected preview, editorial features, and cron.
- [ ] Preserve Supabase cookie authentication and service-role server isolation.
- [ ] Keep Cloudinary mutation code and Media Library exclusively in CMS.
- [ ] Split CMS environment validation and proxy responsibility.
- [ ] Add a failing contract for signed CMS-to-website revalidation requests.
- [ ] Replace public `revalidatePath` calls with the signed client while retaining CMS-local invalidation.
- [ ] Move `vercel.json` exclusively to CMS.
- [ ] Run CMS lint, tests, type checking, and production build; confirm no localized public routes exist besides protected preview.

### Task 4: Remove legacy runtime and verify monorepo

**Files:** legacy root runtime/config files and root scripts

- [ ] Remove the superseded combined application runtime only after both new builds pass.
- [ ] Preserve root `supabase`, documentation, shared packages, and migration history.
- [ ] Run root orchestration tests plus fresh website and CMS lint/build commands.
- [ ] Inspect route manifests, dependency trees, git diff, and changed files for secrets or generated artifacts.
