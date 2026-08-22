-- Fence Auth metadata writes with the database-owned reporter access generation.
-- Auth and Postgres still do not share a transaction: signed access is admitted
-- only when both stores agree on the current, successfully completed generation.

alter table public.reporter_profiles
  drop constraint reporter_profiles_access_sync_operation_check,
  add constraint reporter_profiles_access_sync_operation_check check (
    access_sync_operation in ('approval', 'reconciliation', 'suspension', 'reinstatement')
  );

alter table public.reporter_access_sync_attempts
  drop constraint reporter_access_sync_attempts_operation_check,
  add constraint reporter_access_sync_attempts_operation_check check (
    operation in ('approval', 'reconciliation', 'suspension', 'reinstatement')
  );

create or replace function public.enforce_reporter_access_metadata_generation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_role text := old.raw_app_meta_data ->> 'role';
  new_role text := new.raw_app_meta_data ->> 'role';
  old_generation jsonb := old.raw_app_meta_data -> 'reporter_access_generation';
  new_generation jsonb := new.raw_app_meta_data -> 'reporter_access_generation';
  current_reporter public.reporter_profiles%rowtype;
begin
  -- Updates to unrelated app_metadata are not part of reporter access fencing.
  if old_role is not distinct from new_role
    and old_generation is not distinct from new_generation then
    return new;
  end if;

  -- Non-reporter role administration remains outside this trigger's scope.
  if old_role is distinct from 'reporter'
    and new_role is distinct from 'reporter'
    and old_generation is null
    and new_generation is null then
    return new;
  end if;

  -- This row lock makes validation observe any reporter transition that started
  -- first, and makes a concurrent transition wait for this validation to finish.
  select * into current_reporter
  from public.reporter_profiles
  where profile_id = new.id
  for share;
  if not found
    or new_generation is distinct from to_jsonb(current_reporter.access_sync_generation) then
    raise exception using
      errcode = 'P0001',
      message = 'REPORTER_ACCESS_GENERATION_STALE';
  end if;

  if current_reporter.access_sync_desired_role = 'reporter'
    and new_role is distinct from 'reporter' then
    raise exception using
      errcode = 'P0001',
      message = 'REPORTER_ACCESS_ROLE_MISMATCH';
  end if;
  if current_reporter.access_sync_desired_role = 'none'
    and new_role is not null then
    raise exception using
      errcode = 'P0001',
      message = 'REPORTER_ACCESS_ROLE_MISMATCH';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_reporter_access_metadata_generation()
from public, anon, authenticated, service_role;

drop trigger if exists enforce_reporter_access_metadata_generation on auth.users;
create trigger enforce_reporter_access_metadata_generation
before update of raw_app_meta_data on auth.users
for each row
execute function public.enforce_reporter_access_metadata_generation();

-- Existing Auth records predate the signed generation. Move any unverified
-- reporter profile to a fresh reconciliation generation before tightening RLS.
with drifted as (
  update public.reporter_profiles
  set access_sync_generation = reporter_profiles.access_sync_generation + 1,
      access_sync_status = 'pending',
      access_sync_operation = 'reconciliation',
      access_sync_failure_detail = null,
      access_sync_completed_token = null,
      access_sync_updated_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where not exists (
    select 1
    from auth.users
    where users.id = reporter_profiles.profile_id
      and users.raw_app_meta_data -> 'reporter_access_generation'
        = to_jsonb(reporter_profiles.access_sync_generation)
      and (
        (
          reporter_profiles.access_sync_desired_role = 'reporter'
          and users.raw_app_meta_data ->> 'role' = 'reporter'
        )
        or (
          reporter_profiles.access_sync_desired_role = 'none'
          and users.raw_app_meta_data ->> 'role' is null
        )
      )
  )
  returning profile_id, access_sync_generation, access_sync_desired_role
)
insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata)
select
  null,
  'reporter.access_sync_drift_detected',
  'reporter_profile',
  drifted.profile_id,
  jsonb_build_object(
    'source', 'generation-fencing-migration',
    'repair_generation', drifted.access_sync_generation,
    'current_desired_role', drifted.access_sync_desired_role
  )
from drifted;

