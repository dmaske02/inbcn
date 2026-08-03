-- Persist scheduler batches and control events in the existing ingest_runs ledger.
alter table public.ingest_runs alter column source_id drop not null;

alter table public.ingest_runs drop constraint if exists ingest_runs_status_check;
alter table public.ingest_runs add constraint ingest_runs_status_check
  check (status in ('queued', 'running', 'completed', 'partial', 'failed', 'skipped'));

create or replace function public.claim_auto_import_batch(
  p_started_at timestamptz,
  p_lock_expires_at timestamptz,
  p_queue_size integer,
  p_force boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
  v_running uuid;
  v_batch uuid;
begin
  perform pg_advisory_xact_lock(hashtext('inbcn:auto-import'));

  select coalesce((metadata->>'enabled')::boolean, true) into v_enabled
  from public.ingest_runs
  where metadata->>'kind' = 'scheduler_control'
  order by created_at desc limit 1;
  v_enabled := coalesce(v_enabled, true);

  if not v_enabled and not p_force then
    insert into public.ingest_runs(status, started_at, completed_at, error_message, metadata)
    values ('skipped', p_started_at, p_started_at, 'Scheduler is paused.',
      jsonb_build_object('kind','scheduler_batch','reason','paused','queueSize',p_queue_size))
    returning id into v_batch;
    return jsonb_build_object('claimed', false, 'reason', 'paused', 'batchId', v_batch);
  end if;

  select id into v_running from public.ingest_runs
  where status = 'running' and metadata->>'kind' = 'scheduler_batch'
    and (metadata->>'lockExpiresAt')::timestamptz > p_started_at
  order by created_at desc limit 1;

  if v_running is not null then
    insert into public.ingest_runs(status, started_at, completed_at, error_message, metadata)
    values ('skipped', p_started_at, p_started_at, 'Another automated import is running.',
      jsonb_build_object('kind','scheduler_batch','reason','locked','queueSize',p_queue_size,'activeBatchId',v_running))
    returning id into v_batch;
    return jsonb_build_object('claimed', false, 'reason', 'locked', 'batchId', v_batch);
  end if;

  insert into public.ingest_runs(status, started_at, metadata)
  values ('running', p_started_at,
    jsonb_build_object('kind','scheduler_batch','queueSize',p_queue_size,'lockExpiresAt',p_lock_expires_at))
  returning id into v_batch;
  return jsonb_build_object('claimed', true, 'batchId', v_batch);
end;
$$;

revoke all on function public.claim_auto_import_batch(timestamptz,timestamptz,integer,boolean) from public;
grant execute on function public.claim_auto_import_batch(timestamptz,timestamptz,integer,boolean) to service_role;
