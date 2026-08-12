import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../../../../supabase/migrations/20260812090000_media_library_phase_5_foundation.sql",
  import.meta.url,
);

test("Phase 5 extends public.media additively with canonical metadata", async () => {
  const sql = await readFile(migrationPath, "utf8");

  for (const column of [
    "title text",
    "original_filename text",
    "credit text",
    "updated_by uuid",
    "deleted_at timestamptz",
    "deleted_by uuid",
  ]) {
    assert.match(sql, new RegExp(`add column if not exists ${column}`, "u"));
  }

  assert.match(sql, /media_updated_by_fkey[\s\S]*foreign key \(updated_by\)[\s\S]*references public\.profiles \(id\)[\s\S]*on delete set null/u);
  assert.match(sql, /media_deleted_by_fkey[\s\S]*foreign key \(deleted_by\)[\s\S]*references public\.profiles \(id\)[\s\S]*on delete set null/u);
  assert.match(sql, /media_title_check[\s\S]*length\(btrim\(title\)\) > 0/u);
  assert.match(sql, /media_deletion_audit_check[\s\S]*deleted_at is null and deleted_by is null[\s\S]*deleted_at is not null and deleted_by is not null/u);
  assert.match(sql, /update public\.media[\s\S]*metadata\s*->>\s*'title'[\s\S]*metadata\s*->>\s*'originalFilename'[\s\S]*metadata\s*->>\s*'credit'/u);
  assert.match(sql, /create index if not exists media_active_type_created_id_idx[\s\S]*on public\.media \(media_type, deleted_at, created_at desc, id desc\)[\s\S]*where deleted_at is null/u);
});

test("Phase 5 preserves the existing canonical media system", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.doesNotMatch(sql, /create\s+table\s+(?:public\.)?media_assets/iu);
  assert.doesNotMatch(sql, /drop\s+column/iu);
  assert.doesNotMatch(sql, /rename\s+column/iu);
  for (const column of ["cloudinary_public_id", "secure_url", "story_id", "sort_order"]) {
    assert.doesNotMatch(sql, new RegExp(`(?:drop|rename)\\s+column\\s+${column}`, "iu"));
  }
});
