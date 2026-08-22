import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260822150000_reporter_submissions.sql",
  import.meta.url,
);
const typesUrl = new URL(
  "../../../../packages/database/src/database.types.ts",
  import.meta.url,
);

async function sourceOrEmpty(url) {
  try {
    return await readFile(url, "utf8");
  } catch {
    return "";
  }
}

const sql = await sourceOrEmpty(migrationUrl);
const databaseTypes = await readFile(typesUrl, "utf8");
const compact = (value) => value.replace(/\s+/gu, " ").trim();

function sqlFunction(name) {
  const match = sql.match(
    new RegExp(
      `create or replace function public\\.${name}\\b[\\s\\S]*?\\$\\$;`,
      "u",
    ),
  );
  assert.ok(match, `missing ${name} function`);
  return compact(match[0]);
}

test("reporter submission SQL keeps coordinates private and transitions atomic", () => {
  assert.match(sql, /create table public\.story_revisions/u);
  assert.match(sql, /create table public\.story_locations/u);
  assert.match(sql, /create or replace function public\.submit_reporter_story/u);
  assert.match(sql, /create or replace function public\.direct_publish_reporter_story/u);
  assert.match(sql, /create or replace function public\.withdraw_reporter_story/u);
  assert.match(sql, /create or replace function public\.request_reporter_changes/u);
  assert.doesNotMatch(sql, /grant select on (?:table )?public\.story_locations to anon/u);
  assert.doesNotMatch(sql, /create (?:or replace )?view public\.[^;]*story_locations/iu);
  assert.doesNotMatch(sql, /jsonb_build_object\([^;]*(?:latitude|longitude)/iu);
  assert.doesNotMatch(sql, /then\s+or\b/iu);
});

test("revision and location rows enforce immutable snapshots and bounded private evidence", () => {
  const source = compact(sql);

  assert.match(source, /snapshot jsonb not null/u);
  assert.match(source, /jsonb_typeof\(snapshot\) = 'object'/u);
  assert.match(source, /unique \(story_id, revision_number\)/u);
  assert.match(source, /revision_number > 0/u);
  assert.match(source, /associated_media_ids uuid\[\] not null/u);
  assert.match(source, /'approved'.*'scheduled'.*'direct_published'/u);
  assert.match(source, /before update or delete on public\.story_revisions/u);
  assert.match(source, /story_locations_latitude_check check \(latitude between -90 and 90\)/u);
  assert.match(source, /story_locations_longitude_check check \(longitude between -180 and 180\)/u);
  assert.match(source, /accuracy_meters > 0 and accuracy_meters <= 10000/u);
  assert.match(source, /captured_at >= received_at - interval '30 minutes'/u);
  assert.match(source, /captured_at <= received_at/u);
  assert.match(source, /retention_due_at timestamptz/u);
  assert.match(source, /legal_hold boolean not null default false/u);
  assert.match(source, /interval '1 year'/u);
});

test("revision and story guards preserve submitted and canonical provenance", () => {
  const immutable = sqlFunction("protect_story_revision_immutability");
  const draftGuard = sqlFunction("guard_reporter_story_draft_write");
  const provenanceGuard = sqlFunction("guard_reporter_story_provenance");

  assert.match(immutable, /tg_op = 'DELETE'/u);
  assert.match(immutable, /old\.review_outcome = 'pending_review'.*new\.review_outcome in \( 'changes_requested', 'approved', 'scheduled', 'published', 'rejected', 'withdrawn' \)/u);
  assert.match(immutable, /old\.review_outcome = 'approved'.*new\.review_outcome in \('scheduled', 'published', 'rejected'\)/u);
  assert.match(immutable, /old\.review_outcome = 'scheduled'.*new\.review_outcome in \('published', 'rejected'\)/u);
  assert.doesNotMatch(immutable, /old\.review_outcome = 'changes_requested'/u);
  assert.match(immutable, /new\.snapshot is distinct from old\.snapshot/u);
  assert.match(immutable, /new\.associated_media_ids is distinct from old\.associated_media_ids/u);
  assert.match(immutable, /new\.submitted_at is distinct from old\.submitted_at/u);
  assert.match(draftGuard, /current_user is distinct from 'authenticated'/u);
  assert.match(draftGuard, /new\.status is distinct from 'draft'/u);
  assert.match(draftGuard, /old\.status is distinct from 'draft'/u);
  assert.match(draftGuard, /new\.status is distinct from old\.status/u);
  assert.match(draftGuard, /new\.published_at is distinct from old\.published_at/u);
  assert.match(draftGuard, /new\.updated_at := clock_timestamp\(\)/u);
  assert.match(provenanceGuard, /security definer set search_path = ''/u);
  assert.match(provenanceGuard, /old_reporter_story boolean := public\.is_reporter_story\(old\)/u);
  assert.match(provenanceGuard, /new_reporter_story boolean := public\.is_reporter_story\(new\)/u);
  assert.match(provenanceGuard, /if not old_reporter_story and not new_reporter_story then return new/u);
  assert.match(provenanceGuard, /new\.story_type is distinct from old\.story_type/u);
  assert.match(provenanceGuard, /new\.content is distinct from old\.content/u);
  assert.match(provenanceGuard, /new\.featured_media_id is distinct from old\.featured_media_id/u);
  for (const field of [
    "submitted_at",
    "approved_by",
    "approved_at",
    "rejected_at",
    "rejection_reason",
    "scheduled_at",
    "published_at",
  ]) {
    assert.match(provenanceGuard, new RegExp(`new\\.${field} is distinct from old\\.${field}`, "u"));
  }
  assert.match(provenanceGuard, /old\.status = 'draft' and new\.status = 'draft'.*lifecycle_changed.*return new/u);
  assert.match(provenanceGuard, /new\.status = old\.status and lifecycle_changed/u);
  assert.match(provenanceGuard, /new\.updated_at := transition_time/u);
  assert.match(provenanceGuard, /REPORTER_STORY_PROVENANCE_IMMUTABLE/u);
  assert.match(provenanceGuard, /REPORTER_STORY_LIFECYCLE_IMMUTABLE/u);
});

test("reporter provenance is explicit and preserves legacy citizen-report CMS workflows", () => {
  const predicate = sqlFunction("is_reporter_story");
  const guard = sqlFunction("guard_reporter_story_provenance");
  const synchronize = sqlFunction("synchronize_reporter_story_evidence");
  const source = compact(sql);

  assert.match(predicate, /public\.is_reporter_story\(public\.stories\)/u);
  assert.match(predicate, /stable security definer set search_path = ''/u);
  assert.match(predicate, /\$1\.story_type = 'citizen_report'/u);
  assert.match(predicate, /reporter_profiles\.profile_id = \$1\.created_by/u);
  assert.match(predicate, /story_revisions\.story_id = \$1\.id/u);
  assert.match(guard, /old_reporter_story boolean := public\.is_reporter_story\(old\)/u);
  assert.match(guard, /new_reporter_story boolean := public\.is_reporter_story\(new\)/u);
  assert.match(guard, /if not old_reporter_story and not new_reporter_story then return new/u);
  assert.match(synchronize, /old_reporter_story boolean := public\.is_reporter_story\(old\)/u);
  assert.match(synchronize, /new_reporter_story boolean := public\.is_reporter_story\(new\)/u);
  assert.match(synchronize, /if \(not old_reporter_story and not new_reporter_story\)/u);

  for (const name of [
    "submit_reporter_story",
    "direct_publish_reporter_story",
    "withdraw_reporter_story",
    "request_reporter_changes",
  ]) {
    assert.match(sqlFunction(name), /not public\.is_reporter_story\(current_story\)/u);
  }

  for (const policy of [
    "Reporters can read their own stories",
    "Reporters can create their own story drafts",
    "Reporters can update their own story drafts",
  ]) {
    assert.match(source, new RegExp(`create policy "${policy}".*public\\.is_reporter_story\\(stories\\)`, "u"));
  }
  assert.match(source, /create or replace view public\.public_reporter_profiles.*public\.is_reporter_story\(stories\)/u);
  assert.match(source, /revoke all on function public\.is_reporter_story\(public\.stories\) from public, anon, authenticated, service_role/u);
  assert.match(source, /grant execute on function public\.is_reporter_story\(public\.stories\) to anon, authenticated, service_role/u);
});

test("every reporter review transition requires matching latest immutable evidence", () => {
  const guard = sqlFunction("guard_reporter_story_provenance");

  assert.match(guard, /select \* into current_revision from public\.story_revisions .* order by revision_number desc limit 1 for update/u);
  assert.match(guard, /if not found then.*REPORTER_STORY_EVIDENCE_REQUIRED/u);
  assert.match(guard, /from public\.media .* order by media\.id for share/u);
  assert.match(guard, /expected_snapshot := jsonb_build_object/u);
  assert.match(guard, /\(current_revision\.snapshot - 'event_occurred_at'\) is distinct from expected_snapshot/u);
  assert.match(guard, /current_revision\.associated_media_ids is distinct from canonical_media_ids/u);
  assert.match(guard, /current_revision\.submitted_by is distinct from new\.created_by/u);
  assert.match(guard, /REPORTER_STORY_EVIDENCE_MISMATCH/u);
  assert.match(guard, /old\.status = 'draft' and new\.status = 'pending_review'.*review_outcome is distinct from 'pending_review'/u);
  assert.match(guard, /old\.status = 'draft' and new\.status = 'published'.*review_outcome is distinct from 'direct_published'/u);
  assert.match(guard, /old\.status = 'pending_review' and new\.status = 'draft'.*review_outcome is distinct from 'changes_requested'/u);
  assert.match(guard, /old\.status = 'archived'.*old\.status in \('rejected', 'published'\).*new\.status is distinct from 'archived'.*REPORTER_STORY_TRANSITION_FORBIDDEN/u);
  assert.doesNotMatch(guard, /old\.status in \('rejected', 'archived', 'published'\).*new\.status = 'draft'/u);
});

test("reporter lifecycle transitions allow only their exact canonical fields", () => {
  const guard = sqlFunction("guard_reporter_story_provenance");

  assert.match(guard, /select exists \(.*profiles\.role::text = actor_role.*profiles\.is_active.*\) into staff_actor/u);
  assert.match(guard, /old\.status = 'pending_review' and new\.status in \('approved', 'scheduled', 'published', 'rejected', 'archived'\).*review_outcome is distinct from 'pending_review' or not staff_actor/u);
  assert.match(guard, /if new\.status = 'rejected'.*new\.approved_by is distinct from old\.approved_by.*new\.approved_at is distinct from old\.approved_at.*new\.scheduled_at is distinct from old\.scheduled_at.*new\.published_at is distinct from old\.published_at.*length\(btrim\(new\.rejection_reason\)\).*new\.rejected_at := transition_time/u);
  assert.match(guard, /elsif new\.status = 'approved'.*new\.approved_by is distinct from actor_id.*new\.rejected_at is distinct from old\.rejected_at.*new\.scheduled_at is distinct from old\.scheduled_at.*new\.published_at is distinct from old\.published_at.*new\.approved_at := transition_time/u);
  assert.match(guard, /elsif new\.status = 'scheduled'.*new\.approved_by is distinct from actor_id.*new\.published_at is distinct from old\.published_at.*new\.scheduled_at <= transition_time.*new\.approved_at := transition_time/u);
  assert.match(guard, /elsif new\.status = 'published'.*new\.approved_by is distinct from actor_id.*new\.scheduled_at is distinct from old\.scheduled_at.*new\.approved_at := transition_time.*new\.published_at := transition_time/u);
  assert.match(guard, /old\.status = 'approved'.*new\.status = 'published'.*new\.scheduled_at is not null.*new\.published_at := transition_time/u);
  assert.match(guard, /old\.status = 'scheduled'.*new\.status = 'published'.*new\.scheduled_at is not null.*new\.published_at := transition_time/u);
  assert.match(guard, /old\.status = 'published' and new\.status = 'archived'.*lifecycle_changed/u);
  assert.match(guard, /new\.submitted_at is distinct from current_revision\.submitted_at/u);
  assert.match(guard, /new\.approved_at is distinct from current_revision\.reviewed_at/u);
});

test("canonical CMS review states advance reporter evidence monotonically and audit every transition", () => {
  const synchronize = sqlFunction("synchronize_reporter_story_evidence");

  assert.match(synchronize, /security definer set search_path = ''/u);
  assert.match(synchronize, /not old_reporter_story and not new_reporter_story/u);
  assert.match(synchronize, /new\.status not in \('approved', 'scheduled', 'published', 'rejected', 'archived'\)/u);
  assert.match(synchronize, /select \* into current_revision from public\.story_revisions .* order by revision_number desc limit 1 for update/u);
  assert.match(synchronize, /when new\.status = 'approved' then 'approved'/u);
  assert.match(synchronize, /when new\.status = 'scheduled' then 'scheduled'/u);
  assert.match(synchronize, /when new\.status = 'published' then 'published'/u);
  assert.match(synchronize, /when new\.status = 'rejected' then 'rejected'/u);
  assert.match(synchronize, /when current_revision\.review_outcome in \( 'direct_published', 'published', 'rejected', 'withdrawn' \) then current_revision\.review_outcome else 'rejected'/u);
  assert.match(synchronize, /insert into public\.audit_events/u);
  assert.match(synchronize, /'story\.reporter_revision_transition'/u);
  assert.doesNotMatch(synchronize, /jsonb_build_object\([^;]*(?:latitude|longitude|accuracy_meters|captured_at)/iu);
  assert.match(synchronize, /new\.status in \('published', 'rejected'\)/u);
  assert.match(synchronize, /new\.status = 'archived'.*current_revision\.review_outcome in \(\s*'pending_review', 'approved', 'scheduled'/u);
  assert.doesNotMatch(synchronize, /new\.status = 'archived'.*current_revision\.review_outcome in \([^)]*'changes_requested'/u);
  assert.match(synchronize, /set retention_due_at = greatest/u);
  assert.match(synchronize, /transition_time \+ interval '1 year'/u);
  assert.match(synchronize, /transition_time := clock_timestamp\(\)/u);
  assert.doesNotMatch(synchronize, /transition_time := (?:case|new\.)/u);
  assert.doesNotMatch(synchronize, /coalesce\(new\.(?:published_at|rejected_at|updated_at)/u);
  assert.match(synchronize, /insert into public\.audit_events \( actor_id, action, subject_type, subject_id, metadata, created_at \).*transition_time/u);
});

test("reporter RPC authorization rejects NULL roles and orphaned story ownership", () => {
  for (const name of [
    "submit_reporter_story",
    "direct_publish_reporter_story",
    "withdraw_reporter_story",
  ]) {
    const owner = sqlFunction(name);
    assert.match(owner, /actor_role is distinct from 'reporter'/u);
    assert.match(owner, /current_profile\.role is distinct from 'reporter'/u);
    assert.match(owner, /current_reporter\.access_sync_desired_role is distinct from 'reporter'/u);
    assert.match(owner, /current_story\.created_by is distinct from actor_id/u);
    assert.doesNotMatch(
      owner,
      /(?:actor_role|current_profile\.role|current_reporter\.access_sync_desired_role|current_story\.created_by)\s*<>/u,
    );
  }
});

test("reviewed submission locks ownership and snapshots canonical story media atomically", () => {
  const submit = sqlFunction("submit_reporter_story");

  assert.match(submit, /security definer set search_path = ''/u);
  assert.match(submit, /auth\.jwt\(\) -> 'app_metadata' ->> 'role'.*'reporter'/u);
  assert.match(submit, /from public\.reporter_profiles .* for update/u);
  assert.match(submit, /from public\.profiles .* for update/u);
  assert.match(submit, /from public\.stories .* for update/u);
  assert.match(submit, /access_sync_status is distinct from 'succeeded'/u);
  assert.match(submit, /reporter_access_generation.*access_sync_generation/u);
  assert.match(submit, /public_status not in \('active', 'grace'\)/u);
  assert.match(submit, /membership_grace_ends_at < submission_time/u);
  assert.match(submit, /not public\.is_reporter_story\(current_story\)/u);
  assert.match(submit, /current_story\.created_by is distinct from actor_id/u);
  assert.match(submit, /current_story\.status is distinct from 'draft'/u);
  assert.match(submit, /from public\.languages/u);
  assert.match(submit, /join public\.categories/u);
  assert.match(submit, /from public\.media/u);
  assert.match(submit, /from public\.media .* order by media\.id for share/u);
  assert.doesNotMatch(submit, /for key share/u);
  assert.match(submit, /media\.created_by is distinct from actor_id/u);
  assert.match(submit, /media\.story_id = current_story\.id/u);
  assert.match(submit, /media\.deleted_at is not null/u);
  assert.match(submit, /coalesce\(max\(revision_number\), 0\) \+ 1/u);
  assert.match(submit, /insert into public\.story_revisions/u);
  assert.match(submit, /insert into public\.story_locations/u);
  assert.match(submit, /status = 'pending_review'/u);
  assert.match(submit, /insert into public\.audit_events/u);
  assert.ok(
    submit.indexOf("insert into public.story_revisions") < submit.indexOf("update public.stories"),
    "submission must create immutable evidence before changing canonical status",
  );
});

test("direct publication is active-membership only and supplies canonical review timestamps", () => {
  const publish = sqlFunction("direct_publish_reporter_story");

  assert.match(publish, /security definer set search_path = ''/u);
  assert.match(publish, /from public\.reporter_profiles .* for update/u);
  assert.match(publish, /from public\.profiles .* for update/u);
  assert.match(publish, /from public\.stories .* for update/u);
  assert.match(publish, /from public\.media .* order by media\.id for share/u);
  assert.doesNotMatch(publish, /for key share/u);
  assert.match(publish, /current_reporter\.public_status is distinct from 'active'/u);
  assert.match(publish, /membership_expires_at < publication_time/u);
  assert.match(publish, /not current_reporter\.can_publish_directly/u);
  assert.doesNotMatch(publish, /public_status not in \('active', 'grace'\)/u);
  assert.match(publish, /review_outcome.*'direct_published'/u);
  assert.match(publish, /status = 'published'/u);
  assert.match(publish, /approved_by = actor_id/u);
  assert.match(publish, /approved_at = publication_time/u);
  assert.match(publish, /published_at = publication_time/u);
  assert.match(publish, /'story\.direct_published'/u);
  assert.ok(
    publish.indexOf("insert into public.story_revisions") < publish.indexOf("update public.stories"),
    "direct publication must create immutable evidence before changing canonical status",
  );
});

test("withdrawal and staff changes requests preserve editorial authority", () => {
  const withdraw = sqlFunction("withdraw_reporter_story");
  const changes = sqlFunction("request_reporter_changes");

  assert.match(withdraw, /from public\.reporter_profiles .* for update/u);
  assert.match(withdraw, /from public\.profiles .* for update/u);
  assert.match(withdraw, /from public\.stories .* for update/u);
  assert.match(withdraw, /from public\.media .* order by media\.id for share/u);
  assert.doesNotMatch(withdraw, /for key share/u);
  assert.match(withdraw, /status not in \('draft', 'pending_review'\)/u);
  assert.match(withdraw, /status = 'rejected'/u);
  assert.match(withdraw, /review_outcome = 'withdrawn'/u);
  assert.match(withdraw, /set retention_due_at = greatest\( coalesce\(retention_due_at, withdrawal_time \+ interval '1 year'\), withdrawal_time \+ interval '1 year' \)/u);
  assert.ok(
    withdraw.indexOf("update public.story_revisions") < withdraw.indexOf("update public.stories")
      && withdraw.indexOf("insert into public.story_revisions") < withdraw.indexOf("update public.stories"),
    "withdrawal evidence must be finalized before changing canonical status",
  );

  assert.match(changes, /actor_role not in \('editor', 'admin'\)/u);
  assert.match(changes, /profiles\.role = actor_role/u);
  assert.match(changes, /profiles\.is_active/u);
  assert.match(changes, /select \* into current_profile from public\.profiles .* for update/u);
  assert.match(changes, /p_reason is null or length\(btrim\(p_reason\)\) = 0/u);
  assert.match(changes, /from public\.stories .* for update/u);
  assert.match(changes, /from public\.story_revisions .* for update/u);
  assert.match(changes, /current_story\.status is distinct from 'pending_review'/u);
  assert.match(changes, /review_outcome = 'changes_requested'/u);
  assert.match(changes, /status = 'draft'/u);
  assert.match(changes, /insert into public\.reporter_notifications/u);
  assert.match(changes, /insert into public\.audit_events/u);
  assert.ok(
    changes.indexOf("update public.story_revisions") < changes.indexOf("update public.stories"),
    "changes-request evidence must be finalized before returning the story to draft",
  );
});

test("RLS exposes only owned reporter evidence and never permits direct evidence writes", () => {
  const source = compact(sql);

  for (const table of ["story_revisions", "story_locations"]) {
    assert.match(source, new RegExp(`alter table public\\.${table} enable row level security`, "u"));
    assert.match(source, new RegExp(`grant select on table public\\.${table} to authenticated`, "u"));
    assert.doesNotMatch(source, new RegExp(`grant (?:insert|update|delete|all)[^;]*public\\.${table}[^;]*to authenticated`, "u"));
  }
  assert.doesNotMatch(source, /grant [^;]*insert[^;]*public\.story_(?:revisions|locations)[^;]*to service_role/u);
  assert.match(source, /create policy "Reporters can read their own story revisions"/u);
  assert.match(source, /create policy "Reporters can read their own story locations"/u);
  assert.match(source, /create policy "Staff can read reporter story revisions"/u);
  assert.match(source, /create policy "Editors and admins can read reporter story locations"/u);
  assert.doesNotMatch(source, /profiles\.role in \('writer', 'editor', 'admin'\)/u);
  assert.match(source, /create policy "Reporters can create their own story drafts"/u);
  assert.match(source, /create policy "Reporters can update their own story drafts"/u);
  assert.match(source, /with check \([^;]*status = 'draft'/u);
  assert.match(source, /reporter_access_generation/u);
});

test("active synchronized reporters can read only their own canonical media", () => {
  const source = compact(sql);

  assert.match(source, /grant select on table public\.media to authenticated/u);
  assert.match(source, /create policy "Reporters can read their own canonical media" on public\.media for select to authenticated using/u);
  assert.match(source, /media\.created_by = \(select auth\.uid\(\)\)/u);
  assert.match(source, /auth\.jwt\(\) -> 'app_metadata' ->> 'role'\) = 'reporter'/u);
  assert.match(source, /profiles\.role = 'reporter'/u);
  assert.match(source, /profiles\.is_active/u);
  assert.match(source, /reporter_profiles\.public_status in \('active', 'grace'\)/u);
  assert.match(source, /reporter_profiles\.membership_started_at <= clock_timestamp\(\)/u);
  assert.match(source, /reporter_profiles\.membership_grace_ends_at >= clock_timestamp\(\)/u);
  assert.match(source, /reporter_profiles\.access_sync_status = 'succeeded'/u);
  assert.match(source, /reporter_access_generation.*access_sync_generation/u);
  assert.doesNotMatch(source, /grant (?:insert|update) on table public\.media to authenticated/u);
});

test("generated database contracts expose submission tables and RPCs", () => {
  const source = compact(databaseTypes);

  assert.match(source, /story_revisions: \{ Row:/u);
  assert.match(source, /story_locations: \{ Row:/u);
  assert.match(source, /submit_reporter_story: \{ Args:/u);
  assert.match(source, /direct_publish_reporter_story: \{ Args:/u);
  assert.match(source, /withdraw_reporter_story: \{ Args:/u);
  assert.match(source, /request_reporter_changes: \{ Args:/u);
  assert.match(source, /stories: \{ Row: \{.*is_reporter_story: boolean/u);
  assert.match(source, /is_reporter_story: \{ Args: \{ "": Database\["public"\]\["Tables"\]\["stories"\]\["Row"\] \} Returns: boolean \}/u);
});
