import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const plans = await Promise.all([
  "../../../../docs/superpowers/plans/2026-08-22-reporter-submissions-profiles.md",
  "../../../../docs/superpowers/plans/2026-08-22-reporter-live-recording.md",
  "../../../../docs/superpowers/plans/2026-08-22-reporter-operations-release.md",
].map((path) => readFile(new URL(path, import.meta.url), "utf8")));

test("dependent reporter migrations use unique versions after foundation hardening in dependency order", () => {
  const expected = [
    "20260822150000_reporter_submissions.sql",
    "20260822160000_reporter_live_recording.sql",
    "20260822170000_reporter_privacy_operations.sql",
  ];

  for (const [index, filename] of expected.entries()) {
    assert.match(plans[index], new RegExp(filename, "u"));
  }
  assert.doesNotMatch(plans.join("\n"), /202608221(?:00000_reporter_submissions|10000_reporter_live_recording|20000_reporter_privacy_operations)\.sql/u);
});

test("temporary onboarding migration follows the reporter release migrations", async () => {
  const migrations = await readdir(new URL("../../../../supabase/migrations/", import.meta.url));
  const temporary = "20260824170000_temporary_reporter_onboarding.sql";

  assert.ok(migrations.includes(temporary));
  assert.ok(temporary > "20260822170000_reporter_privacy_operations.sql");
});
