import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database, TableRow } from "@/lib/supabase/types";
import { toHomepageConfigurationDto, toHomepageSectionDto } from "./homepage-builder.dto.ts";
import type { HomepageLocale, HomepageSectionDto } from "./homepage-builder.types.ts";

const SECTION_COLUMNS = "id, homepage_configuration_id, block_id, title, block_type, renderer, position, container, width, enabled, starts_at, ends_at, configuration, created_by, updated_by, created_at, updated_at" as const;

function fail(error: { message: string } | null, action: string): void {
  if (error) throw new Error(`Unable to ${action}: ${error.message}`);
}

export async function getConfigurationByLocale(locale: HomepageLocale) {
  const supabase = await createClient();
  const { data: language, error: languageError } = await supabase.from("languages").select("id, code").eq("code", locale).eq("is_active", true).maybeSingle();
  fail(languageError, "load the homepage language");
  if (!language) return null;
  const { data, error } = await supabase.from("homepage_configurations").select("id, language_id, created_by, updated_by, created_at, updated_at").eq("language_id", language.id).maybeSingle();
  fail(error, "load the homepage configuration");
  return data ? toHomepageConfigurationDto(data, locale) : null;
}

export async function ensureConfiguration(locale: HomepageLocale, actorId: string) {
  const existing = await getConfigurationByLocale(locale);
  if (existing) return existing;
  const supabase = await createClient();
  const { data: language, error: languageError } = await supabase.from("languages").select("id").eq("code", locale).eq("is_active", true).single();
  fail(languageError, "load the homepage language");
  if (!language) throw new Error("Unable to load the homepage language.");
  const { data, error } = await supabase.from("homepage_configurations").insert({ language_id: language.id, created_by: actorId, updated_by: actorId }).select("id, language_id, created_by, updated_by, created_at, updated_at").single();
  fail(error, "create the homepage configuration");
  if (!data) throw new Error("Unable to create the homepage configuration.");
  return toHomepageConfigurationDto(data, locale);
}

export async function listSections(configurationId: string): Promise<HomepageSectionDto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("homepage_sections").select(SECTION_COLUMNS).eq("homepage_configuration_id", configurationId).order("position", { ascending: true });
  fail(error, "load homepage sections");
  return (data ?? []).map(toHomepageSectionDto);
}

export async function getSection(id: string): Promise<HomepageSectionDto | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("homepage_sections").select(SECTION_COLUMNS).eq("id", id).maybeSingle();
  fail(error, "load the homepage section");
  return data ? toHomepageSectionDto(data) : null;
}

export async function createSection(values: Database["public"]["Tables"]["homepage_sections"]["Insert"]) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("homepage_sections").insert(values).select(SECTION_COLUMNS).single();
  fail(error, "create the homepage section");
  if (!data) throw new Error("Unable to create the homepage section.");
  return toHomepageSectionDto(data);
}

export async function updateSection(id: string, values: Database["public"]["Tables"]["homepage_sections"]["Update"]) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("homepage_sections").update(values).eq("id", id).select(SECTION_COLUMNS).single();
  fail(error, "update the homepage section");
  if (!data) throw new Error("Unable to update the homepage section.");
  return toHomepageSectionDto(data);
}

export async function updateSectionIfCurrent(
  id: string,
  expectedUpdatedAt: string,
  values: Database["public"]["Tables"]["homepage_sections"]["Update"],
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("homepage_sections")
    .update(values)
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt)
    .select(SECTION_COLUMNS)
    .maybeSingle();
  fail(error, "conditionally update the homepage section");
  return data ? toHomepageSectionDto(data) : null;
}

export async function deleteSection(id: string) { const supabase = await createClient(); const { error } = await supabase.rpc("delete_homepage_section", { section_id: id }); fail(error, "delete the homepage section"); }
export async function moveSectionUp(id: string) { const supabase = await createClient(); const { error } = await supabase.rpc("move_homepage_section", { section_id: id, direction: "up" }); fail(error, "move the homepage section"); }
export async function moveSectionDown(id: string) { const supabase = await createClient(); const { error } = await supabase.rpc("move_homepage_section", { section_id: id, direction: "down" }); fail(error, "move the homepage section"); }
export async function moveSectionTo(id: string, targetPosition: number, configurationId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("move_homepage_section_to", { section_id: id, target_position: targetPosition });
  fail(error, "move the homepage section to its target position");
  return listSections(configurationId);
}

export async function duplicateSectionAfter(
  id: string,
  expectedUpdatedAt: string,
  expectedOrder: readonly string[],
  blockId: string,
  title: string,
  configurationId: string,
) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("duplicate_homepage_section_after", {
    source_section_id: id,
    expected_updated_at: expectedUpdatedAt,
    expected_order: [...expectedOrder],
    new_block_id: blockId,
    new_title: title,
  });
  fail(error, "duplicate the homepage section");
  if (!data) return null;
  const section = await getSection(data);
  if (!section) throw new Error("Unable to load the duplicated homepage section.");
  return { section, sections: await listSections(configurationId) } as const;
}

export async function deleteSectionIfCurrent(
  id: string,
  expectedUpdatedAt: string,
  expectedOrder: readonly string[],
  configurationId: string,
) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_homepage_section_if_current", {
    section_id: id,
    expected_updated_at: expectedUpdatedAt,
    expected_order: [...expectedOrder],
  });
  fail(error, "delete the current homepage section");
  return data ? listSections(configurationId) : null;
}

export type HomepageConfigurationRow = TableRow<"homepage_configurations">;

export async function getPublicHomepageConfiguration(locale: HomepageLocale) {
  const supabase = await createClient();
  const { data: language, error: languageError } = await supabase.from("languages").select("id").eq("code", locale).eq("is_active", true).maybeSingle();
  fail(languageError, "load the public homepage language");
  if (!language) return null;
  const { data: configuration, error: configurationError } = await supabase.from("homepage_configurations").select("id, language_id, created_by, updated_by, created_at, updated_at").eq("language_id", language.id).maybeSingle();
  fail(configurationError, "load the public homepage configuration");
  if (!configuration) return null;
  const { data: sections, error: sectionsError } = await supabase.from("homepage_sections").select(SECTION_COLUMNS).eq("homepage_configuration_id", configuration.id).order("position", { ascending: true });
  fail(sectionsError, "load public homepage sections");
  return { configuration: toHomepageConfigurationDto(configuration, locale), sections: (sections ?? []).map(toHomepageSectionDto) } as const;
}
