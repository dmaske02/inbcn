-- created_at is the database-owned audit-row creation time. started_at is the
-- application-observed processing start, which can precede the insert round trip.
-- Only processing completion has a strict temporal dependency on processing start.
alter table public.ingest_runs
  drop constraint if exists ingest_runs_timestamp_order_check;

alter table public.ingest_runs
  add constraint ingest_runs_timestamp_order_check
  check (
    completed_at is null
    or (started_at is not null and completed_at >= started_at)
  );
