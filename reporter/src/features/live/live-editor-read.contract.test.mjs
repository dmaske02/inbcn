import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../../../../supabase/migrations/20260822161000_reporter_live_editor_read.sql", import.meta.url);
const reviewMigrationUrl = new URL("../../../../supabase/migrations/20260822163000_livekit_recording_review.sql", import.meta.url);
const verificationUrl = new URL("../../../../supabase/verification/reporter-live-recording-verification.sql", import.meta.url);

test("active signed editors receive select-only live-request access", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /create policy "Active editors can read live requests"/u);
  assert.match(migration, /for select to authenticated/u);
  assert.match(migration, /'editor'/u);
  assert.doesNotMatch(migration, /for (insert|update|delete)/iu);
  assert.doesNotMatch(migration, /grant execute/u);
});

test("the migration chain creates the editor policy exactly once and has a rollback-safe runtime contract", async () => {
  const [editorMigration, reviewMigration, verification] = await Promise.all([
    readFile(migrationUrl, "utf8"),
    readFile(reviewMigrationUrl, "utf8"),
    readFile(verificationUrl, "utf8").catch(() => ""),
  ]);
  const chain = `${editorMigration}\n${reviewMigration}`;
  assert.equal(
    chain.match(/create policy "Active editors can read live requests"/gu)?.length,
    1,
  );
  assert.match(verification, /^\\set ON_ERROR_STOP on/mu);
  assert.match(verification, /begin;/u);
  assert.match(verification, /policyname = 'Active editors can read live requests'/u);
  assert.match(verification, /editor_policy_count is distinct from 1/u);
  assert.match(verification, /to_regprocedure\('public\.claim_livekit_webhook_event\(text,text,text\)'\)/u);
  assert.match(verification, /to_regprocedure\('public\.claim_livekit_webhook_event\(uuid,text,text\)'\) is not null/u);
  assert.match(verification, /rollback;\s*$/u);
});