create or replace function public.claim_reporter_access_sync(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  current_reporter public.reporter_profiles%rowtype;
  current_metadata jsonb;
  claim_time timestamptz := clock_timestamp();
  claim_token uuid := gen_random_uuid();
  metadata_matches boolean := false;
begin
  if actor_id is null or actor_role <> 'admin'
    or not exists (
      select 1 from public.profiles
      where id = actor_id and role = 'admin' and is_active
    ) then
    raise exception using errcode = '42501', message = 'REPORTER_ACCESS_SYNC_FORBIDDEN';
  end if;

  select * into current_reporter
  from public.reporter_profiles
  where profile_id = p_profile_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'REPORTER_PROFILE_NOT_FOUND';
  end if;

  select raw_app_meta_data into current_metadata
  from auth.users
  where id = p_profile_id;
  metadata_matches := current_metadata is not null
    and current_metadata -> 'reporter_access_generation'
      = to_jsonb(current_reporter.access_sync_generation)
    and (
      (
        current_reporter.access_sync_desired_role = 'reporter'
        and current_metadata ->> 'role' = 'reporter'
      )
      or (
        current_reporter.access_sync_desired_role = 'none'
        and current_metadata ->> 'role' is null
      )
    );

  if current_reporter.access_sync_status = 'succeeded' and metadata_matches then
    return jsonb_build_object(
      'state', 'succeeded',
      'generation', current_reporter.access_sync_generation
    );
  end if;

  if current_reporter.access_sync_status = 'succeeded' and not metadata_matches then
    update public.reporter_profiles
    set access_sync_generation = current_reporter.access_sync_generation + 1,
        access_sync_status = 'pending',
        access_sync_operation = 'reconciliation',
        access_sync_failure_detail = null,
        access_sync_completed_token = null,
        access_sync_updated_at = claim_time,
        updated_at = claim_time
    where profile_id = p_profile_id;
    insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata)
    values (
      actor_id,
      'reporter.access_sync_drift_detected',
      'reporter_profile',
      p_profile_id,
      jsonb_build_object(
        'previous_generation', current_reporter.access_sync_generation,
        'repair_generation', current_reporter.access_sync_generation + 1,
        'current_desired_role', current_reporter.access_sync_desired_role
      )
    );
    select * into current_reporter
    from public.reporter_profiles
    where profile_id = p_profile_id;
  end if;

  if current_reporter.access_sync_claim_token is not null
    and current_reporter.access_sync_claimed_at > claim_time - interval '5 minutes' then
    return jsonb_build_object(
      'state', 'busy',
      'generation', current_reporter.access_sync_generation
    );
  end if;

  update public.reporter_profiles
  set access_sync_status = 'pending',
      access_sync_failure_detail = null,
      access_sync_claim_token = claim_token,
      access_sync_claimed_at = claim_time,
      access_sync_claim_generation = current_reporter.access_sync_generation,
      access_sync_completed_token = null,
      access_sync_updated_at = claim_time,
      updated_at = claim_time
  where profile_id = p_profile_id;
  insert into public.reporter_access_sync_attempts (
    claim_token,
    profile_id,
    generation,
    desired_role,
    operation,
    claimed_at
  ) values (
    claim_token,
    p_profile_id,
    current_reporter.access_sync_generation,
    current_reporter.access_sync_desired_role,
    current_reporter.access_sync_operation,
    claim_time
  );
  insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata)
  values (
    actor_id,
    'reporter.access_sync_claimed',
    'reporter_profile',
    p_profile_id,
    jsonb_build_object(
      'generation', current_reporter.access_sync_generation,
      'desired_role', current_reporter.access_sync_desired_role,
      'operation', current_reporter.access_sync_operation,
      'lease_seconds', 300
    )
  );
  return jsonb_build_object(
    'state', 'claimed',
    'profile_id', p_profile_id,
    'operation', current_reporter.access_sync_operation,
    'desired_role', current_reporter.access_sync_desired_role,
    'generation', current_reporter.access_sync_generation,
    'claim_token', claim_token
  );
end;
$$;

