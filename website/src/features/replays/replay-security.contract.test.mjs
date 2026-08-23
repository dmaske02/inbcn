import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260822164000_public_reporter_replays.sql",
  import.meta.url,
);

test("SQL exposes one current safe projection and keeps private replay tables closed", async () => {
  const compact = (await readFile(migrationUrl, "utf8")).replace(/\s+/gu, " ");
  const view = compact.match(/create view public\.public_replays[\s\S]*?;/u)?.[0] ?? "";
  const projection = view.match(/ as select ([\s\S]*?) from public\.public_live_replays/u)?.[1] ?? "";

  assert.match(view, /with \(security_barrier = true\)/u);
  assert.match(view, /live_recordings\.recording_status = 'completed'/u);
  assert.match(view, /live_recordings\.replay_status = 'published'/u);
  assert.match(view, /not live_recordings\.legal_hold/u);
  assert.match(view, /clock_timestamp\(\)/u);
  assert.doesNotMatch(projection, /(live_request_id|profile_id|account_id|storage_key|egress_id|provider|webhook|reason|actor|location|signed_url)/u);
  assert.match(compact, /revoke all on table public\.public_replays from public, anon, authenticated, service_role;/u);
  assert.match(compact, /grant select on table public\.public_replays to anon, authenticated;/u);
  assert.doesNotMatch(compact, /grant select on table public\.(?:live_recordings|public_live_replays|reporter_live_requests) to (?:anon|authenticated)/u);
});

test("private-key lookup is canonical, empty-search-path, and service-role only", async () => {
  const compact = (await readFile(migrationUrl, "utf8")).replace(/\s+/gu, " ");
  const rpc = compact.match(/create function public\.get_public_replay_storage_key[\s\S]*?\$\$;/u)?.[0] ?? "";

  assert.match(rpc, /security definer set search_path = ''/u);
  assert.match(rpc, /auth\.role\(\) is distinct from 'service_role'/u);
  assert.match(rpc, /exists \( select 1 from public\.public_replays where public_replays\.id = p_replay_id \)/u);
  assert.match(rpc, /storage_key = 'reporter-live\/' \|\| live_recordings\.live_request_id::text \|\| '\/' \|\| live_recordings\.id::text \|\| '\.mp4'/u);
  assert.match(compact, /revoke all on function public\.get_public_replay_storage_key\(uuid\) from public, anon, authenticated, service_role;/u);
  assert.match(compact, /grant execute on function public\.get_public_replay_storage_key\(uuid\) to service_role;/u);
  assert.doesNotMatch(compact, /grant execute on function public\.get_public_replay_storage_key\(uuid\) to (?:anon|authenticated)/u);
});
