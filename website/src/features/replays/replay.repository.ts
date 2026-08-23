import "server-only";

import { createClient } from "../../lib/supabase/server.ts";
import { createAdminClient } from "../../lib/supabase/admin.ts";
import { assertRepositoryQuerySucceeded } from "../news/server/errors.ts";

const publicReplayFields = "id, status, title, description, duration_seconds, recording_started_at, recording_ended_at, published_at, language_code, category_slug, category_name, thumbnail_url, thumbnail_alt_text, thumbnail_width, thumbnail_height, reporter_public_slug, reporter_legal_display_name, reporter_avatar_url, reporter_public_status, reporter_home_district, reporter_bio, reporter_beats" as const;

export async function findPublicReplay(id: string, locale: string): Promise<unknown | null> {
  const result = await (await createClient())
    .from("public_replays")
    .select(publicReplayFields)
    .eq("id", id)
    .eq("language_code", locale)
    .maybeSingle();
  assertRepositoryQuerySucceeded(result.error, "load public replay");
  return result.data;
}

export async function findPublicReplayStorageKey(id: string): Promise<string | null> {
  const { data, error } = await createAdminClient().rpc(
    "get_public_replay_storage_key",
    { p_replay_id: id },
  );
  if (error) throw new Error("Private replay delivery is unavailable.");
  return typeof data === "string" ? data : null;
}
