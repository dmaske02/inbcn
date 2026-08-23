import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canManageRecordingLegalHold,
  canReviewRecordings,
  parseRecordingDetailRow,
  parseRecordingListRow,
  validatePublication,
  validatePrivateReason,
} from "./recording.model.ts";
import {
  RecordingReviewError,
  createRecordingService,
} from "./recording.service.ts";
import { createAwsS3Presigner } from "./recording-preview.server.ts";

const recordingId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const categoryId = "33333333-3333-4333-8333-333333333333";
const thumbnailId = "44444444-4444-4444-8444-444444444444";
const actorId = "55555555-5555-4555-8555-555555555555";
const editor = { id: actorId, email: null, displayName: "Editor", role: "editor", preferredLanguage: null };
const admin = { ...editor, role: "admin" };

const listRow = {
  id: recordingId,
  live_request_id: requestId,
  request_title: "Monsoon update",
  request_locality: "Dadar",
  recording_status: "completed",
  replay_status: "private",
  duration_seconds: 72,
  bytes: 1_048_576,
  recording_started_at: "2026-08-22T07:00:00.000Z",
  recording_ended_at: "2026-08-22T07:01:12.000Z",
  created_at: "2026-08-22T06:59:00.000Z",
};

const detailRow = {
  ...listRow,
  request_purpose: "Verified road closure update",
  request_expected_starts_at: "2026-08-22T07:00:00.000Z",
  request_expected_duration_minutes: 15,
  published_title: null,
  published_description: null,
  published_category_id: null,
  published_thumbnail_media_id: null,
  published_at: null,
  rejected_at: null,
  rejection_reason: null,
  legal_hold: false,
  legal_hold_reason: null,
  legal_hold_changed_at: null,
  deletion_due_at: "2026-11-20T07:01:12.000Z",
};

function repository(overrides = {}) {
  const calls = [];
  return {
    calls,
    list: async () => [listRow],
    get: async () => ({ row: detailRow, storageKey: `reporter-live/${requestId}/${recordingId}.mp4` }),
    publish: async (...args) => { calls.push(["publish", ...args]); return { state: "updated" }; },
    reject: async (...args) => { calls.push(["reject", ...args]); return { state: "updated" }; },
    setLegalHold: async (...args) => { calls.push(["hold", ...args]); return { state: "updated" }; },
    options: async () => ({
      categories: [{ id: categoryId, name: "Mumbai" }],
      thumbnails: [{ id: thumbnailId, title: "Road closure", alt_text: "Flooded road" }],
    }),
    ...overrides,
  };
}

test("only editors and admins can review recordings; legal hold remains admin-only", () => {
  assert.equal(canReviewRecordings("writer"), false);
  assert.equal(canReviewRecordings("reporter"), false);
  assert.equal(canReviewRecordings("editor"), true);
  assert.equal(canReviewRecordings("admin"), true);
  assert.equal(canManageRecordingLegalHold("editor"), false);
  assert.equal(canManageRecordingLegalHold("admin"), true);
});

test("database rows are strict, bounded, and expose no provider or account facts", () => {
  assert.deepEqual(parseRecordingListRow(listRow), {
    id: recordingId,
    requestId,
    requestTitle: "Monsoon update",
    requestLocality: "Dadar",
    recordingStatus: "completed",
    replayStatus: "private",
    durationSeconds: 72,
    bytes: 1_048_576,
    recordingStartedAt: "2026-08-22T07:00:00.000Z",
    recordingEndedAt: "2026-08-22T07:01:12.000Z",
    createdAt: "2026-08-22T06:59:00.000Z",
  });
  assert.deepEqual(
    {
      rejectionReason: parseRecordingDetailRow(detailRow).rejectionReason,
      legalHoldReason: parseRecordingDetailRow(detailRow).legalHoldReason,
      legalHoldChangedAt: parseRecordingDetailRow(detailRow).legalHoldChangedAt,
    },
    { rejectionReason: null, legalHoldReason: null, legalHoldChangedAt: null },
  );

  for (const unsafe of [
    { storage_key: "secret.mp4" },
    { egress_id: "EG_secret" },
    { provider_error: "secret" },
    { private_metadata: {} },
    { profile_id: actorId },
    { signed_url: "https://private.invalid" },
  ]) {
    assert.throws(() => parseRecordingListRow({ ...listRow, ...unsafe }));
    assert.throws(() => parseRecordingDetailRow({ ...detailRow, ...unsafe }));
  }
  assert.throws(() => parseRecordingListRow({ ...listRow, request_title: "x".repeat(241) }));
  assert.throws(() => parseRecordingDetailRow({ ...detailRow, duration_seconds: -1 }));
});

