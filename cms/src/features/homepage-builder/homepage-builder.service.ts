import "server-only";

import { randomUUID } from "node:crypto";
import type { AdminIdentity } from "@/features/admin/auth/authorization.model";
import { createClient } from "@/lib/supabase/server";
import { HomepageBuilderError, canManageHomepageBuilder, validatePositions } from "./homepage-builder.model.ts";
import { validateHeroSidebarAdjacency } from "./homepage-builder.service-core.ts";
import { createHomepageBuilderOperations } from "./homepage-builder.operations.ts";
import { toHomepageSectionInput } from "./editor/homepage-editor.validation.ts";
import type { HomepageEditorDraft } from "./editor/homepage-editor.types.ts";
import * as repository from "./homepage-builder.repository.ts";
import { getHomepageBlockDefinition } from "./homepage-builder.registry.ts";
import type { HomepageLocale } from "./homepage-builder.types.ts";
import { HOMEPAGE_LOCALES } from "./homepage-builder.types.ts";
import { parseHomepageSectionInput } from "./homepage-builder.validation.ts";
import {
  findActiveCategoryForLocale,
  findPublishedStoryForLocale,
} from "./search/homepage-picker.service.ts";

const operations = createHomepageBuilderOperations(repository);
type WithoutPersistenceFields<T> = T extends HomepageEditorDraft ? Omit<T, "id" | "blockId"> : never;
export type VisualHomepageSectionValues = WithoutPersistenceFields<HomepageEditorDraft>;

export function parseHomepageLocale(value: string): HomepageLocale { if (!HOMEPAGE_LOCALES.includes(value as HomepageLocale)) throw new HomepageBuilderError("VALIDATION", "Select English, Hindi, or Marathi."); return value as HomepageLocale; }

function authorizeVisualMutation(admin: AdminIdentity): void {
  if (!canManageHomepageBuilder(admin.role)) {
    throw new HomepageBuilderError("FORBIDDEN", "Your role cannot manage the Homepage Builder.");
  }
}

export async function getHomepageEditorWorkspaceView(admin: AdminIdentity, localeValue: string) {
  const locale = parseHomepageLocale(localeValue);
  const existing = await repository.getConfigurationByLocale(locale);
  if (!existing && !canManageHomepageBuilder(admin.role)) {
    throw new HomepageBuilderError("NOT_FOUND", "This locale has not been configured yet. Ask an editor to open it first.");
  }
  const configuration = existing ?? await repository.ensureConfiguration(locale, admin.id);
  const sections = await repository.listSections(configuration.id);
  validatePositions(sections);
  return {
    locale,
    sections,
    canManage: canManageHomepageBuilder(admin.role),
  } as const;
}

function parseVisualSection(values: VisualHomepageSectionValues, id: string, blockId: string) {
  const definition = getHomepageBlockDefinition(values.blockType);
  if (!definition) throw new HomepageBuilderError("VALIDATION", "Unsupported block type.");
  const draft = { ...values, id, blockId } as HomepageEditorDraft;
  return parseHomepageSectionInput(toHomepageSectionInput(draft, definition));
}

