import type { DatabaseEnum } from "@/lib/supabase/types";

export type LanguageDto = Readonly<{
  id: string;
  code: string;
  name: string;
  nativeName: string;
}>;

export type CategoryDto = Readonly<{
  id: string;
  languageId: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
}>;

export type SourceDto = Readonly<{
  id: string;
  defaultLanguageId: string | null;
  defaultCategoryId: string | null;
  name: string;
  slug: string;
  type: DatabaseEnum<"source_type">;
  websiteUrl: string | null;
  feedUrl: string | null;
  trustScore: number | null;
  lastIngestedAt: string | null;
}>;

export type StorySummaryDto = Readonly<{
  id: string;
  translationGroupId: string;
  languageId: string;
  categoryId: string;
  sourceId: string | null;
  type: DatabaseEnum<"story_type">;
  slug: string;
  title: string;
  summary: string;
  featuredMediaId: string | null;
  isFeatured: boolean;
  isBreaking: boolean;
  isSponsored: boolean;
  publishedAt: string;
}>;

export type StoryDto = StorySummaryDto &
  Readonly<{
    content: string;
    externalUrl: string | null;
    externalAuthor: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    seoKeywords: readonly string[];
    canonicalUrl: string | null;
  }>;
