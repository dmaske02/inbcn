import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const hardeningUrl = new URL(
  "../../../../supabase/migrations/20260822140000_reporter_foundation_final_hardening.sql",
  import.meta.url,
);
const repositoryUrl = new URL("./application.repository.ts", import.meta.url);
const actionsUrl = new URL("./application.actions.ts", import.meta.url);

async function sourceOrEmpty(url) {
  try {
    return await readFile(url, "utf8");
  } catch {
    return "";
  }
}

test("authenticated Data API clients retain owner reads but have no application or consent DML path", async () => {
  const sql = (await sourceOrEmpty(hardeningUrl)).replace(/\s+/gu, " ");

  assert.match(sql, /revoke insert, update on table public\.reporter_applications from authenticated;/u);
  assert.match(sql, /revoke insert on table public\.reporter_consents from authenticated;/u);
  assert.match(sql, /revoke insert \( profile_id, legal_name, date_of_birth, age_18_declared, home_city, home_district, home_state, bio, beats, public_photo_url, public_photo_id \) on table public\.reporter_applications from authenticated;/u);
  assert.match(sql, /revoke update \( legal_name, date_of_birth, age_18_declared, home_city, home_district, home_state, bio, beats, public_photo_url, public_photo_id \) on table public\.reporter_applications from authenticated;/u);
  assert.match(sql, /revoke insert \( application_id, profile_id, notice_key, notice_version, locale \) on table public\.reporter_consents from authenticated;/u);
  assert.match(sql, /drop policy "Applicants can create their own draft application" on public\.reporter_applications;/u);
  assert.match(sql, /drop policy "Applicants can update only their own draft application" on public\.reporter_applications;/u);
  assert.match(sql, /drop policy "Applicants can record consent on their own draft application" on public\.reporter_consents;/u);
  assert.doesNotMatch(sql, /create policy "Applicants can (?:create|update|record)/u);
  assert.doesNotMatch(sql, /grant (?:insert|update)[^;]*to authenticated/u);
});

test("database constraints mirror the validated application and Cloudinary portrait boundary", async () => {
  const sql = (await sourceOrEmpty(hardeningUrl)).replace(/\s+/gu, " ");

  assert.match(sql, /length\(btrim\(legal_name\)\) between 2 and 120/u);
  assert.match(sql, /date_of_birth <= \(/u);
  assert.match(sql, /timezone\('Asia\/Kolkata', current_timestamp\)::date - interval '18 years'/u);
  assert.match(sql, /length\(btrim\(home_city\)\) between 2 and 100/u);
  assert.match(sql, /bio is null or length\(btrim\(bio\)\) <= 500/u);
  assert.match(sql, /beats <@ array\['civic', 'crime', 'education', 'environment', 'health', 'business', 'culture', 'sports'\]::text\[\]/u);
  assert.match(sql, /public_photo_id ~ '\^inbcn\/reporter\/portrait\//u);
  assert.match(sql, /public_photo_url ~ '\^https:\/\/res\[\.\]cloudinary\[\.\]com\//u);
  assert.match(sql, /public_photo_url ~ \('\/' \|\| public_photo_id \|\| '\[\.\]\[A-Za-z0-9\]\+\$'\)/u);
  assert.match(sql, /unique \(public_photo_id\)/u);
});

test("only the server-only admin repository performs validated application and consent writes", async () => {
  const source = await readFile(repositoryUrl, "utf8");
  const insertDraft = source.slice(
    source.indexOf("export async function insertApplicationDraft"),
    source.indexOf("export async function insertConsentReceipts"),
  );
  const insertConsents = source.slice(
    source.indexOf("export async function insertConsentReceipts"),
    source.indexOf("async function reserveKycStart"),
  );

  assert.match(insertDraft, /createAdminClient\(\)/u);
  assert.doesNotMatch(insertDraft, /await createClient\(\)/u);
  assert.match(insertDraft, /POSTGRES_ERROR_CODE\.test\(error\.code\)/u);
  assert.match(insertConsents, /createAdminClient\(\)/u);
  assert.doesNotMatch(insertConsents, /await createClient\(\)/u);
});

test("every application server action authenticates before reaching service-role persistence", async () => {
  const source = await readFile(actionsUrl, "utf8");

  assert.match(source, /const actor = await requireReporterSession\(\);/gu);
  assert.equal(source.match(/await requireReporterSession\(\)/gu)?.length, 2);
  assert.doesNotMatch(source, /profileId:\s*formData/u);
  assert.doesNotMatch(source, /public_photo_verified|created_at|updated_at/u);
});
