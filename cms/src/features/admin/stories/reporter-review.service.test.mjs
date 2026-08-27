import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canReviewReporterStory,
  getAllowedStoryCommands,
  parseReporterReviewReason,
} from "./story.model.ts";
import { canSetReporterTrust } from "../reporters/reporter.model.ts";

const root = new URL("../../../../../", import.meta.url);
const migration = await readFile(
  new URL("supabase/migrations/20260822153000_reporter_review_trust.sql", root),
  "utf8",
).catch(() => "");
const correctionMigration = await readFile(
  new URL("supabase/migrations/20260822157000_reporter_editorial_corrections.sql", root),
  "utf8",
).catch(() => "");
const [service, actions, storyList, reporterRepository, reporterService, reporterActions, panel, directory, layout, databaseTypes] = await Promise.all([
  readFile(new URL("./story.service.ts", import.meta.url), "utf8"),
  readFile(new URL("./story.actions.ts", import.meta.url), "utf8"),
  readFile(new URL("./story-list.tsx", import.meta.url), "utf8"),
  readFile(new URL("../reporters/reporter.repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../reporters/reporter.service.ts", import.meta.url), "utf8"),
  readFile(new URL("../reporters/reporter.actions.ts", import.meta.url), "utf8"),
  readFile(new URL("./reporter-revision-panel.tsx", import.meta.url), "utf8").catch(() => ""),
  readFile(new URL("../reporters/reporter-directory.tsx", import.meta.url), "utf8").catch(() => ""),
  readFile(new URL("../../../app/admin/(protected)/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("packages/database/src/database.types.ts", root), "utf8"),
]);

function compact(value) {
  return value.replace(/\s+/gu, " ").trim();
}

function sqlFunction(name, signatureStart = "") {
  const sql = (correctionMigration.includes(`create or replace function public.${name}(`)
    ? correctionMigration
    : migration).replace(/\r\n?/gu, "\n");
  const marker = `create or replace function public.${name}(${signatureStart}`;
  const start = sql.indexOf(marker);
  assert.notEqual(start, -1, `missing ${name}`);
  const end = sql.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `unterminated ${name}`);
  return compact(sql.slice(start, end + 4));
}

test("review and trust authorization is explicit and reporter commands never enable content mutation", () => {
  assert.equal(canSetReporterTrust("admin"), true);
  assert.equal(canSetReporterTrust("editor"), false);
  assert.equal(canSetReporterTrust("writer"), false);
  assert.equal(canReviewReporterStory("admin", "pending_review"), true);
  assert.equal(canReviewReporterStory("editor", "pending_review"), true);
  assert.equal(canReviewReporterStory("writer", "pending_review"), false);
  assert.deepEqual(
    getAllowedStoryCommands("editor", "pending_review", false, false, true),
    ["request_changes", "approve", "reject", "publish", "schedule"],
  );
  assert.deepEqual(
    getAllowedStoryCommands("admin", "pending_review", false, false, true),
    ["request_changes", "approve", "reject", "publish", "schedule"],
  );
  assert.deepEqual(
    getAllowedStoryCommands("editor", "published", false, false, true),
    ["archive"],
  );
  assert.deepEqual(
    getAllowedStoryCommands("writer", "pending_review", false, false, true),
    [],
  );
  assert.deepEqual(
    getAllowedStoryCommands("admin", "pending_review", false, false, false),
    ["save", "approve", "reject", "publish", "schedule", "delete"],
  );
});

test("reporter review reasons are trimmed and bounded", () => {
  assert.deepEqual(parseReporterReviewReason("  Verify the source.  "), {
    success: true,
    reason: "Verify the source.",
  });
  assert.equal(parseReporterReviewReason(" ").success, false);
  assert.equal(parseReporterReviewReason("x".repeat(2001)).success, false);
});

test("private review projection has independent staff checks and a narrow safe allowlist", () => {
  const projection = sqlFunction("get_reporter_story_review", "p_story_id uuid");
  assert.match(projection, /security definer set search_path = ''/u);
  assert.match(projection, /actor_role not in \('editor', 'admin'\)/u);
  assert.match(projection, /profiles\.id = actor_id[\s\S]*profiles\.role::text = actor_role[\s\S]*profiles\.is_active/u);
  assert.match(projection, /not public\.is_reporter_story\(current_story\)/u);
  assert.match(projection, /order by revision_number desc limit 1 for share/u);
  for (const field of [
    "latest_revision", "canonical_story", "reporter", "submitted_media", "private_location", "story_audit",
    "legal_name", "portrait_url", "public_slug", "home_city", "home_district", "home_state",
    "latitude", "longitude", "accuracy_meters", "captured_at", "locality",
  ]) {
    assert.match(projection, new RegExp(`'${field}'`, "u"));
  }
  assert.doesNotMatch(
    projection,
    /reporter_applications|reporter_payments|reporter_consents|webhook_events|kyc_|razorpay|access_sync_claim_token|suspension_token/u,
  );
  assert.match(compact(migration), /revoke all on function public\.get_reporter_story_review\(uuid\) from public, anon, authenticated, service_role/u);
  assert.match(compact(migration), /grant execute on function public\.get_reporter_story_review\(uuid\) to authenticated/u);
});

test("changes requests delegate exact latest-revision concurrency to the existing RPC", () => {
  assert.match(service, /\.rpc\("request_reporter_changes", \{[\s\S]*p_story_id: storyId,[\s\S]*p_revision_id: latestRevisionId,[\s\S]*p_reason: reason/u);
  assert.match(service, /canReviewReporterStory\(admin\.role, story\.status\)/u);
  assert.match(actions, /export async function reviewReporterStoryAction/u);
  assert.match(actions, /await requestReporterChanges\(admin, storyId, latestRevisionId, reason\)/u);
  assert.match(actions, /The reporter review action could not be completed/u);
});

test("canonical guarded transitions stay authoritative and public revalidation is proportional", () => {
  assert.match(
    service,
    /runStoryCommand\(admin, storyId, command, story\.updatedAt, scheduledAt, reason\)/u,
  );
  assert.doesNotMatch(service, /\.from\("story_revisions"\)\.update/u);
  assert.match(actions, /publicAffecting = command === "publish" \|\| command === "archive"/u);
  assert.match(actions, /revalidatePath\(`\/admin\/stories\/\$\{storyId\}`\)/u);
  assert.match(actions, /if \(reporterAffecting\)[\s\S]*revalidatePath\("\/admin\/reporters"\)/u);
  assert.match(actions, /revalidateStories\(storyId, publicAffecting, true\)/u);
  assert.match(actions, /publicAffecting[\s\S]*revalidatePublicNews/u);
});

test("reporter rows expose detail review but no bulk selection path", () => {
  assert.match(
    storyList,
    /story\.isReporterStory\s*\?\s*null\s*:\s*<input[\s\S]*name="storyIds"/u,
  );
  assert.match(storyList, /href=\{`\/admin\/stories\/\$\{story\.id\}`\}>Open<\/Link>/u);
  assert.match(
    service,
    /runBulkStoryCommand[\s\S]*runPreauthorizedStoryBatch[\s\S]*getCmsStoryById[\s\S]*runStoryCommand/u,
  );
});

test("pending reporter rejection notifies exactly once without affecting legacy citizen reports", () => {
  const notification = sqlFunction("notify_reporter_story_rejection");
  assert.match(notification, /old\.status is distinct from 'pending_review'/u);
  assert.match(notification, /new\.status is distinct from 'rejected'/u);
  assert.match(notification, /not public\.is_reporter_story\(new\)/u);
  assert.match(notification, /review_outcome[\s\S]*= 'withdrawn'/u);
  assert.match(notification, /insert into public\.reporter_notifications/u);
  assert.match(notification, /'story_rejected'/u);
  assert.doesNotMatch(notification, /latitude|longitude|accuracy|review_reason|rejection_reason/u);
  assert.match(migration, /create trigger zz_notify_reporter_story_rejection\s+after update of status on public\.stories/u);
});

test("editorial corrections are narrow, revision-conflicted, audited, and RPC-only", () => {
  const correction = sqlFunction("correct_reporter_story", "\n  p_story_id uuid,");
  assert.match(correction, /security definer set search_path = ''/u);
  assert.match(correction, /actor_role not in \('editor', 'admin'\)/u);
  assert.match(correction, /profiles\.role::text = actor_role[\s\S]*profiles\.is_active/u);
  assert.match(correction, /from public\.stories[\s\S]*for update/u);
  assert.match(correction, /order by revision_number desc[\s\S]*limit 1[\s\S]*for update/u);
  assert.match(correction, /current_revision\.id is distinct from p_revision_id/u);
  assert.match(correction, /current_story\.updated_at is distinct from p_expected_updated_at/u);
  assert.match(correction, /jsonb_object_keys\(p_patch\)/u);
  assert.match(correction, /jsonb_typeof\(keyword\) is distinct from 'string'/u);
  assert.match(correction, /sum\(length\(keyword\)\)/u);
  assert.match(correction, /length\(btrim\(p_reason\)\) not between 1 and 2000/u);
  assert.match(correction, /public\.is_reporter_story\(current_story\)/u);
  assert.match(correction, /insert into private\.reporter_story_correction_states/u);
  assert.match(correction, /insert into private\.reporter_story_corrections/u);
  assert.match(correction, /'story\.reporter_editorial_corrected'/u);
  assert.match(correction, /'changed_fields'/u);
  assert.match(correction, /'correction_event_id'/u);
  const genericAudit = correction.slice(correction.indexOf("insert into public.audit_events"), correction.indexOf("insert into public.reporter_notifications"));
  assert.doesNotMatch(genericAudit, /'reason'|p_reason|latitude|longitude|accuracy/u);
  assert.match(correctionMigration, /create table private\.reporter_story_corrections/u);
  assert.match(correctionMigration, /create trigger reporter_story_corrections_are_append_only\s+before update or delete/u);
  assert.match(compact(correctionMigration), /revoke all on table private\.reporter_story_corrections from public, anon, authenticated, service_role/u);
  assert.doesNotMatch(correction, /insert into public\.story_revisions|update public\.story_revisions/u);
  assert.match(compact(correctionMigration), /revoke all on function public\.correct_reporter_story\(uuid, uuid, timestamptz, jsonb, text\) from public, anon, authenticated, service_role/u);
  assert.match(compact(correctionMigration), /grant execute on function public\.correct_reporter_story\(uuid, uuid, timestamptz, jsonb, text\) to authenticated/u);
  assert.match(databaseTypes, /correct_reporter_story: \{[\s\S]*p_expected_updated_at: string[\s\S]*p_patch: Json[\s\S]*p_reason: string[\s\S]*p_revision_id: string[\s\S]*p_story_id: string/u);
});

test("reporter archive provenance and correction verification are rollback-safe", async () => {
  const provenance = sqlFunction("guard_reporter_story_provenance");
  assert.match(correctionMigration, /drop constraint stories_review_status_check[\s\S]*status not in \('approved', 'scheduled', 'published', 'archived'\)[\s\S]*rejected_at is not null/u);
  assert.match(provenance, /reporter_story_correction_states/u);
  assert.match(provenance, /new\.approved_by is distinct from old\.approved_by/u);
  assert.doesNotMatch(provenance, /old\.status = 'rejected'[\s\S]*new\.approved_by is distinct from actor_id/u);
  const verifier = await readFile(new URL("supabase/verification/reporter-editorial-correction-verification.sql", root), "utf8").catch(() => "");
  assert.match(verifier, /^\\set ON_ERROR_STOP on/mu);
  assert.match(verifier, /begin;/u);
  assert.match(verifier, /rollback;/u);
  assert.match(verifier, /correct_reporter_story/u);
  assert.match(verifier, /REPORTER_CORRECTION_REVISION_CONFLICT/u);
  assert.match(verifier, /reporter_story_corrections/u);
  assert.match(verifier, /metadata \? 'reason'/u);
});

test("CMS exposes a clearly labeled correction action and revalidates public corrections", () => {
  assert.match(panel, /Editorial correction/u);
  assert.match(actions, /correctReporterStoryAction/u);
  assert.match(actions, /await correctReporterStory/u);
  assert.match(panel, /name="expectedUpdatedAt"[^>]*value=\{story\.updatedAt\}/u);
  assert.match(actions, /expectedUpdatedAt: formData\.get\("expectedUpdatedAt"\)/u);
  assert.match(actions, /revalidateStories\(storyId, published, true\)/u);
  assert.doesNotMatch(actions, /saveStory\(admin, storyId/u);
});

test("trust RPC locks established rows and owns exact gates, provenance, idempotency, audit, and notification", () => {
  const trust = sqlFunction("set_reporter_trust", "\n  p_profile_id uuid,");
  assert.match(trust, /actor_role is distinct from 'admin'/u);
  assert.match(trust, /where profiles\.id = actor_id[\s\S]*profiles\.role = 'admin'[\s\S]*profiles\.is_active/u);
  assert.match(trust, /from public\.reporter_profiles[\s\S]*for update[\s\S]*from public\.profiles[\s\S]*for update/u);
  assert.match(trust, /p_capability is null/u);
  assert.match(trust, /p_capability not in \('direct_publish', 'live_broadcast'\)/u);
  assert.match(trust, /length\(btrim\(p_reason\)\) not between 1 and 2000/u);
  assert.match(trust, /current_profile\.role is distinct from 'reporter'/u);
  assert.match(trust, /if current_value = p_enabled then[\s\S]*'changed', false/u);
  assert.match(trust, /current_reporter\.public_status is distinct from 'active'/u);
  assert.match(trust, /not current_profile\.is_active/u);
  assert.match(trust, /access_sync_status is distinct from 'succeeded'/u);
  assert.match(trust, /access_sync_desired_role is distinct from 'reporter'/u);
  assert.match(trust, /membership_started_at > transition_time/u);
  assert.match(trust, /membership_expires_at < transition_time/u);
  assert.match(trust, /direct_publish_granted_by = actor_id/u);
  assert.match(trust, /direct_publish_revoked_by = actor_id/u);
  assert.match(trust, /live_broadcast_granted_by = actor_id/u);
  assert.match(trust, /live_broadcast_revoked_by = actor_id/u);
  assert.match(trust, /insert into public\.audit_events/u);
  assert.match(trust, /insert into public\.reporter_notifications/u);
  assert.doesNotMatch(trust, /access_sync_claim_token|suspension_token|kyc|payment/u);
  assert.match(compact(migration), /revoke all on function public\.set_reporter_trust\(uuid, text, boolean, text\) from public, anon, authenticated, service_role/u);
  assert.match(compact(migration), /grant execute on function public\.set_reporter_trust\(uuid, text, boolean, text\) to authenticated/u);
});

test("directory is admin-only and reuses existing administration flows", async () => {
  const [listPage, detailPage] = await Promise.all([
    readFile(new URL("../../../app/admin/(protected)/reporters/page.tsx", import.meta.url), "utf8").catch(() => ""),
    readFile(new URL("../../../app/admin/(protected)/reporters/[id]/page.tsx", import.meta.url), "utf8").catch(() => ""),
  ]);
  for (const page of [listPage, detailPage]) {
    assert.match(page, /requireAdminUser\(\)/u);
    assert.match(page, /canSetReporterTrust\(admin\.role\)/u);
    assert.match(page, /redirect\("\/admin\/forbidden"\)/u);
  }
  assert.match(reporterRepository, /async function listReporters/u);
  assert.match(reporterRepository, /async function findApprovedApplicationId/u);
  assert.match(reporterService, /async listReporters\(admin/u);
  assert.match(reporterService, /async getReporter\(admin/u);
  assert.match(reporterActions, /export async function setReporterTrustAction/u);
  assert.match(directory, /suspendReporterAction|ApplicationReview/u);
  assert.match(directory, /Enable|Disable/u);
  assert.match(directory, /Raw grant/u);
  assert.match(directory, /Effective now/u);
  assert.match(directory, /reporter\.membershipStartedAt <= now/u);
  assert.match(layout, /canSetReporterTrust\(admin\.role\)[\s\S]*href="\/admin\/reporters"/u);
});

test("private coordinates stay confined to the visibly private panel and manual RPC type parity ships", () => {
  assert.match(panel, /Private newsroom evidence/u);
  assert.match(panel, /Exact coordinates must never be copied into public story fields/u);
  assert.match(panel, /rel="noreferrer"/u);
  assert.match(panel, /aria-live="polite"/u);
  assert.doesNotMatch(reporterRepository, /latitude|longitude|accuracy_meters/u);
  assert.match(databaseTypes, /get_reporter_story_review: \{[\s\S]*Args: \{ p_story_id: string \}[\s\S]*Returns: Json/u);
  assert.match(databaseTypes, /set_reporter_trust: \{[\s\S]*p_capability: string[\s\S]*p_enabled: boolean[\s\S]*p_profile_id: string[\s\S]*p_reason: string[\s\S]*Returns: Json/u);
});
