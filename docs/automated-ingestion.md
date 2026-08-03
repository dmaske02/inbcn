# Automated content ingestion

The scheduler reuses the existing NewsData and RSS import operations. Those operations continue to normalize articles, detect duplicates, and insert private `draft` stories through the editorial workflow.

## Runtime

Send `POST /api/cron/auto-import` with `Authorization: Bearer <AUTO_IMPORT_SECRET>` from a trusted platform cron at least as frequently as `AUTO_IMPORT_INTERVAL_MINUTES`. The endpoint checks whether a run is due, then atomically claims a distributed database lock. A production deployment therefore does not rely on an in-process timer.

```env
AUTO_IMPORT_ENABLED=true
AUTO_IMPORT_INTERVAL_MINUTES=30
AUTO_IMPORT_RETRY_COUNT=3
AUTO_IMPORT_TIMEOUT_SECONDS=120
AUTO_IMPORT_SECRET=replace-with-a-long-random-secret
```

Only active, fully configured sources enter the queue. Lower `ingestion_priority` values run first. A scheduler batch, skipped lock attempt, pause, and resume are recorded in the existing `ingest_runs` ledger; source imports keep their normal run records.

Apply `supabase/migrations/20260803010000_automated_ingestion_scheduler.sql` before enabling the cron trigger. The admin Imports page can pause/resume the database scheduler state and force a run immediately.
