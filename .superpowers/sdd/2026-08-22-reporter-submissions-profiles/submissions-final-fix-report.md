# Reporter submissions final-fix report

Date: 2026-08-23

## Review findings closed

- Reporter submit/direct-publish transitions now freeze the complete mutable editor while the request is pending and after success. A successful exact-generation transition clears only its own recovery snapshot and refreshes the canonical server state; clear failure or a newer edit preserves recovery and intentionally prevents refresh.
- True reporter stories now have a separately labelled CMS editorial-correction path. The database-owned `SECURITY DEFINER` RPC requires an active editor/admin, locks the story and latest immutable revision, checks both the expected revision and canonical `updated_at`, validates a complete bounded editorial patch and story-owned featured media, and records only changed field names plus the bounded reason in audit metadata. Submitted revisions, reporter provenance/byline, and private location evidence remain untouched.
- Rejected notifications now exclude reporter-initiated withdrawals by checking the latest revision outcome.
- Archiving rejected/withdrawn reporter stories preserves `approved_by` and `approved_at` exactly in both the CMS workflow patch and the database provenance guard.
- Bulk story actions retain full preauthorization and per-item authorization, report completed partial progress truthfully, and revalidate every completed public mutation even when a later item fails.

## TDD and verification

- RED was observed for the reporter transition generation/success lock contracts and for the correction RPC concurrency/signature contracts before implementation.
- Focused reporter/CMS contracts: 21/21 passed.
- Full root tests with bundled Node.js 24.19.0: website 233/233, CMS 606/606, reporter 204/204.
- Full root TypeScript checks: passed for database, domain, website, CMS, and reporter.
- Full root lint: passed for website, CMS, and reporter.
- Production builds: website, CMS, and reporter passed with their documented public application URLs supplied for production environment validation.
- `git diff --check`: passed.

## Database delivery note

The additive migration is `20260822157000_reporter_editorial_corrections.sql`. A rollback-only verification script covers canonical correction, immutable revision preservation, audit field names, and a stale second editor correction conflict. Docker/Postgres was unavailable in this environment, so the migration was not applied and generated Supabase types were not regenerated; the checked-in RPC type is an explicit manual contract pending deployment-time apply/typegen verification.
