# Automated content ingestion

The scheduler reuses the existing NewsData and RSS import operations. Those operations continue to normalize articles, detect duplicates, and insert private `draft` stories through the editorial workflow.

## Runtime

Vercel invokes `GET /api/cron/auto-import` every 30 minutes using the schedule in `vercel.json`. Set `CRON_SECRET` in Vercel so scheduled requests receive `Authorization: Bearer <CRON_SECRET>`. The endpoint also preserves authenticated `POST` requests using `AUTO_IMPORT_SECRET` for trusted manual or external invocations. Both methods use the same due-time check and atomically claimed database lock.

The 30-minute Vercel Cron schedule requires a Pro plan. Hobby plans permit cron execution only once per day and will reject this `vercel.json` during deployment. The Node.js function declares a 300-second maximum duration, which is supported on Hobby and Pro when Fluid Compute is enabled. Vercel does not retry failed cron invocations, so monitor function logs and the `ingest_runs` ledger.

```env
AUTO_IMPORT_ENABLED=true
AUTO_IMPORT_INTERVAL_MINUTES=30
AUTO_IMPORT_RETRY_COUNT=3
AUTO_IMPORT_TIMEOUT_SECONDS=120
AUTO_IMPORT_SECRET=replace-with-a-long-random-secret
CRON_SECRET=replace-with-a-different-long-random-secret
```

Only active, fully configured sources enter the queue. Lower `ingestion_priority` values run first. A scheduler batch, skipped lock attempt, pause, and resume are recorded in the existing `ingest_runs` ledger; source imports keep their normal run records.

Apply `supabase/migrations/20260803010000_automated_ingestion_scheduler.sql` before enabling the cron trigger. The admin Imports page can pause/resume the database scheduler state and force a run immediately.
