import type { AdminIdentity } from "@/features/admin/auth/authorization.model";
import type { Database, Json } from "@/lib/supabase/types";
import { canManageHomepageBuilder, HomepageBuilderError, validatePositions } from "./homepage-builder.model.ts";
import type { HomepageSectionDto } from "./homepage-builder.types.ts";

type Repository = Readonly<{
  listSections(configurationId: string): Promise<HomepageSectionDto[]>;
  getSection(id: string): Promise<HomepageSectionDto | null>;
  createSection(values: Database["public"]["Tables"]["homepage_sections"]["Insert"]): Promise<HomepageSectionDto>;
  updateSection(id: string, values: Database["public"]["Tables"]["homepage_sections"]["Update"]): Promise<HomepageSectionDto>;
  updateSectionIfCurrent(
    id: string,
    expectedUpdatedAt: string,
    values: Database["public"]["Tables"]["homepage_sections"]["Update"],
  ): Promise<HomepageSectionDto | null>;
  deleteSection(id: string): Promise<void>;
  moveSectionUp(id: string): Promise<void>;
  moveSectionDown(id: string): Promise<void>;
  moveSectionTo(id: string, targetPosition: number, configurationId: string): Promise<HomepageSectionDto[]>;
  duplicateSectionAfter(
    id: string,
    expectedUpdatedAt: string,
    expectedOrder: readonly string[],
    blockId: string,
    title: string,
    configurationId: string,
  ): Promise<Readonly<{ section: HomepageSectionDto; sections: HomepageSectionDto[] }> | null>;
  deleteSectionIfCurrent(
    id: string,
    expectedUpdatedAt: string,
    expectedOrder: readonly string[],
    configurationId: string,
  ): Promise<HomepageSectionDto[] | null>;
}>;

export class HomepageMutationConflictError extends Error {
  readonly code = "CONFLICT" as const;

  constructor() {
    super("Changed elsewhere—reload required.");
    this.name = "HomepageMutationConflictError";
  }
}

function authorize(admin: AdminIdentity) { if (!canManageHomepageBuilder(admin.role)) throw new HomepageBuilderError("FORBIDDEN", "Your role cannot manage the Homepage Builder."); }
function ownedSection(current: HomepageSectionDto | null, configurationId: string): HomepageSectionDto {
  if (!current || current.homepageConfigurationId !== configurationId) {
    throw new HomepageBuilderError("NOT_FOUND", "Homepage section not found.");
  }
  return current;
}

async function updateIfCurrent(
  repository: Repository,
  admin: AdminIdentity,
  id: string,
  configurationId: string,
  expectedUpdatedAt: string,
  values: Database["public"]["Tables"]["homepage_sections"]["Update"],
) {
  authorize(admin);
  const current = ownedSection(await repository.getSection(id), configurationId);
  if (current.updatedAt !== expectedUpdatedAt) throw new HomepageMutationConflictError();
  const updated = await repository.updateSectionIfCurrent(id, expectedUpdatedAt, {
    ...values,
    updated_by: admin.id,
  });
  if (!updated) throw new HomepageMutationConflictError();
  return updated;
}
function write(input: { blockId: string; title: string; blockType: string; renderer: string; container: string; width: string; enabled: boolean; startsAt: string | null; endsAt: string | null; configuration: unknown }) {
  return { block_id: input.blockId, title: input.title, block_type: input.blockType, renderer: input.renderer, container: input.container, width: input.width, enabled: input.enabled, starts_at: input.startsAt, ends_at: input.endsAt, configuration: input.configuration as Json };
}

async function currentStructuralState(
  repository: Repository,
  admin: AdminIdentity,
  id: string,
  configurationId: string,
  expectedUpdatedAt: string,
  expectedOrder: readonly string[],
) {
  authorize(admin);
  const sections = await repository.listSections(configurationId);
  validatePositions(sections);
  const section = sections.find((item) => item.id === id);
  if (!section) throw new HomepageBuilderError("NOT_FOUND", "Homepage section not found.");
  if (section.updatedAt !== expectedUpdatedAt) throw new HomepageMutationConflictError();
  const currentOrder = sections.map((item) => item.id);
  if (
    expectedOrder.length !== currentOrder.length
    || expectedOrder.some((sectionId, index) => sectionId !== currentOrder[index])
  ) throw new HomepageMutationConflictError();
  return { section, sections } as const;
}

function validConfirmedSections(
  sections: readonly HomepageSectionDto[],
  configurationId: string,
  expectedIds: readonly string[],
) {
  validatePositions(sections);
  const ids = sections.map((item) => item.id);
  return sections.every((item) => item.homepageConfigurationId === configurationId)
    && ids.length === expectedIds.length
    && new Set(ids).size === ids.length
    && expectedIds.every((id) => ids.includes(id));
}

