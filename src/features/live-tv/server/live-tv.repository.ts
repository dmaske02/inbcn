import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import {
  createLiveTvRepositoryCore,
  type LiveStreamInsert,
  type LiveStreamUpdate,
} from "./live-tv.repository-core.ts";
import type { LiveStreamScheduleWrite } from "./live-tv.types.ts";

const COLUMNS = "id,language_id,internal_name,title,description,provider,provider_stream_id,stream_url,external_watch_url,poster_url,poster_alt_text,status,autoplay,muted,starts_at,ends_at,offline_message,related_category_id,related_story_id,seo_title,seo_description,social_image_url,created_by,updated_by,created_at,updated_at" as const;

type SupabaseError = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
};

type QueryContext = {
  table: string;
  select: string;
  filters?: Record<string, unknown>;
  authenticatedRole?: string | null;
};

function throwSupabaseError(
  operation: string,
  error: SupabaseError,
  context: QueryContext,
): never {
  console.error("[live-tv:supabase-error] operation", operation);
  console.error("[live-tv:supabase-error] table", context.table);
  console.error("[live-tv:supabase-error] select", context.select);
  console.error("[live-tv:supabase-error] filters", context.filters ?? {});
  console.error(
    "[live-tv:supabase-error] authenticatedRole",
    context.authenticatedRole ?? null,
  );
  console.dir(error, { depth: null });
  console.error("[live-tv:supabase-error] code", error.code);
  console.error("[live-tv:supabase-error] message", error.message);
  console.error("[live-tv:supabase-error] details", error.details);
  console.error("[live-tv:supabase-error] hint", error.hint);
  console.error(
    "[live-tv:supabase-error] json",
    JSON.stringify(error, null, 2),
  );
  throw error;
}

async function queryContext(client: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await client.auth.getUser();
  return {
    authenticatedRole:
      (data.user?.app_metadata?.role as string | undefined) ?? null,
  };
}

