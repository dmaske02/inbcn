import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8").catch(() => "");
const compact = (value) => value.replace(/\s+/gu, " ").trim();

const [
  migration,
  correctionMigration,
  canonicalMediaMigration,
  verification,
  storiesRepository,
  searchQuery,
  alertsRepository,
  databaseTypes,
  reporterNotFound,
] = await Promise.all([
  read("supabase/migrations/20260822155000_public_story_access_hardening.sql"),
  read("supabase/migrations/20260822156000_public_media_and_reporter_path_hardening.sql"),
  read("supabase/migrations/20260903160000_public_story_canonical_media.sql"),
  read("supabase/verification/public-story-access-verification.sql"),
  read("website/src/features/news/server/stories.repository.ts"),
  read("website/src/features/news/server/stories.search-query.mjs"),
  read("website/src/features/alerts/breaking-alerts.repository.ts"),
  read("packages/database/src/database.types.ts"),
  read("website/src/app/[locale]/reporters/[slug]/not-found.tsx"),
]);

test("published stories expose an effective image from the latest public revision", () => {
  const sql = compact(canonicalMediaMigration);

  assert.match(sql, /create or replace view public\.public_stories with \(security_barrier = true\)/u);
  assert.match(sql, /coalesce\( stories\.featured_media_id, \( select media\.id/u);
  assert.match(sql, /from \( select story_revisions\.associated_media_ids from public\.story_revisions where story_revisions\.story_id = stories\.id and story_revisions\.review_outcome in \('published', 'direct_published'\) order by story_revisions\.revision_number desc limit 1 \) as latest_revision/u);
  assert.match(sql, /cross join lateral unnest\(latest_revision\.associated_media_ids\) with ordinality as associated_media\(id, position\)/u);
  assert.match(sql, /join public\.media on media\.id = associated_media\.id/u);
  assert.match(sql, /media\.story_id = stories\.id/u);
  assert.match(sql, /media\.media_type = 'image'/u);
  assert.match(sql, /media\.deleted_at is null/u);
  assert.match(sql, /media\.secure_url ~ '\^https:\/\/'/u);
  assert.match(sql, /order by associated_media\.position limit 1 \) \) as featured_media_id/u);
  assert.doesNotMatch(sql, /story_locations|latitude|longitude|coordinates/iu);
});

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

const expectedPublicMediaColumns = [
  "alt_text",
  "caption",
  "cloudinary_public_id",
  "height",
  "id",
  "secure_url",
  "width",
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

test("base RLS has no generic public authenticated story policy while reporter attribution stays current", () => {
  const originalSql = compact(migration);
  const correctionSql = compact(correctionMigration);

  assert.match(originalSql, /drop policy "Public can read published stories" on public\.stories;/u);
  assert.match(correctionSql, /drop policy "Authenticated can read currently published stories" on public\.stories;/u);
  assert.match(originalSql, /create or replace function public\.public_reporter\(public\.stories\) returns jsonb language sql stable security definer set search_path = ''/u);
  assert.match(originalSql, /when \$1\.status = 'published' and \$1\.published_at is not null and \$1\.published_at <= now\(\) and public\.is_reporter_story\(\$1\)/u);
});

test("public media uses one exact safe view and no generic base-table policy", () => {
  const sql = compact(correctionMigration);
  const view = correctionMigration.match(
    /create view public\.public_media[\s\S]+?as\s+select\s+([\s\S]+?)\s+from public\.media/u,
  )?.[1] ?? "";
  const columns = [...view.matchAll(/media\.([a-z_]+)/gu)]
    .map((match) => match[1])
    .sort();

  assert.deepEqual(columns, expectedPublicMediaColumns);
  assert.match(sql, /create view public\.public_media with \(security_barrier = true\)/u);
  assert.match(sql, /from public\.media where exists \( select 1 from public\.public_stories where public_stories\.featured_media_id = media\.id \)/u);
  assert.match(sql, /and \( media\.cloudinary_public_id !~ '\^inbcn\/reporter\/story\/' or \( media\.cloudinary_public_id = 'inbcn\/reporter\/story\/' \|\| \(media\.metadata ->> 'reporterStoryId'\) \|\| '\/' \|\| \(media\.metadata ->> 'cloudinaryObjectId'\)/u);
  assert.match(sql, /position\('\/' \|\| media\.cloudinary_public_id in media\.secure_url\) > 0/u);
  assert.match(sql, /position\( '\/inbcn\/reporter\/story\/' \|\| media\.created_by::text \|\| '\/' in media\.secure_url \) = 0/u);
  assert.match(sql, /revoke all on table public\.public_media from public, anon, authenticated, service_role;/u);
  assert.match(sql, /grant select on table public\.public_media to anon, authenticated;/u);
  assert.match(sql, /revoke all on table public\.media from anon;/u);
  assert.match(sql, /drop policy "Anonymous can read media for current public stories" on public\.media;/u);
  assert.match(sql, /drop policy "Authenticated can read media for current published stories" on public\.media;/u);
  assert.doesNotMatch(view, /story_id|created_by|updated_by|deleted_by|metadata|original_filename/iu);
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
  assert.match(publicRepository, /from\("public_media"\)/u);
  assert.doesNotMatch(publicRepository, /from\("media"\)/u);
  assert.match(searchQuery, /from\("public_stories"\)/u);
  assert.doesNotMatch(searchQuery, /from\("stories"\)/u);
  assert.match(publicAlerts, /from\("public_stories"\)/u);
  assert.doesNotMatch(publicAlerts, /story:stories|from\("stories"\)/u);
  assert.match(staffRepository, /from\("stories"\)/u);
  assert.match(databaseTypes, /public_stories: \{[\s\S]+public_reporter: Json \| null/u);
  assert.match(databaseTypes, /public_media: \{[\s\S]+cloudinary_public_id: string[\s\S]+secure_url: string/u);
});

test("rollback verification exercises grants, roles, row visibility, and protected columns", () => {
  const sql = compact(verification);

  assert.match(sql, /\\set ON_ERROR_STOP on begin;/u);
  assert.match(sql, /set local role anon;/u);
  assert.match(sql, /set local role authenticated;/u);
  assert.match(sql, /has_table_privilege\('anon', 'public\.stories', 'select'\)/u);
  assert.match(sql, /policyname = 'Writers can read their own stories'/u);
  assert.match(sql, /policyname = 'Editors and admins can read all stories'/u);
  assert.match(sql, /policyname = 'Reporters can read their own stories'/u);
  assert.match(sql, /policyname = 'Writers can read media for their own stories'/u);
  assert.match(sql, /policyname = 'Editors and admins can manage all media'/u);
  assert.match(sql, /policyname = 'Reporters can read their own canonical media'/u);
  assert.match(sql, /perform created_by, approved_by from public\.stories/u);
  assert.match(sql, /perform created_by, metadata from public\.media/u);
  assert.match(sql, /legacy reporter media reached public_media/u);
  assert.match(sql, /owner-bearing reporter URL reached public_media/u);
  assert.match(sql, /public\.public_media/u);
  assert.match(sql, /public\.public_stories/u);
  assert.match(sql, /rollback;$/u);
});

test("reporter not-found content does not nest another main landmark", () => {
  assert.doesNotMatch(reporterNotFound, /<\/?main\b/gu);
});