create or replace function public.complete_reporter_access_sync(
  p_profile_id uuid,
  p_generation bigint,
  p_claim_token uuid,
  p_succeeded boolean,
  p_failure_detail text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  current_reporter public.reporter_profiles%rowtype;
  current_attempt public.reporter_access_sync_attempts%rowtype;
  current_metadata jsonb;
  completion_time timestamptz := clock_timestamp();
  completion_state text;
  owns_active_lease boolean;
  metadata_matches boolean := false;
  repair_generation bigint;
begin
  if actor_id is null or actor_role <> 'admin'
    or not exists (
      select 1 from public.profiles
      where id = actor_id and role = 'admin' and is_active
    ) then
    raise exception using errcode = '42501', message = 'REPORTER_ACCESS_SYNC_FORBIDDEN';
  end if;
  if p_generation is null or p_generation < 1
    or p_claim_token is null
    or p_succeeded is null
    or (p_succeeded and p_failure_detail is not null)
    or (not p_succeeded and p_failure_detail is distinct from 'auth-claim-update-failed') then
    raise exception using errcode = '22023', message = 'REPORTER_ACCESS_SYNC_INVALID';
  end if;

  select * into current_reporter
  from public.reporter_profiles
  where profile_id = p_profile_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'REPORTER_PROFILE_NOT_FOUND';
  end if;
  select * into current_attempt
  from public.reporter_access_sync_attempts
  where profile_id = p_profile_id
    and generation = p_generation
    and claim_token = p_claim_token
  for update;
  if not found then
    return jsonb_build_object(
      'state', 'stale',
      'generation', current_reporter.access_sync_generation
    );
  end if;

  -- Terminal success is monotonic: no duplicate failure can downgrade it.
  if current_attempt.completion_status = 'succeeded' then
    if current_reporter.access_sync_generation = p_generation
      and current_reporter.access_sync_status = 'succeeded'
      and current_reporter.access_sync_completed_token = p_claim_token then
      return jsonb_build_object('state', 'succeeded', 'generation', p_generation);
    end if;
    return jsonb_build_object(
      'state', 'stale',
      'generation', current_reporter.access_sync_generation
    );
  end if;
  if current_attempt.completion_status <> 'pending' then
    return jsonb_build_object(
      'state', case
        when current_attempt.completion_status = 'failed' then 'failed'
        else 'stale'
      end,
      'generation', current_reporter.access_sync_generation
    );
  end if;

  owns_active_lease := current_reporter.access_sync_claim_token is not distinct from p_claim_token
    and current_reporter.access_sync_claim_generation is not distinct from p_generation;
  if not owns_active_lease
    or current_reporter.access_sync_generation <> p_generation then
    update public.reporter_access_sync_attempts
    set completion_status = case when p_succeeded
          then 'stale_succeeded'
          else 'stale_failed'
        end,
        completed_at = completion_time,
        failure_detail = p_failure_detail
    where claim_token = p_claim_token
      and completion_status = 'pending';

    if owns_active_lease then
      update public.reporter_profiles
      set access_sync_claim_token = null,
          access_sync_claimed_at = null,
          access_sync_claim_generation = null,
          access_sync_updated_at = completion_time,
          updated_at = completion_time
      where profile_id = p_profile_id
        and access_sync_claim_token = p_claim_token
        and access_sync_claim_generation = p_generation;
    end if;

    if p_succeeded then
      repair_generation := current_reporter.access_sync_generation + 1;
      update public.reporter_profiles
      set access_sync_generation = current_reporter.access_sync_generation + 1,
          access_sync_status = 'pending',
          access_sync_operation = 'reconciliation',
          access_sync_failure_detail = null,
          access_sync_completed_token = null,
          access_sync_updated_at = completion_time,
          updated_at = completion_time
      where profile_id = p_profile_id;
    else
      repair_generation := current_reporter.access_sync_generation;
    end if;

    insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata)
    values (
      actor_id,
      case when p_succeeded
        then 'reporter.access_sync_stale_succeeded'
        else 'reporter.access_sync_stale_failed'
      end,
      'reporter_profile',
      p_profile_id,
      jsonb_build_object(
        'claimed_generation', p_generation,
        'claimed_desired_role', current_attempt.desired_role,
        'current_generation', current_reporter.access_sync_generation,
        'repair_generation', repair_generation,
        'current_desired_role', current_reporter.access_sync_desired_role,
        'failure_detail', p_failure_detail
      )
    );
    return jsonb_build_object('state', 'stale', 'generation', repair_generation);
  end if;

  if p_succeeded then
    select raw_app_meta_data into current_metadata
    from auth.users
    where id = p_profile_id;
    metadata_matches := current_metadata is not null
      and current_metadata -> 'reporter_access_generation' = to_jsonb(p_generation)
      and (
        (
          current_attempt.desired_role = 'reporter'
          and current_metadata ->> 'role' = 'reporter'
        )
        or (
          current_attempt.desired_role = 'none'
          and current_metadata ->> 'role' is null
        )
      );
  end if;

  if p_succeeded and not metadata_matches then
    repair_generation := current_reporter.access_sync_generation + 1;
    update public.reporter_access_sync_attempts
    set completion_status = 'stale_succeeded',
        completed_at = completion_time,
        failure_detail = null
    where claim_token = p_claim_token
      and completion_status = 'pending';
    update public.reporter_profiles
    set access_sync_generation = current_reporter.access_sync_generation + 1,
        access_sync_status = 'pending',
        access_sync_operation = 'reconciliation',
        access_sync_failure_detail = null,
        access_sync_claim_token = null,
        access_sync_claimed_at = null,
        access_sync_claim_generation = null,
        access_sync_completed_token = null,
        access_sync_updated_at = completion_time,
        updated_at = completion_time
    where profile_id = p_profile_id
      and access_sync_generation = p_generation
      and access_sync_claim_token = p_claim_token
      and access_sync_claim_generation = p_generation;
    if not found then
      raise exception using errcode = 'P0001', message = 'REPORTER_ACCESS_SYNC_CAS_FAILED';
    end if;
    insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata)
    values (
      actor_id,
      'reporter.access_sync_verification_failed',
      'reporter_profile',
      p_profile_id,
      jsonb_build_object(
        'claimed_generation', p_generation,
        'repair_generation', repair_generation,
        'current_desired_role', current_reporter.access_sync_desired_role
      )
    );
    return jsonb_build_object('state', 'stale', 'generation', repair_generation);
  end if;

  completion_state := case when p_succeeded then 'succeeded' else 'failed' end;
  update public.reporter_profiles
  set access_sync_status = completion_state,
      access_sync_failure_detail = p_failure_detail,
      access_sync_claim_token = null,
      access_sync_claimed_at = null,
      access_sync_claim_generation = null,
      access_sync_completed_token = case when p_succeeded then p_claim_token else null end,
      access_sync_updated_at = completion_time,
      updated_at = completion_time
  where profile_id = p_profile_id
    and access_sync_generation = p_generation
    and access_sync_claim_token = p_claim_token
    and access_sync_claim_generation = p_generation;
  if not found then
    raise exception using errcode = 'P0001', message = 'REPORTER_ACCESS_SYNC_CAS_FAILED';
  end if;
  update public.reporter_access_sync_attempts
  set completion_status = completion_state,
      completed_at = completion_time,
      failure_detail = p_failure_detail
  where claim_token = p_claim_token
    and completion_status = 'pending';
  if not found then
    raise exception using errcode = 'P0001', message = 'REPORTER_ACCESS_SYNC_CAS_FAILED';
  end if;
  insert into public.audit_events (actor_id, action, subject_type, subject_id, metadata)
  values (
    actor_id,
    case when p_succeeded
      then 'reporter.access_sync_succeeded'
      else 'reporter.access_sync_failed'
    end,
    'reporter_profile',
    p_profile_id,
    jsonb_build_object(
      'generation', p_generation,
      'desired_role', current_attempt.desired_role,
      'operation', current_attempt.operation,
      'failure_detail', p_failure_detail
    )
  );
  return jsonb_build_object('state', completion_state, 'generation', p_generation);