async function repository() {
  const client = await createClient();
  const auth = await queryContext(client);
  return createLiveTvRepositoryCore({
    async findById(id) {
      const { data, error } = await client
        .from("live_streams")
        .select(COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (error) throwSupabaseError("live_streams.findById", error, { table: "live_streams", select: COLUMNS, filters: { id }, ...auth });
      return data;
    },
    async findByLanguage(languageCode) {
      const { data, error } = await client
        .from("live_streams")
        .select(
          `${COLUMNS},language:languages!live_streams_language_id_fkey!inner(code)`,
        )
        .eq("language.code", languageCode)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throwSupabaseError("live_streams.findByLanguage", error, { table: "live_streams", select: `${COLUMNS},language relationship`, filters: { "language.code": languageCode }, ...auth });
      return data;
    },
    async findSchedule(id) {
      const { data, error } = await client
        .from("live_streams")
        .select("id,status,starts_at,ends_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throwSupabaseError("live_streams.findSchedule", error, { table: "live_streams", select: "id,status,starts_at,ends_at", filters: { id }, ...auth });
      return data
        ? {
            id: data.id,
            status: data.status,
            startsAt: data.starts_at,
            endsAt: data.ends_at,
          }
        : null;
    },
    async insert(value) {
      const { data, error } = await client
        .from("live_streams")
        .insert(value)
        .select(COLUMNS)
        .single();
      if (error) throwSupabaseError("live_streams.insert", error, { table: "live_streams", select: COLUMNS, filters: { operation: "insert" }, ...auth });
      return data;
    },
    async update(id, value) {
      const { data, error } = await client
        .from("live_streams")
        .update(value)
        .eq("id", id)
        .select(COLUMNS)
        .single();
      if (error) throwSupabaseError("live_streams.update", error, { table: "live_streams", select: COLUMNS, filters: { id }, ...auth });
      return data;
    },
    async remove(id) {
      const { error } = await client.from("live_streams").delete().eq("id", id);
      if (error) throwSupabaseError("live_streams.delete", error, { table: "live_streams", select: "*", filters: { id }, ...auth });
    },
  });
}

export async function getLiveChannel(id: string) {
  return (await repository()).getLiveChannel(id);
}

export async function getLiveChannelByLanguage(languageCode: string) {
  return (await repository()).getLiveChannelByLanguage(languageCode);
}

export async function getPublicLiveChannelsByLanguage(languageCode: string) {
  const client = await createClient();
  const auth = await queryContext(client);
  const { data, error } = await client
    .from("live_streams")
    .select(
      `${COLUMNS},language:languages!live_streams_language_id_fkey!inner(code)`,
    )
    .eq("language.code", languageCode)
    .in("status", ["live", "scheduled", "offline"])
    .order("starts_at", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false });
  if (error) throwSupabaseError("live_streams.publicByLanguage", error, { table: "live_streams", select: `${COLUMNS},language relationship`, filters: { "language.code": languageCode, status: ["live", "scheduled", "offline"] }, ...auth });
  return data;
}

export async function getCmsLiveChannels() {
  const client = await createClient();
  const auth = await queryContext(client);
  const { error: tableError } = await client
    .from("live_streams")
    .select("id")
    .limit(0);
  if (tableError) {
    throwSupabaseError("live_streams.tableExists", tableError, {
      table: "live_streams",
      select: "id",
      filters: { limit: 0 },
      ...auth,
    });
  }
  const { data, error } = await client
    .from("live_streams")
    .select(`${COLUMNS},language:languages!live_streams_language_id_fkey(code,name)`)
    .order("updated_at", { ascending: false });
  if (error) throwSupabaseError("live_streams.cmsList", error, { table: "live_streams", select: `${COLUMNS},language relationship (code,name)`, filters: { order: "updated_at desc" }, ...auth });
  return data;
}

export async function getLiveTvCmsReferences() {
  const client = await createClient();
  const auth = await queryContext(client);
  const [languages, categories, stories] = await Promise.all([
    client.from("languages").select("id,code,name").eq("is_active", true).order("name"),
    client.from("categories").select("id,language_id,name").eq("is_active", true).order("name"),
    client.from("stories").select("id,language_id,title").in("status", ["approved", "scheduled", "published"]).order("updated_at", { ascending: false }).limit(100),
  ]);
  if (languages.error) throwSupabaseError("languages.cmsReferences", languages.error, { table: "languages", select: "id,code,name", filters: { is_active: true }, ...auth });
  if (categories.error) throwSupabaseError("categories.cmsReferences", categories.error, { table: "categories", select: "id,language_id,name", filters: { is_active: true }, ...auth });
  if (stories.error) throwSupabaseError("stories.cmsReferences", stories.error, { table: "stories", select: "id,language_id,title", filters: { status: ["approved", "scheduled", "published"] }, ...auth });
  return {
    languages: languages.data,
    categories: categories.data.map((item) => ({ id: item.id, languageId: item.language_id, name: item.name })),
    stories: stories.data.map((item) => ({ id: item.id, languageId: item.language_id, title: item.title })),
  } as const;
}

export async function getLiveSchedule(id: string) {
  return (await repository()).getLiveSchedule(id);
}

export async function createLiveChannel(input: LiveStreamInsert) {
  return (await repository()).createLiveChannel(input);
}

export async function updateLiveChannel(id: string, input: LiveStreamUpdate) {
  return (await repository()).updateLiveChannel(id, input);
}

export async function deleteLiveChannel(id: string) {
  return (await repository()).deleteLiveChannel(id);
}

export async function createSchedule(
  id: string,
  input: LiveStreamScheduleWrite,
) {
  return (await repository()).createSchedule(id, input);
}

export async function updateSchedule(
  id: string,
  input: LiveStreamScheduleWrite,
) {
  return (await repository()).updateSchedule(id, input);
}

export async function deleteSchedule(
  id: string,
  input: Pick<LiveStreamScheduleWrite, "status">,
) {
  return (await repository()).deleteSchedule(id, input);
}

export type LiveStreamRow =
  Database["public"]["Tables"]["live_streams"]["Row"];
