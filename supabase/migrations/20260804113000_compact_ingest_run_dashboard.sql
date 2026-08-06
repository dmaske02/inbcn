create or replace view public.ingest_run_dashboard
with (security_invoker = true)
as
select
  runs.id,
  runs.source_id,
  runs.triggered_by,
  runs.status,
  runs.items_fetched,
  runs.items_created,
  runs.items_updated,
  runs.items_failed,
  runs.error_message,
  runs.started_at,
  runs.completed_at,
  runs.created_at,
  coalesce(sources.name, 'Unknown source') as source_name,
  coalesce((runs.metadata ->> 'skipped')::integer, 0) as metadata_skipped,
  coalesce((runs.metadata ->> 'duplicates')::integer, 0) as metadata_duplicates,
  failure.failure_reason
from public.ingest_runs as runs
left join public.sources as sources on sources.id = runs.source_id
left join lateral (
  select detail ->> 'reason' as failure_reason
  from jsonb_array_elements(coalesce(runs.metadata -> 'details', '[]'::jsonb)) as detail
  where detail ->> 'outcome' = 'failed'
  limit 1
) as failure on true;

grant select on public.ingest_run_dashboard to authenticated, service_role;
