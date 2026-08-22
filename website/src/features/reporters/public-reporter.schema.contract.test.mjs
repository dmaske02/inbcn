import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../../../../supabase/migrations/20260822154000_public_reporter_profiles.sql",
    import.meta.url,
  ),
  "utf8",
);
const databaseTypes = await readFile(
  new URL("../../../../packages/database/src/database.types.ts", import.meta.url),
  "utf8",
);
const compact = (value) => value.replace(/\s+/gu, " ").trim();

test("public reporter association is a read-only, fixed-path, exactly granted computed field", () => {
  const sql = compact(migration);

  assert.match(sql, /create function public\.public_reporter\(public\.stories\) returns jsonb language sql stable security definer set search_path = ''/u);
  assert.match(sql, /\$1\.status = 'published'/u);
  assert.match(sql, /public\.is_reporter_story\(\$1\)/u);
  assert.match(sql, /from public\.public_reporter_profiles/u);
  assert.match(sql, /reporter_profiles\.profile_id = \$1\.created_by/u);
  assert.match(sql, /revoke all on function public\.public_reporter\(public\.stories\) from public, anon, authenticated, service_role;/u);
  assert.match(sql, /grant execute on function public\.public_reporter\(public\.stories\) to anon, authenticated, service_role;/u);
  assert.doesNotMatch(sql, /dynamic|execute format|grant all/iu);
});

test("computed JSON contains only safe view keys and no private evidence", () => {
  const keys = [
    ...migration.matchAll(/'([a-z_]+)',\s*public_reporter_profiles\.[a-z_]+/gu),
  ].map((match) => match[1]).sort();

  assert.deepEqual(keys, [
    "avatar_url",
    "beats",
    "bio",
    "home_district",
    "legal_display_name",
    "public_slug",
    "public_status",
  ]);
  assert.doesNotMatch(
    migration,
    /story_locations|story_revisions|reporter_applications|reporter_payments|reporter_consents|audit_events|latitude|longitude|accuracy|kyc_|phone|date_of_birth|suspension_reason/iu,
  );
  assert.match(compact(databaseTypes), /public_reporter: Json \| null/u);
});