end;
$$;

revoke all on function public.claim_reporter_access_sync(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.complete_reporter_access_sync(uuid, bigint, uuid, boolean, text)
from public, anon, authenticated, service_role;
grant execute on function public.claim_reporter_access_sync(uuid)
to authenticated;
grant execute on function public.complete_reporter_access_sync(uuid, bigint, uuid, boolean, text)
to authenticated;

-- Applicant access is unchanged. Once the database profile is a reporter, every
-- reporter-owned read/write also requires the signed current generation.
drop policy "Applicants can read their own applications"
on public.reporter_applications;
create policy "Applicants can read their own applications"
on public.reporter_applications
for select
to authenticated
using (
  profile_id = (select auth.uid())
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.is_active
      and (
        profiles.role = 'reader'
        or (
          profiles.role = 'reporter'
          and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'reporter'
          and exists (
            select 1 from public.reporter_profiles
            where reporter_profiles.profile_id = profiles.id
              and reporter_profiles.access_sync_status = 'succeeded'
              and reporter_profiles.public_status <> 'suspended'
              and (select auth.jwt() -> 'app_metadata' -> 'reporter_access_generation')
                = to_jsonb(reporter_profiles.access_sync_generation)
          )
        )
      )
  )
);

drop policy "Reporters can read their own reporter profile"
on public.reporter_profiles;
create policy "Reporters can read their own reporter profile"
on public.reporter_profiles
for select
to authenticated
using (
  reporter_profiles.profile_id = (select auth.uid())
  and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'reporter'
  and (select auth.jwt() -> 'app_metadata' -> 'reporter_access_generation')
    = to_jsonb(reporter_profiles.access_sync_generation)
  and reporter_profiles.access_sync_status = 'succeeded'
  and reporter_profiles.public_status <> 'suspended'
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'reporter'
      and profiles.is_active
  )
);

