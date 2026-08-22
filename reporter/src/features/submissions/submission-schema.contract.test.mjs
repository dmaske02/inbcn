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

test("revision and draft guards preserve submitted and server-owned fields", () => {
  const immutable = sqlFunction("protect_story_revision_immutability");
  const draftGuard = sqlFunction("guard_reporter_story_draft_write");
  const publishedGuard = sqlFunction("guard_published_reporter_story_content");

  assert.match(immutable, /tg_op = 'DELETE'/u);
  assert.match(immutable, /old\.review_outcome <> 'pending_review'/u);
  assert.match(immutable, /new\.snapshot is distinct from old\.snapshot/u);
  assert.match(immutable, /new\.associated_media_ids is distinct from old\.associated_media_ids/u);
  assert.match(immutable, /new\.submitted_at is distinct from old\.submitted_at/u);
  assert.match(draftGuard, /current_user <> 'authenticated'/u);
  assert.match(draftGuard, /new\.status <> 'draft'/u);
  assert.match(draftGuard, /old\.status <> 'draft'/u);
  assert.match(draftGuard, /new\.status is distinct from old\.status/u);
  assert.match(draftGuard, /new\.published_at is distinct from old\.published_at/u);
  assert.match(draftGuard, /new\.updated_at := clock_timestamp\(\)/u);
  assert.match(publishedGuard, /old\.story_type = 'citizen_report'/u);
  assert.match(publishedGuard, /old\.published_at is not null/u);
  assert.match(publishedGuard, /new\.content is distinct from old\.content/u);
  assert.match(publishedGuard, /new\.featured_media_id is distinct from old\.featured_media_id/u);
  assert.match(publishedGuard, /REPORTER_STORY_PUBLISHED_EDIT_FORBIDDEN/u);
});

test("canonical CMS final states finalize pending reporter evidence and retention", () => {
  const finalize = sqlFunction("finalize_reporter_story_evidence");

  assert.match(finalize, /security definer set search_path = ''/u);
  assert.match(finalize, /new\.story_type <> 'citizen_report'/u);
  assert.match(finalize, /new\.status not in \('published', 'rejected'\)/u);
  assert.match(finalize, /story_revisions\.review_outcome = 'pending_review'/u);
  assert.match(finalize, /order by story_revisions\.revision_number desc limit 1/u);
  assert.match(finalize, /set review_outcome = new\.status::text/u);
  assert.match(finalize, /set retention_due_at = greatest/u);
  assert.match(finalize, /final_time \+ interval '1 year'/u);
});

test("reviewed submission locks ownership and snapshots canonical story media atomically", () => {
  const submit = sqlFunction("submit_reporter_story");

  assert.match(submit, /security definer set search_path = ''/u);
  assert.match(submit, /auth\.jwt\(\) -> 'app_metadata' ->> 'role'.*'reporter'/u);
  assert.match(submit, /from public\.reporter_profiles .* for update/u);
  assert.match(submit, /from public\.profiles .* for update/u);
  assert.match(submit, /from public\.stories .* for update/u);
  assert.match(submit, /access_sync_status <> 'succeeded'/u);
  assert.match(submit, /reporter_access_generation.*access_sync_generation/u);
  assert.match(submit, /public_status not in \('active', 'grace'\)/u);
  assert.match(submit, /membership_grace_ends_at < submission_time/u);
  assert.match(submit, /story_type <> 'citizen_report'/u);
  assert.match(submit, /current_story\.created_by <> actor_id/u);
  assert.match(submit, /current_story\.status <> 'draft'/u);
  assert.match(submit, /from public\.languages/u);
  assert.match(submit, /join public\.categories/u);
  assert.match(submit, /from public\.media/u);
  assert.match(submit, /media\.created_by is distinct from actor_id/u);
  assert.match(submit, /media\.story_id = current_story\.id/u);
  assert.match(submit, /media\.deleted_at is not null/u);
  assert.match(submit, /coalesce\(max\(revision_number\), 0\) \+ 1/u);
  assert.match(submit, /insert into public\.story_revisions/u);
  assert.match(submit, /insert into public\.story_locations/u);
  assert.match(submit, /status = 'pending_review'/u);
  assert.match(submit, /insert into public\.audit_events/u);
});

test("direct publication is active-membership only and supplies canonical review timestamps", () => {
  const publish = sqlFunction("direct_publish_reporter_story");

  assert.match(publish, /security definer set search_path = ''/u);
  assert.match(publish, /from public\.reporter_profiles .* for update/u);
  assert.match(publish, /from public\.profiles .* for update/u);
  assert.match(publish, /from public\.stories .* for update/u);
  assert.match(publish, /current_reporter\.public_status <> 'active'/u);
  assert.match(publish, /membership_expires_at < publication_time/u);
  assert.match(publish, /not current_reporter\.can_publish_directly/u);
  assert.doesNotMatch(publish, /public_status not in \('active', 'grace'\)/u);
  assert.match(publish, /review_outcome.*'direct_published'/u);
  assert.match(publish, /status = 'published'/u);
  assert.match(publish, /approved_by = actor_id/u);
  assert.match(publish, /approved_at = publication_time/u);
  assert.match(publish, /published_at = publication_time/u);
  assert.match(publish, /'story\.direct_published'/u);
});

test("withdrawal and staff changes requests preserve editorial authority", () => {
  const withdraw = sqlFunction("withdraw_reporter_story");
  const changes = sqlFunction("request_reporter_changes");

  assert.match(withdraw, /from public\.reporter_profiles .* for update/u);
  assert.match(withdraw, /from public\.profiles .* for update/u);
  assert.match(withdraw, /from public\.stories .* for update/u);
  assert.match(withdraw, /status not in \('draft', 'pending_review'\)/u);
  assert.match(withdraw, /status = 'rejected'/u);
  assert.match(withdraw, /review_outcome = 'withdrawn'/u);
  assert.match(withdraw, /retention_due_at = withdrawal_time \+ interval '1 year'/u);

  assert.match(changes, /actor_role not in \('editor', 'admin'\)/u);
  assert.match(changes, /profiles\.role = actor_role/u);
  assert.match(changes, /profiles\.is_active/u);
  assert.match(changes, /select \* into current_profile from public\.profiles .* for update/u);
  assert.match(changes, /p_reason is null or length\(btrim\(p_reason\)\) = 0/u);
  assert.match(changes, /from public\.stories .* for update/u);
  assert.match(changes, /from public\.story_revisions .* for update/u);
  assert.match(changes, /current_story\.status <> 'pending_review'/u);
  assert.match(changes, /review_outcome = 'changes_requested'/u);
  assert.match(changes, /status = 'draft'/u);
  assert.match(changes, /insert into public\.reporter_notifications/u);
  assert.match(changes, /insert into public\.audit_events/u);
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

test("generated database contracts expose submission tables and RPCs", () => {
  const source = compact(databaseTypes);

  assert.match(source, /story_revisions: \{ Row:/u);
  assert.match(source, /story_locations: \{ Row:/u);
  assert.match(source, /submit_reporter_story: \{ Args:/u);
  assert.match(source, /direct_publish_reporter_story: \{ Args:/u);
  assert.match(source, /withdraw_reporter_story: \{ Args:/u);
  assert.match(source, /request_reporter_changes: \{ Args:/u);
});
