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
  void input;
  void sections;
  void position;
}