test("publication and private reasons are trimmed and bounded", () => {
  assert.deepEqual(validatePublication({
    title: "  Monsoon replay  ",
    description: "  Verified update.  ",
    categoryId,
    thumbnailMediaId: thumbnailId,
  }), {
    ok: true,
    value: { title: "Monsoon replay", description: "Verified update.", categoryId, thumbnailMediaId: thumbnailId },
  });
  for (const input of [
    { title: "", description: "Valid", categoryId, thumbnailMediaId: thumbnailId },
    { title: "x".repeat(241), description: "Valid", categoryId, thumbnailMediaId: thumbnailId },
    { title: "Valid", description: "x".repeat(4001), categoryId, thumbnailMediaId: thumbnailId },
    { title: "Valid", description: "Valid", categoryId: "not-a-uuid", thumbnailMediaId: thumbnailId },
  ]) assert.equal(validatePublication(input).ok, false);
  assert.deepEqual(validatePrivateReason("  Editorial reason  "), { ok: true, value: "Editorial reason" });
  assert.equal(validatePrivateReason(" ").ok, false);
  assert.equal(validatePrivateReason("x".repeat(2001)).ok, false);
});

test("the service denies writers, returns safe parsed rows, and signs only eligible detail previews for 60 seconds", async () => {
  const repo = repository();
  const signed = [];
  const service = createRecordingService({
    repository: repo,
    signPreview: async (key, expiresIn) => {
      signed.push([key, expiresIn]);
      return "https://signed.example/preview?redacted=1";
    },
  });
  await assert.rejects(
    service.list({ ...editor, role: "writer" }),
    (error) => error instanceof RecordingReviewError && error.code === "FORBIDDEN",
  );
  assert.deepEqual(await service.list(editor), [parseRecordingListRow(listRow)]);
  const result = await service.get(editor, recordingId);
  assert.equal(result?.previewUrl, "https://signed.example/preview?redacted=1");
  assert.deepEqual(signed, [[`reporter-live/${requestId}/${recordingId}.mp4`, 60]]);
  assert.equal(JSON.stringify(result).includes("storageKey"), false);
});

test("mutations enforce roles, normalize facts, and map persistence failures to fixed errors", async () => {
  const repo = repository();
  const service = createRecordingService({ repository: repo, signPreview: async () => "unused" });
  const metadata = { title: "  Replay  ", description: "  Description  ", categoryId, thumbnailMediaId: thumbnailId };
  await service.publish(editor, recordingId, metadata);
  await service.reject(editor, recordingId, "  Not suitable  ");
  await service.setLegalHold(admin, recordingId, true, "  Litigation  ");
  assert.deepEqual(repo.calls, [
    ["publish", recordingId, { title: "Replay", description: "Description", categoryId, thumbnailMediaId: thumbnailId }],
    ["reject", recordingId, "Not suitable"],
    ["hold", recordingId, true, "Litigation"],
  ]);
  await assert.rejects(
    service.setLegalHold(editor, recordingId, true, "Reason"),
    (error) => error instanceof RecordingReviewError && error.code === "FORBIDDEN",
  );

  const conflict = createRecordingService({
    repository: repository({ publish: async () => { throw new Error("LIVE_RECORDING_DECISION_CONFLICT secret"); } }),
    signPreview: async () => "unused",
  });
  await assert.rejects(
    conflict.publish(admin, recordingId, metadata),
    (error) => error instanceof RecordingReviewError
      && error.code === "CONFLICT"
      && !error.message.includes("secret"),
  );
});

test("the Node crypto signer matches the official AWS SigV4 S3 query vector", () => {
  const url = createAwsS3Presigner({
    accessKey: "AKIAIOSFODNN7EXAMPLE",
    secret: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    bucket: "examplebucket",
    region: "us-east-1",
    forcePathStyle: false,
  }).signGet("test.txt", 86400, new Date("2013-05-24T00:00:00.000Z"));
  const parsed = new URL(url);
  assert.equal(parsed.origin, "https://examplebucket.s3.amazonaws.com");
  assert.equal(parsed.searchParams.get("X-Amz-Signature"), "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404");
});

test("private preview URLs use the exact configured location and expiry without embedding secrets", () => {
  const secret = "not-present-in-url";
  const key = `reporter-live/${requestId}/${recordingId}.mp4`;
  const url = createAwsS3Presigner({
    accessKey: "preview-access-key",
    secret,
    bucket: "private-recordings",
    region: "ap-south-1",
    endpoint: "https://objects.example.test",
    forcePathStyle: true,
  }).signGet(key, 60, new Date("2026-08-22T07:00:00.000Z"));
  const parsed = new URL(url);
  assert.equal(parsed.origin, "https://objects.example.test");
  assert.equal(parsed.pathname, `/private-recordings/${key}`);
  assert.equal(parsed.searchParams.get("X-Amz-Expires"), "60");
  assert.equal(url.includes(secret), false);
  assert.equal(url.includes(actorId), false);
  assert.equal(url.includes("egress"), false);
});

