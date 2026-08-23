import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8").catch(() => "");
const compact = (value) => value.replace(/\s+/gu, " ").trim();

const [
  migration,
  verification,
  storiesRepository,
  searchQuery,
  alertsRepository,
  databaseTypes,
  reporterNotFound,
] = await Promise.all([
  read("supabase/migrations/20260822155000_public_story_access_hardening.sql"),
  read("supabase/verification/public-story-access-verification.sql"),
  read("website/src/features/news/server/stories.repository.ts"),
  read("website/src/features/news/server/stories.search-query.mjs"),
  read("website/src/features/alerts/breaking-alerts.repository.ts"),
  read("packages/database/src/database.types.ts"),
  read("website/src/app/[locale]/reporters/[slug]/not-found.tsx"),
]);

const expectedPublicStoryColumns = [
  "canonical_url",
  "category_id",
  "content",
  "external_author",
  "external_image_height",
  "external_image_url",
  "external_image_width",
  "external_url",
  "featured_media_id",
  "id",
  "is_breaking",
  "is_featured",
  "is_reporter_story",
  "is_sponsored",
  "language_id",
  "public_reporter",
  "published_at",
  "search_document",
  "seo_description",
  "seo_keywords",
  "seo_title",
  "slug",
  "source_id",
  "status",
  "story_type",
  "summary",
  "title",
  "translation_group_id",
  "updated_at",
];

test("anonymous stories use one exact safe view and no base-table privilege", () => {
  const sql = compact(migration);
  const view = migration.match(
    /create view public\.public_stories[\s\S]+?as\s+select\s+([\s\S]+?)\s+from public\.stories/u,
  )?.[1] ?? "";
  const columns = [...view.matchAll(
    /(?:stories\.([a-z_]+)|public\.[a-z_]+\(stories\) as ([a-z_]+))/gu,
  )].map((match) => match[1] ?? match[2]).sort();

  assert.deepEqual(columns, expectedPublicStoryColumns);
  assert.match(sql, /create view public\.public_stories with \(security_barrier = true\)/u);
  assert.match(sql, /from public\.stories where stories\.status = 'published' and stories\.published_at is not null and stories\.published_at <= now\(\)/u);
  assert.match(sql, /revoke all on table public\.stories from public, anon;/u);
  assert.match(sql, /grant select on table public\.public_stories to anon, authenticated;/u);
  assert.match(sql, /revoke all on table public\.public_stories from public, anon, authenticated, service_role;/u);
  assert.doesNotMatch(view, /created_by|approved_by|submitted_at|approved_at|rejected_at|rejection_reason|scheduled_at|created_at|event_occurred_at/iu);
});

test("base RLS and reporter attribution enforce current database publication", () => {
  const sql = compact(migration);

  assert.match(sql, /drop policy "Public can read published stories" on public\.stories;/u);
  assert.match(sql, /create policy "Authenticated can read currently published stories" on public\.stories for select to authenticated using \( status = 'published' and published_at is not null and published_at <= now\(\) \);/u);
  assert.match(sql, /create or replace function public\.public_reporter\(public\.stories\) returns jsonb language sql stable security definer set search_path = ''/u);
  assert.match(sql, /when \$1\.status = 'published' and \$1\.published_at is not null and \$1\.published_at <= now\(\) and public\.is_reporter_story\(\$1\)/u);
});

test("anonymous media exposes only website display fields for current public stories", () => {
  const sql = compact(migration);
  const grant = sql.match(
    /grant select \(([^)]+)\) on table public\.media to anon;/u,
  )?.[1].split(",").map((column) => column.trim()).sort() ?? [];

  assert.deepEqual(grant, [
    "alt_text",
    "caption",
    "cloudinary_public_id",
    "height",
    "id",
    "secure_url",
    "width",
  ]);
  assert.match(sql, /revoke all on table public\.media from anon;/u);
  assert.match(sql, /create policy "Anonymous can read media for current public stories" on public\.media for select to anon/u);
  assert.match(sql, /from public\.public_stories/u);
  assert.doesNotMatch(grant.join(","), /story_id|created_by|updated_by|deleted_by|metadata|original_filename/iu);
});

test("every anonymous website story read uses the safe view while staff stays on stories", () => {
  const publicRepository = storiesRepository.slice(
    0,
    storiesRepository.indexOf("export async function getCmsStories"),
  );
  const staffRepository = storiesRepository.slice(
    storiesRepository.indexOf("export async function getCmsStories"),
  );
  const publicAlerts = alertsRepository.slice(
    alertsRepository.indexOf("export async function getActiveBreakingAlerts"),
    alertsRepository.indexOf("export type AlertListQuery"),
  );

  assert.match(publicRepository, /from\("public_stories"\)/u);
  assert.doesNotMatch(publicRepository, /from\("stories"\)/u);
  assert.match(searchQuery, /from\("public_stories"\)/u);
  assert.doesNotMatch(searchQuery, /from\("stories"\)/u);
  assert.match(publicAlerts, /from\("public_stories"\)/u);
  assert.doesNotMatch(publicAlerts, /story:stories|from\("stories"\)/u);
  assert.match(staffRepository, /from\("stories"\)/u);
  assert.match(databaseTypes, /public_stories: \{[\s\S]+public_reporter: Json \| null/u);
});

test("rollback verification exercises grants, roles, row visibility, and protected columns", () => {
  const sql = compact(verification);

  assert.match(sql, /^\\set ON_ERROR_STOP on begin;/u);
  assert.match(sql, /set local role anon;/u);
  assert.match(sql, /set local role authenticated;/u);
  assert.match(sql, /has_table_privilege\('anon', 'public\.stories', 'select'\)/u);
  assert.match(sql, /has_column_privilege\('anon', 'public\.media', 'created_by', 'select'\)/u);
  assert.match(sql, /public\.public_stories/u);
  assert.match(sql, /rollback;$/u);
});

test("reporter not-found content does not nest another main landmark", () => {
  assert.doesNotMatch(reporterNotFound, /<\/?main\b/gu);
});
