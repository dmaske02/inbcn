import type { Database } from "@/lib/supabase/types";
import type { HomepageConfigurationDto, HomepageLocale, HomepageSectionDto } from "./homepage-builder.types.ts";

type Row = Database["public"]["Tables"]["homepage_sections"]["Row"];
export function toHomepageSectionDto(row: Row): HomepageSectionDto {
  return { id: row.id, homepageConfigurationId: row.homepage_configuration_id, blockId: row.block_id, title: row.title, blockType: row.block_type, renderer: row.renderer, position: row.position, container: row.container as HomepageSectionDto["container"], width: row.width as HomepageSectionDto["width"], enabled: row.enabled, startsAt: row.starts_at, endsAt: row.ends_at, configuration: row.configuration, createdBy: row.created_by, updatedBy: row.updated_by, createdAt: row.created_at, updatedAt: row.updated_at };
}

export function toHomepageConfigurationDto(row: Database["public"]["Tables"]["homepage_configurations"]["Row"], locale: HomepageLocale): HomepageConfigurationDto {
  return { id: row.id, languageId: row.language_id, locale, createdBy: row.created_by, updatedBy: row.updated_by, createdAt: row.created_at, updatedAt: row.updated_at };
}