export function createHomepageBuilderOperations(repository: Repository) {
  return {
    async create(admin: AdminIdentity, configurationId: string, input: Parameters<typeof write>[0]) { authorize(admin); const rows = await repository.listSections(configurationId); return repository.createSection({ homepage_configuration_id: configurationId, position: rows.length, ...write(input), created_by: admin.id, updated_by: admin.id }); },
    async update(admin: AdminIdentity, id: string, configurationId: string, input: Parameters<typeof write>[0]) { authorize(admin); const current = await repository.getSection(id); if (!current || current.homepageConfigurationId !== configurationId) throw new HomepageBuilderError("NOT_FOUND", "Homepage section not found."); return repository.updateSection(id, { ...write(input), updated_by: admin.id }); },
    async remove(admin: AdminIdentity, id: string, configurationId: string) { authorize(admin); const current = await repository.getSection(id); if (!current || current.homepageConfigurationId !== configurationId) throw new HomepageBuilderError("NOT_FOUND", "Homepage section not found."); await repository.deleteSection(id); },
    async move(admin: AdminIdentity, id: string, configurationId: string, direction: "up" | "down") { authorize(admin); const current = await repository.getSection(id); if (!current || current.homepageConfigurationId !== configurationId) throw new HomepageBuilderError("NOT_FOUND", "Homepage section not found."); await (direction === "up" ? repository.moveSectionUp(id) : repository.moveSectionDown(id)); },
    async toggle(admin: AdminIdentity, id: string, configurationId: string) { authorize(admin); const current = await repository.getSection(id); if (!current || current.homepageConfigurationId !== configurationId) throw new HomepageBuilderError("NOT_FOUND", "Homepage section not found."); return repository.updateSection(id, { enabled: !current.enabled, updated_by: admin.id }); },
    async updateIfCurrent(admin: AdminIdentity, id: string, configurationId: string, expectedUpdatedAt: string, input: Parameters<typeof write>[0]) {
      return updateIfCurrent(repository, admin, id, configurationId, expectedUpdatedAt, write(input));
    },
    async setEnabledIfCurrent(admin: AdminIdentity, id: string, configurationId: string, expectedUpdatedAt: string, enabled: boolean) {
      return updateIfCurrent(repository, admin, id, configurationId, expectedUpdatedAt, { enabled });
    },
    async moveTo(
      admin: AdminIdentity,
      id: string,
      configurationId: string,
      targetPosition: number,
      expectedOrder: readonly string[],
    ) {
      authorize(admin);
      const current = await repository.listSections(configurationId);
      validatePositions(current);
      const currentIds = current.map((section) => section.id);
      const currentIndex = currentIds.indexOf(id);
      if (currentIndex < 0) throw new HomepageBuilderError("NOT_FOUND", "Homepage section not found.");
      if (!Number.isInteger(targetPosition) || targetPosition < 0 || targetPosition >= current.length) {
        throw new HomepageBuilderError("ORDERING", "Choose a valid section position.");
      }
      if (
        expectedOrder.length !== currentIds.length
        || expectedOrder.some((sectionId, index) => sectionId !== currentIds[index])
      ) {
        throw new HomepageMutationConflictError();
      }
      if (currentIndex === targetPosition) return current;
      const confirmed = await repository.moveSectionTo(id, targetPosition, configurationId);
      validatePositions(confirmed);
      if (
        confirmed.length !== current.length
        || confirmed.some((section) => section.homepageConfigurationId !== configurationId)
        || new Set(confirmed.map((section) => section.id)).size !== current.length
        || currentIds.some((sectionId) => !confirmed.some((section) => section.id === sectionId))
      ) {
        throw new HomepageBuilderError("ORDERING", "The server returned an invalid section order.");
      }
      return confirmed;
    },
    async duplicate(
      admin: AdminIdentity,
      id: string,
      configurationId: string,
      expectedUpdatedAt: string,
      expectedOrder: readonly string[],
      blockId: string,
      title: string,
    ) {
      const current = await currentStructuralState(
        repository, admin, id, configurationId, expectedUpdatedAt, expectedOrder,
      );
      const result = await repository.duplicateSectionAfter(
        id, expectedUpdatedAt, expectedOrder, blockId, title, configurationId,
      );
      if (!result) throw new HomepageMutationConflictError();
      const expectedIds = [...current.sections.map((item) => item.id), result.section.id];
      if (!validConfirmedSections(result.sections, configurationId, expectedIds)) {
        throw new HomepageBuilderError("ORDERING", "The server returned an invalid duplicated section order.");
      }
      if (result.section.position !== current.section.position + 1) {
        throw new HomepageBuilderError("ORDERING", "The duplicated section was not inserted after its source.");
      }
      return result;
    },
    async deleteIfCurrent(
      admin: AdminIdentity,
      id: string,
      configurationId: string,
      expectedUpdatedAt: string,
      expectedOrder: readonly string[],
    ) {
      const current = await currentStructuralState(
        repository, admin, id, configurationId, expectedUpdatedAt, expectedOrder,
      );
      const sections = await repository.deleteSectionIfCurrent(
        id, expectedUpdatedAt, expectedOrder, configurationId,
      );
      if (!sections) throw new HomepageMutationConflictError();
      const expectedIds = current.sections.filter((item) => item.id !== id).map((item) => item.id);
      if (!validConfirmedSections(sections, configurationId, expectedIds)) {
        throw new HomepageBuilderError("ORDERING", "The server returned an invalid section order after deletion.");
      }
      return sections;
    },
  };
}