async function validateTargetedReference(
  locale: HomepageLocale,
  languageId: string,
  input: ReturnType<typeof parseHomepageSectionInput>,
) {
  const configuration = input.configuration as Record<string, unknown>;
  if (input.blockType === "hero-story") {
    const story = await findPublishedStoryForLocale(configuration.storyId, locale);
    if (!story) throw new HomepageBuilderError("REFERENCE_MISSING", "Select a published story from this language.");
  }
  if (input.blockType === "hero-sidebar") {
    const storyIds = Array.isArray(configuration.storyIds)
      ? configuration.storyIds.filter((storyId): storyId is string => typeof storyId === "string")
      : [];
    for (const storyId of storyIds) {
      const story = await findPublishedStoryForLocale(storyId, locale);
      if (!story) throw new HomepageBuilderError("REFERENCE_MISSING", "Select published stories from this language.");
    }
  }
  if (input.blockType === "category-section") {
    const category = await findActiveCategoryForLocale(configuration.categoryId, locale);
    if (!category) throw new HomepageBuilderError("REFERENCE_MISSING", "Select an active category from this language.");
  }
  if (input.blockType === "live-tv") {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("live_streams")
      .select("id")
      .eq("language_id", languageId)
      .neq("status", "archived")
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Unable to validate the localized Live TV reference: ${error.message}`);
    if (!data) throw new HomepageBuilderError("REFERENCE_MISSING", "Configure Live TV for this language before adding this block.");
  }
}

export async function createVisualManagedHomepageSection(
  admin: AdminIdentity,
  localeValue: string,
  values: VisualHomepageSectionValues,
) {
  authorizeVisualMutation(admin);
  const locale = parseHomepageLocale(localeValue);
  const configuration = await repository.ensureConfiguration(locale, admin.id);
  const parsed = parseVisualSection(values, "new", `${values.blockType}-${randomUUID()}`);
  await validateTargetedReference(locale, configuration.languageId, parsed);
  const sections = await repository.listSections(configuration.id);
  validateHeroSidebarAdjacency(parsed, sections, sections.length);
  return operations.create(admin, configuration.id, parsed);
}

export async function saveVisualManagedHomepageSection(
  admin: AdminIdentity,
  localeValue: string,
  id: string,
  expectedUpdatedAt: string,
  values: VisualHomepageSectionValues,
) {
  authorizeVisualMutation(admin);
  const locale = parseHomepageLocale(localeValue);
  const configuration = await repository.ensureConfiguration(locale, admin.id);
  const current = await repository.getSection(id);
  if (!current || current.homepageConfigurationId !== configuration.id) {
    throw new HomepageBuilderError("NOT_FOUND", "Homepage section not found.");
  }
  if (current.blockType !== values.blockType) {
    throw new HomepageBuilderError("VALIDATION", "A section's block type cannot be changed.");
  }
  const parsed = parseVisualSection(values, current.id, current.blockId);
  await validateTargetedReference(locale, configuration.languageId, parsed);
  const sections = await repository.listSections(configuration.id);
  validateHeroSidebarAdjacency(parsed, sections, current.position);
  return operations.updateIfCurrent(admin, current.id, configuration.id, expectedUpdatedAt, parsed);
}

export async function setVisualManagedHomepageSectionEnabled(
  admin: AdminIdentity,
  localeValue: string,
  id: string,
  expectedUpdatedAt: string,
  enabled: boolean,
) {
  authorizeVisualMutation(admin);
  const locale = parseHomepageLocale(localeValue);
  const configuration = await repository.ensureConfiguration(locale, admin.id);
  return operations.setEnabledIfCurrent(admin, id, configuration.id, expectedUpdatedAt, enabled);
}

function validateProposedHeroSidebarOrder(
  sections: readonly import("./homepage-builder.types.ts").HomepageSectionDto[],
  sectionId: string,
  targetPosition: number,
): void {
  const ordered = [...sections].toSorted((left, right) => left.position - right.position);
  const sourcePosition = ordered.findIndex((section) => section.id === sectionId);
  if (sourcePosition < 0 || targetPosition < 0 || targetPosition >= ordered.length) return;
  const [moved] = ordered.splice(sourcePosition, 1);
  if (!moved) return;
  ordered.splice(targetPosition, 0, moved);
  const proposed = ordered.map((section, position) => ({ ...section, position }));
  for (const section of proposed) {
    if (section.blockType === "hero-story" || section.blockType === "hero-sidebar") {
      validateHeroSidebarAdjacency(section, proposed, section.position);
    }
  }
}

export async function moveVisualManagedHomepageSectionTo(
  admin: AdminIdentity,
  localeValue: string,
  sectionId: string,
  targetPosition: number,
  expectedOrder: readonly string[],
) {
  authorizeVisualMutation(admin);
  const locale = parseHomepageLocale(localeValue);
  const configuration = await repository.ensureConfiguration(locale, admin.id);
  const sections = await repository.listSections(configuration.id);
  validateProposedHeroSidebarOrder(sections, sectionId, targetPosition);
  return operations.moveTo(admin, sectionId, configuration.id, targetPosition, expectedOrder);
}

function duplicateBlockId(blockId: string): string {
  const suffix = `-copy-${randomUUID()}`;
  const prefix = blockId.slice(0, 120 - suffix.length).replace(/-+$/u, "") || "section";
  return `${prefix}${suffix}`;
}

function duplicateTitle(title: string): string {
  const suffix = " Copy";
  const prefix = title.slice(0, 180 - suffix.length).trimEnd() || "Section";
  return `${prefix}${suffix}`;
}

export async function duplicateVisualManagedHomepageSection(
  admin: AdminIdentity,
  localeValue: string,
  id: string,
  expectedUpdatedAt: string,
  expectedOrder: readonly string[],
) {
  authorizeVisualMutation(admin);
  const locale = parseHomepageLocale(localeValue);
  const configuration = await repository.ensureConfiguration(locale, admin.id);
  const source = await repository.getSection(id);
  if (!source || source.homepageConfigurationId !== configuration.id) {
    throw new HomepageBuilderError("NOT_FOUND", "Homepage section not found.");
  }
  const parsed = parseHomepageSectionInput({
    blockId: source.blockId,
    title: source.title,
    blockType: source.blockType,
    renderer: source.renderer,
    container: source.container,
    width: source.width,
    enabled: source.enabled,
    startsAt: source.startsAt,
    endsAt: source.endsAt,
    configuration: source.configuration,
  });
  await validateTargetedReference(locale, configuration.languageId, parsed);
  return operations.duplicate(
    admin,
    source.id,
    configuration.id,
    expectedUpdatedAt,
    expectedOrder,
    duplicateBlockId(source.blockId),
    duplicateTitle(source.title),
  );
}

export async function deleteVisualManagedHomepageSection(
  admin: AdminIdentity,
  localeValue: string,
  id: string,
  expectedUpdatedAt: string,
  expectedOrder: readonly string[],
) {
  authorizeVisualMutation(admin);
  const locale = parseHomepageLocale(localeValue);
  const configuration = await repository.ensureConfiguration(locale, admin.id);
  const sections = await operations.deleteIfCurrent(
    admin, id, configuration.id, expectedUpdatedAt, expectedOrder,
  );
  return { id, sections } as const;
}
