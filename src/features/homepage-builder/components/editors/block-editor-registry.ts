import type { ComponentType } from "react";
import type { HomepageEditorDraft, HomepageEditorFieldErrors } from "../../editor/homepage-editor.types.ts";
import type { HomepageLocale } from "../../homepage-builder.types.ts";
import { AdvertisementEditor } from "./advertisement-editor";
import { CategorySectionEditor } from "./category-section-editor";
import { HeroStoryEditor } from "./hero-story-editor";
import { HeroSidebarEditor } from "./hero-sidebar-editor";
import { ListBlockEditor } from "./list-block-editor";
import { LiveTvEditor } from "./live-tv-editor";
import { PlaceholderEditor } from "./placeholder-editor";

type HomepageEditorBlockType = HomepageEditorDraft["blockType"];

export type BlockEditorProps<TBlockType extends HomepageEditorBlockType = HomepageEditorBlockType> = Readonly<{
  locale: HomepageLocale;
  draft: Extract<HomepageEditorDraft, { blockType: TBlockType }>;
  fieldErrors: HomepageEditorFieldErrors;
  onChange(draft: Extract<HomepageEditorDraft, { blockType: TBlockType }>): void;
}>;

type VisualEditorComponent = {
  [BlockType in HomepageEditorBlockType]: ComponentType<BlockEditorProps<BlockType>>;
}[HomepageEditorBlockType];

type VisualEditorDefinition = Readonly<{
  label: string;
  component: VisualEditorComponent;
}>;

export const VISUAL_BLOCK_EDITOR_REGISTRY = {
  "hero-story": { label: "Hero Story", component: HeroStoryEditor },
  "hero-sidebar": { label: "Hero Sidebar", component: HeroSidebarEditor },
  "breaking-news": { label: "Breaking News", component: ListBlockEditor },
  "live-tv": { label: "Live TV", component: LiveTvEditor },
  "latest-news": { label: "Latest News", component: ListBlockEditor },
  "category-section": { label: "Category Section", component: CategorySectionEditor },
  "trending": { label: "Trending", component: ListBlockEditor },
  "opinion": { label: "Opinion", component: ListBlockEditor },
  "advertisement-placeholder": { label: "Advertisement Placeholder", component: AdvertisementEditor },
  "custom-html-placeholder": { label: "Custom HTML Placeholder", component: PlaceholderEditor },
  "future-placeholder": { label: "Future Placeholder", component: PlaceholderEditor },
} as const satisfies Record<HomepageEditorBlockType, VisualEditorDefinition>;

export function getVisualBlockEditor(blockType: string) {
  return VISUAL_BLOCK_EDITOR_REGISTRY[blockType as HomepageEditorBlockType] ?? null;
}
