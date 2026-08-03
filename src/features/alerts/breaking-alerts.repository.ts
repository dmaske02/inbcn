import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/config/env";
import type { Database, TableRow } from "@/lib/supabase/types";

export type BreakingAlertRow = TableRow<"breaking_alerts">;
export type BreakingAlertInsert = Database["public"]["Tables"]["breaking_alerts"]["Insert"];
export type BreakingAlertUpdate = Database["public"]["Tables"]["breaking_alerts"]["Update"];

const COLUMNS = "id,title,message,type,placement,status,is_active,priority,target_scope,language_id,category_id,story_id,background_color,text_color,dismissible,start_at,end_at,created_by,created_at,updated_at" as const;

export async function getActiveBreakingAlerts(languageCode: string) {
  const { supabaseUrl, supabaseAnonKey } = env.public;
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Public Supabase configuration is missing.");
  const client = createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date().toISOString();
  const { data, error } = await client.from("breaking_alerts")
    .select(`${COLUMNS},language:languages!breaking_alerts_language_id_fkey!inner(code),category:categories!breaking_alerts_category_id_fkey(slug),story:stories!breaking_alerts_story_id_fkey(slug)`)
    .eq("status", "active").eq("is_active", true).lte("start_at", now)
    .or(`end_at.is.null,end_at.gt.${now}`).eq("language.code", languageCode)
    .order("priority").order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export type AlertListQuery = Readonly<{ page: number; pageSize: number; search?: string; status?: string; type?: string; languageId?: string; sort?: string }>;
export async function getBreakingAlertPage(query: AlertListQuery) {
  const client = await createClient();
  const from = (query.page - 1) * query.pageSize;
  let request = client.from("breaking_alerts").select(COLUMNS, { count: "exact" });
  if (query.search) request = request.or(`title.ilike.%${query.search.replace(/[,()%]/gu, " ")}%,message.ilike.%${query.search.replace(/[,()%]/gu, " ")}%`);
  if (query.status) request = request.eq("status", query.status);
  if (query.type) request = request.eq("type", query.type);
  if (query.languageId) request = request.eq("language_id", query.languageId);
  if (query.sort === "priority") request = request.order("priority");
  else if (query.sort === "start_asc") request = request.order("start_at");
  else request = request.order("updated_at", { ascending: false });
  const { data, error, count } = await request.range(from, from + query.pageSize - 1);
  if (error) throw error;
  return { items: data, total: count ?? 0 };
}

export async function getBreakingAlertById(id: string) {
  const { data, error } = await (await createClient()).from("breaking_alerts").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error; return data;
}

export async function getBreakingAlertReferences() {
  const client = await createClient();
  const [languages, categories, stories] = await Promise.all([
    client.from("languages").select("id,code,name").eq("is_active", true).order("name"),
    client.from("categories").select("id,language_id,name,slug").eq("is_active", true).order("name"),
    client.from("stories").select("id,language_id,title,slug").eq("status", "published").order("title").limit(500),
  ]);
  if (languages.error || categories.error || stories.error) throw languages.error ?? categories.error ?? stories.error;
  return { languages: languages.data, categories: categories.data, stories: stories.data };
}

export async function insertBreakingAlert(input: BreakingAlertInsert) {
  const { data, error } = await (await createClient()).from("breaking_alerts").insert(input).select(COLUMNS).single();
  if (error) throw error; return data;
}
export async function updateBreakingAlert(id: string, input: BreakingAlertUpdate) {
  const { data, error } = await (await createClient()).from("breaking_alerts").update(input).eq("id", id).select(COLUMNS).single();
  if (error) throw error; return data;
}
export async function deleteBreakingAlert(id: string) {
  const { error } = await (await createClient()).from("breaking_alerts").delete().eq("id", id);
  if (error) throw error;
}

export async function alertTargetMatchesLanguage(input: Readonly<{ scope: string; languageId: string; categoryId: string | null; storyId: string | null }>) {
  if (input.scope === "global") return true;
  const client = await createClient();
  if (input.scope === "category" && input.categoryId) {
    const { count, error } = await client.from("categories").select("id", { count: "exact", head: true }).eq("id", input.categoryId).eq("language_id", input.languageId);
    if (error) throw error; return (count ?? 0) === 1;
  }
  if (input.scope === "story" && input.storyId) {
    const { count, error } = await client.from("stories").select("id", { count: "exact", head: true }).eq("id", input.storyId).eq("language_id", input.languageId).eq("status", "published");
    if (error) throw error; return (count ?? 0) === 1;
  }
  return false;
}

export async function getAlertStatusCounts() {
  const client = await createClient();
  const now = new Date().toISOString();
  const [active, upcoming, expired] = await Promise.all([
    client.from("breaking_alerts").select("id", { count: "exact", head: true }).eq("status", "active").eq("is_active", true).lte("start_at", now).or(`end_at.is.null,end_at.gt.${now}`),
    client.from("breaking_alerts").select("id", { count: "exact", head: true }).gt("start_at", now).neq("status", "archived"),
    client.from("breaking_alerts").select("id", { count: "exact", head: true }).lt("end_at", now),
  ]);
  if (active.error || upcoming.error || expired.error) throw active.error ?? upcoming.error ?? expired.error;
  return { active: active.count ?? 0, upcoming: upcoming.count ?? 0, expired: expired.count ?? 0 };
}