test("the migration keeps receipt completion atomic and the public projection allowlisted", async () => {
  const migration = await readFile(new URL(
    "../../../../../../supabase/migrations/20260822163000_livekit_recording_review.sql",
    import.meta.url,
  ), "utf8");
  const normalized = migration.replace(/\s+/gu, " ");

  assert.match(normalized, /create table public\.public_live_replays/u);
  assert.match(normalized, /alter table public\.public_live_replays enable row level security/u);
  assert.match(normalized, /revoke all on table public\.public_live_replays from public, anon, authenticated, service_role/u);
  assert.doesNotMatch(normalized.match(/create table public\.public_live_replays[\s\S]*?;/u)?.[0] ?? "", /(storage_key|egress_id|profile_id|provider|reason|location|signed_url)/u);
  assert.match(normalized, /create table public\.live_recording_editorial_private/u);
  assert.match(normalized, /revoke all on table public\.live_recording_editorial_private from public, anon, authenticated/u);
  const privateTable = normalized.match(/create table public\.live_recording_editorial_private[\s\S]*?;/u)?.[0] ?? "";
  assert.doesNotMatch(privateTable, /legal_hold_reason/u);
  assert.match(normalized, /create table public\.live_recording_legal_hold_events/u);
  assert.match(normalized, /recording_id uuid not null[\s\S]*actor_id uuid not null[\s\S]*legal_hold boolean not null[\s\S]*reason text not null[\s\S]*created_at timestamptz not null default clock_timestamp\(\)/u);
  assert.match(normalized, /on public\.live_recording_legal_hold_events \(actor_id\)/u);
  assert.match(normalized, /revoke all on table public\.live_recording_legal_hold_events from public, anon, authenticated, service_role/u);
  assert.match(normalized, /before update or delete on public\.live_recording_legal_hold_events/u);
  assert.match(normalized, /revoke all on function public\.prevent_live_recording_private_mutation\(\) from public, anon, authenticated, service_role/u);
  const holdFunction = normalized.slice(
    normalized.indexOf("create function public.set_live_recording_legal_hold"),
    normalized.indexOf("revoke all on function public.claim_livekit_webhook_event"),
  );
  assert.match(holdFunction, /from public\.live_recording_legal_hold_events[\s\S]*order by created_at desc, id desc[\s\S]*limit 1[\s\S]*for update/u);
  assert.match(holdFunction, /insert into public\.live_recording_legal_hold_events/u);
  assert.match(holdFunction, /latest_hold_event\.actor_id is distinct from actor_id/u);
  assert.doesNotMatch(holdFunction, /update public\.live_recording_legal_hold_events|on conflict/u);

  for (const rpc of [
    "publish_live_recording",
    "reject_live_recording",
    "set_live_recording_legal_hold",
  ]) {
    assert.match(normalized, new RegExp(`create(?: or replace)? function public\\.${rpc}`, "u"));
    assert.match(normalized, new RegExp(`grant execute on function public\\.${rpc}[^;]+ to authenticated`, "u"));
  }
  assert.match(normalized, /for update[\s\S]*LIVE_RECORDING_DECISION_CONFLICT/u);
  assert.match(normalized, /insert into public\.audit_events/u);
  assert.doesNotMatch(normalized.match(/insert into public\.audit_events[\s\S]*?;/u)?.[0] ?? "", /(reason|storage|egress|provider|location)/u);
});

test("protected pages and actions reauthenticate, revalidate both apps, and keep private fields out of client contracts", async () => {
  const [actions, repositorySource, listPage, detailPage, review, navigation] = await Promise.all([
    readFile(new URL("./recording.actions.ts", import.meta.url), "utf8"),
    readFile(new URL("./recording.repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../../../../cms/src/app/admin/(protected)/reporters/recordings/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../../../../cms/src/app/admin/(protected)/reporters/recordings/[id]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("./recording-review.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../../../../cms/src/app/admin/(protected)/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(actions, /^"use server";/u);
  assert.equal(actions.match(/requireAdminUser\(\)/gu)?.length, 3);
  assert.match(actions, /revalidatePath\("\/admin\/reporters\/recordings"\)/u);
  assert.match(actions, /revalidatePath\(`\/admin\/reporters\/recordings\/\$\{id\}`\)/u);
  assert.match(actions, /import \{ revalidateWebsite \} from "@\/features\/admin\/public-revalidation"/u);
  assert.match(actions, /await revalidateWebsite\("all"\)/u);
  assert.match(actions, /try \{[\s\S]*await publishRecording\([\s\S]*await revalidateWebsite\("all"\);[\s\S]*\} catch \(error\) \{[\s\S]*return safeError\(error\);/u);
  assert.doesNotMatch(actions, /revalidatePath\([^\n]*replays/u);
  assert.match(repositorySource, /from\("live_recording_legal_hold_events"\)[\s\S]*order\("created_at", \{ ascending: false \}\)[\s\S]*order\("id", \{ ascending: false \}\)[\s\S]*limit\(1\)/u);
  assert.match(listPage, /requireAdminUser\(\)/u);
  assert.match(detailPage, /params: Promise<\{ id: string \}>/u);
  assert.match(detailPage, /await connection\(\);[\s\S]*requireAdminUser\(\)/u);
  assert.match(review, /aria-live="polite"/u);
  assert.match(review, /expires after 60 seconds/u);
  assert.match(navigation, /href="\/admin\/reporters\/recordings">Recordings/u);
  for (const source of [actions, listPage, detailPage, review, navigation]) {
    assert.doesNotMatch(source, /(storageKey|egressId|providerError|privateMetadata|profileId|accountId)/u);
  }
});