drop policy "Applicants can read their own payments"
on public.reporter_payments;
create policy "Applicants can read their own payments"
on public.reporter_payments
for select
to authenticated
using (
  profile_id = (select auth.uid())
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.is_active
      and (
        profiles.role = 'reader'
        or (
          profiles.role = 'reporter'
          and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'reporter'
          and exists (
            select 1 from public.reporter_profiles
            where reporter_profiles.profile_id = profiles.id
              and reporter_profiles.access_sync_status = 'succeeded'
              and reporter_profiles.public_status <> 'suspended'
              and (select auth.jwt() -> 'app_metadata' -> 'reporter_access_generation')
                = to_jsonb(reporter_profiles.access_sync_generation)
          )
        )
      )
  )
);

drop policy "Applicants can read their own consent receipts"
on public.reporter_consents;
create policy "Applicants can read their own consent receipts"
on public.reporter_consents
for select
to authenticated
using (
  profile_id = (select auth.uid())
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.is_active
      and (
        profiles.role = 'reader'
        or (
          profiles.role = 'reporter'
          and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'reporter'
          and exists (
            select 1 from public.reporter_profiles
            where reporter_profiles.profile_id = profiles.id
              and reporter_profiles.access_sync_status = 'succeeded'
              and reporter_profiles.public_status <> 'suspended'
              and (select auth.jwt() -> 'app_metadata' -> 'reporter_access_generation')
                = to_jsonb(reporter_profiles.access_sync_generation)
          )
        )
      )
  )
);

drop policy "Reporters can read their own notifications"
on public.reporter_notifications;
create policy "Reporters can read their own notifications"
on public.reporter_notifications
for select
to authenticated
using (
  profile_id = (select auth.uid())
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.is_active
      and (
        profiles.role <> 'reporter'
        or (
          (select auth.jwt() -> 'app_metadata' ->> 'role') = 'reporter'
          and exists (
            select 1 from public.reporter_profiles
            where reporter_profiles.profile_id = profiles.id
              and reporter_profiles.access_sync_status = 'succeeded'
              and reporter_profiles.public_status <> 'suspended'
              and (select auth.jwt() -> 'app_metadata' -> 'reporter_access_generation')
                = to_jsonb(reporter_profiles.access_sync_generation)
          )
        )
      )
  )
);

drop policy "Reporters can mark their own notifications read"
on public.reporter_notifications;
create policy "Reporters can mark their own notifications read"
on public.reporter_notifications
for update
to authenticated
using (
  profile_id = (select auth.uid())
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.is_active
      and (
        profiles.role <> 'reporter'
        or (
          (select auth.jwt() -> 'app_metadata' ->> 'role') = 'reporter'
          and exists (
            select 1 from public.reporter_profiles
            where reporter_profiles.profile_id = profiles.id
              and reporter_profiles.access_sync_status = 'succeeded'
              and reporter_profiles.public_status <> 'suspended'
              and (select auth.jwt() -> 'app_metadata' -> 'reporter_access_generation')
                = to_jsonb(reporter_profiles.access_sync_generation)
          )
        )
      )
  )
)
with check (
  profile_id = (select auth.uid())
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.is_active
      and (
        profiles.role <> 'reporter'
        or (
          (select auth.jwt() -> 'app_metadata' ->> 'role') = 'reporter'
          and exists (
            select 1 from public.reporter_profiles
            where reporter_profiles.profile_id = profiles.id
              and reporter_profiles.access_sync_status = 'succeeded'
              and reporter_profiles.public_status <> 'suspended'
              and (select auth.jwt() -> 'app_metadata' -> 'reporter_access_generation')
                = to_jsonb(reporter_profiles.access_sync_generation)
          )
        )
      )
  )
);
