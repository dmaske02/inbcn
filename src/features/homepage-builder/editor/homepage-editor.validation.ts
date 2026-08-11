import type { HomepageSectionDto } from "../homepage-builder.types.ts";
import type {
  HomepageEditorDraft,
  HomepageEditorFieldErrors,
  HomepageEditorMappedInput,
  HomepageEditorRegistryDefinition,
} from "./homepage-editor.types.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function configurationRecord(value: unknown): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numeric(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function base(section: HomepageSectionDto) {
  return {
    id: section.id,
    blockId: section.blockId,
    title: section.title,
    container: section.container,
    width: section.width,
    enabled: section.enabled,
    startsAt: section.startsAt,
    endsAt: section.endsAt,
  } as const;
}

export function draftFromSection(section: HomepageSectionDto): HomepageEditorDraft {
  const configuration = configurationRecord(section.configuration);
  const common = base(section);

  switch (section.blockType) {
    case "hero-story":
      return { ...common, blockType: "hero-story", storyId: text(configuration.storyId) };
    case "hero-sidebar":
      return {
        ...common,
        blockType: "hero-sidebar",
        storyIds: Array.isArray(configuration.storyIds)
          ? configuration.storyIds.filter((item): item is string => typeof item === "string")
          : [],
      };
    case "breaking-news":
    case "latest-news":
    case "trending":
    case "opinion":
      return { ...common, blockType: section.blockType, limit: numeric(configuration.limit, 1) };
    case "live-tv":
      return { ...common, blockType: "live-tv" };
    case "category-section":
      return {
        ...common,
        blockType: "category-section",
        categoryId: text(configuration.categoryId),
        limit: numeric(configuration.limit, 1),
      };
    case "advertisement-placeholder":
      return { ...common, blockType: "advertisement-placeholder", label: text(configuration.label) };
    case "custom-html-placeholder":
      return { ...common, blockType: "custom-html-placeholder", content: text(configuration.content) };
    case "future-placeholder":
      return { ...common, blockType: "future-placeholder", note: text(configuration.note) };
    default:
      throw new Error(`Unsupported Homepage Builder block type: ${section.blockType}`);
  }
}

function configurationFromDraft(draft: HomepageEditorDraft): Record<string, unknown> {
  switch (draft.blockType) {
    case "hero-story":
      return { storyId: draft.storyId };
    case "hero-sidebar":
      return { storyIds: [...draft.storyIds] };
    case "breaking-news":
    case "latest-news":
    case "trending":
    case "opinion":
      return { limit: draft.limit };
    case "live-tv":
      return {};
    case "category-section":
      return { categoryId: draft.categoryId, limit: draft.limit };
    case "advertisement-placeholder":
      return { label: draft.label };
    case "custom-html-placeholder":
      return { content: draft.content };
    case "future-placeholder":
      return { note: draft.note };
  }
}

export function toHomepageSectionInput(
  draft: HomepageEditorDraft,
  definition: HomepageEditorRegistryDefinition,
): HomepageEditorMappedInput {
  if (definition.id !== draft.blockType) {
    throw new Error("The registry definition does not match the editor draft.");
  }

  return {
    blockId: draft.blockId,
    title: draft.title,
    blockType: draft.blockType,
    renderer: definition.renderer,
    container: draft.container,
    width: draft.width,
    enabled: draft.enabled,
    startsAt: draft.startsAt,
    endsAt: draft.endsAt,
    configuration: configurationFromDraft(draft),
  };
}

function isValidDate(value: string | null): boolean {
  return value === null || (value.trim().length > 0 && Number.isFinite(Date.parse(value)));
}

export function validateHomepageEditorDraft(
  draft: HomepageEditorDraft,
  definition: HomepageEditorRegistryDefinition,
): HomepageEditorFieldErrors {
  const errors: Record<string, string> = {};
  const trimmedTitle = draft.title.trim();

  if (!trimmedTitle) errors.title = "Enter a section title.";
  else if (trimmedTitle.length > 180) errors.title = "Use 180 characters or fewer.";

  if (!isValidDate(draft.startsAt)) errors.startsAt = "Enter a valid schedule start.";
  if (!isValidDate(draft.endsAt)) errors.endsAt = "Enter a valid schedule end.";
  if (
    draft.endsAt &&
    isValidDate(draft.endsAt) &&
    (!draft.startsAt || !isValidDate(draft.startsAt) || Date.parse(draft.endsAt) <= Date.parse(draft.startsAt))
  ) {
    errors.endsAt = "Schedule end must be after schedule start.";
  }

  if (definition.id !== draft.blockType) {
    errors.blockType = "The block editor does not match this section.";
    return errors;
  }

  switch (draft.blockType) {
    case "hero-story":
      if (!UUID_PATTERN.test(draft.storyId)) errors.storyId = "Select a valid story.";
      break;
    case "hero-sidebar":
      if (
        draft.storyIds.length < 1
        || draft.storyIds.length > 3
        || draft.storyIds.some((storyId) => !UUID_PATTERN.test(storyId))
        || new Set(draft.storyIds).size !== draft.storyIds.length
      ) {
        errors.storyIds = "Select between 1 and 3 unique stories.";
      }
      break;
    case "category-section":
      if (!UUID_PATTERN.test(draft.categoryId)) errors.categoryId = "Select a valid category.";
      if (!Number.isInteger(draft.limit) || draft.limit < 1 || draft.limit > 100) {
        errors.limit = "Choose between 1 and 100 items.";
      }
      break;
    case "breaking-news":
    case "latest-news":
    case "trending":
    case "opinion":
      if (!Number.isInteger(draft.limit) || draft.limit < 1 || draft.limit > 100) {
        errors.limit = "Choose between 1 and 100 items.";
      }
      break;
    case "advertisement-placeholder": {
      const label = draft.label.trim();
      if (!label) errors.label = "Enter an advertisement label.";
      else if (label.length > 120) errors.label = "Use 120 characters or fewer.";
      break;
    }
    case "custom-html-placeholder":
      if (draft.content.length > 10_000) errors.content = "Use 10,000 characters or fewer.";
      break;
    case "future-placeholder":
      if (draft.note.length > 500) errors.note = "Use 500 characters or fewer.";
      break;
    case "live-tv":
      break;
  }

  if (!definition.validate(configurationFromDraft(draft)).success && Object.keys(errors).length === 0) {
    errors.blockType = "Check the block settings and try again.";
  }

  return errors;
}
