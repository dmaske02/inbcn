import { HomepageBuilderError, isSectionActive } from "./homepage-builder.model.ts";
import { getHomepageBlockDefinition } from "./homepage-builder.registry.ts";
import type { HomepageLocale, HomepagePreviewPayload, HomepageReferenceData, HomepageSectionDto } from "./homepage-builder.types.ts";
import type { Json } from "@/lib/supabase/types";

export function buildHomepagePreview(locale: HomepageLocale, sections: readonly HomepageSectionDto[], references: HomepageReferenceData, now = new Date()): HomepagePreviewPayload {
  const items = sections.filter((section) => isSectionActive(section, now)).toSorted((a, b) => a.position - b.position).map((section) => {
    const definition = getHomepageBlockDefinition(section.blockType);
    if (!definition || definition.renderer !== section.renderer) throw new HomepageBuilderError("VALIDATION", `Block ${section.blockId} has an invalid renderer.`);
    const result = definition.validate(section.configuration);
    if (!result.success) throw new HomepageBuilderError("VALIDATION", `Block ${section.blockId} has invalid configuration.`);
    const configuration: Record<string, unknown> = { ...(result.data as Record<string, unknown>) };
    if (section.blockType === "hero-story") {
      const story = references.stories.find((item) => item.id === configuration.storyId);
      if (!story) throw new HomepageBuilderError("REFERENCE_MISSING", `The story is missing for ${section.title}.`);
      configuration.story = story;
    }
    if (section.blockType === "category-section") {
      const category = references.categories.find((item) => item.id === configuration.categoryId);
      if (!category) throw new HomepageBuilderError("REFERENCE_MISSING", `The category is missing for ${section.title}.`);
      configuration.category = category;
    }
    if (section.blockType === "live-tv") {
      if (!references.liveTv) throw new HomepageBuilderError("REFERENCE_MISSING", "The Live TV configuration is missing for this locale.");
      configuration.liveTv = references.liveTv;
    }
    return { id: section.id, blockId: section.blockId, title: section.title, type: section.blockType, renderer: section.renderer, position: section.position, container: section.container, width: section.width, configuration: configuration as Json };
  });
  return { locale, sections: items };
}
