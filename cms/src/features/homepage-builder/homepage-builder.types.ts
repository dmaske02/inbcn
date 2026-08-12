import type { Json } from "@/lib/supabase/types";

export const HOMEPAGE_LOCALES = ["en", "hi", "mr"] as const;
export type HomepageLocale = (typeof HOMEPAGE_LOCALES)[number];
export const HOMEPAGE_CONTAINERS = ["main", "sidebar", "footer"] as const;
export type HomepageContainer = (typeof HOMEPAGE_CONTAINERS)[number];
export const HOMEPAGE_WIDTHS = ["full", "half", "third", "quarter"] as const;
export type HomepageWidth = (typeof HOMEPAGE_WIDTHS)[number];

export type HomepageConfigurationDto = Readonly<{ id: string; languageId: string; locale: HomepageLocale; createdBy: string | null; updatedBy: string | null; createdAt: string; updatedAt: string }>;
export type HomepageSectionDto = Readonly<{ id: string; homepageConfigurationId: string; blockId: string; title: string; blockType: string; renderer: string; position: number; container: HomepageContainer; width: HomepageWidth; enabled: boolean; startsAt: string | null; endsAt: string | null; configuration: Json; createdBy: string | null; updatedBy: string | null; createdAt: string; updatedAt: string }>;
export type HomepageSectionInput = Readonly<{ blockId: unknown; title: unknown; blockType: unknown; renderer: unknown; container: unknown; width: unknown; enabled: unknown; startsAt: unknown; endsAt: unknown; configuration: unknown }>;
export type HomepageReferenceData = Readonly<{ stories: readonly Readonly<{ id: string; languageId: string; title: string }>[]; categories: readonly Readonly<{ id: string; languageId: string; name: string }>[]; liveTv: Readonly<{ id: string; languageId: string; title: string }> | null }>;
export type HomepagePreviewItem = Readonly<{ id: string; blockId: string; title: string; type: string; renderer: string; position: number; container: HomepageContainer; width: HomepageWidth; configuration: Json }>;
export type HomepagePreviewPayload = Readonly<{ locale: HomepageLocale; sections: readonly HomepagePreviewItem[] }>;
