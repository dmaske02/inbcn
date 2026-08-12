import { HomepageBuilderError } from "./homepage-builder.model.ts";
import type { HomepageReferenceData } from "./homepage-builder.types.ts";
import type { HomepageSectionDto } from "./homepage-builder.types.ts";
import type { parseHomepageSectionInput } from "./homepage-builder.validation.ts";

export function validateHomepageReferences(input: ReturnType<typeof parseHomepageSectionInput>, data: HomepageReferenceData, languageId: string): void {
  const config = input.configuration as Record<string, unknown>;
  if (input.blockType === "hero-story" && !data.stories.some((item) => item.id === config.storyId && item.languageId === languageId)) throw new HomepageBuilderError("REFERENCE_MISSING", "Select a published story from this language.");
  if (input.blockType === "category-section" && !data.categories.some((item) => item.id === config.categoryId && item.languageId === languageId)) throw new HomepageBuilderError("REFERENCE_MISSING", "Select an active category from this language.");
  if (input.blockType === "live-tv" && data.liveTv?.languageId !== languageId) throw new HomepageBuilderError("REFERENCE_MISSING", "Configure Live TV for this language before adding this block.");
}

export function validateHeroSidebarAdjacency(
  input: Readonly<{ blockType: string; configuration: unknown }>,
  sections: readonly HomepageSectionDto[],
  position: number,
): void {
  const configuration = input.configuration && typeof input.configuration === "object" && !Array.isArray(input.configuration)
    ? input.configuration as Record<string, unknown>
    : {};

  if (input.blockType === "hero-sidebar") {
    const previous = sections.find((section) => section.position === position - 1);
    if (previous?.blockType !== "hero-story") return;
    const heroConfiguration = previous.configuration && typeof previous.configuration === "object" && !Array.isArray(previous.configuration)
      ? previous.configuration as Record<string, unknown>
      : {};
    const storyIds = Array.isArray(configuration.storyIds) ? configuration.storyIds : [];
    if (typeof heroConfiguration.storyId === "string" && storyIds.includes(heroConfiguration.storyId)) {
      throw new HomepageBuilderError("VALIDATION", "The Hero Story cannot also appear in the adjacent Hero Sidebar.");
    }
  }

  if (input.blockType === "hero-story") {
    const next = sections.find((section) => section.position === position + 1);
    if (next?.blockType !== "hero-sidebar") return;
    const sidebarConfiguration = next.configuration && typeof next.configuration === "object" && !Array.isArray(next.configuration)
      ? next.configuration as Record<string, unknown>
      : {};
    const storyIds = Array.isArray(sidebarConfiguration.storyIds) ? sidebarConfiguration.storyIds : [];
    if (typeof configuration.storyId === "string" && storyIds.includes(configuration.storyId)) {
      throw new HomepageBuilderError("VALIDATION", "Select a Hero Story that is not used by the adjacent Hero Sidebar.");
    }
  }
}
