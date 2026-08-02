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

export type FeaturedMediaDto = Readonly<{
  publicId: string;
  secureUrl: string;
  altText: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
}>;

export type StorySummaryDto = Readonly<{
  id: string;
  translationGroupId: string;
  languageId: string;
  categoryId: string;
  sourceId: string | null;
  externalAuthor: string | null;
  type: DatabaseEnum<"story_type">;
  slug: string;
  title: string;
  summary: string;
  featuredMediaId: string | null;
  featuredMedia: FeaturedMediaDto | null;
  isFeatured: boolean;
  isBreaking: boolean;
  isSponsored: boolean;
  publishedAt: string;
}>;

export type StoryDto = StorySummaryDto &
  Readonly<{
    content: string;
    updatedAt: string;
    externalUrl: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    seoKeywords: readonly string[];
    canonicalUrl: string | null;
  }>;

export type CategoryStoryDto = StorySummaryDto &
  Readonly<{
    content: string;
  }>;

export type PublishedCategoryStoryPageDto = Readonly<{
  stories: readonly CategoryStoryDto[];
  total: number;
}>;

export type PublishedStorySearchPageDto = Readonly<{
  stories: readonly CategoryStoryDto[];
  total: number;
}>;

export type CmsStoryDto = Readonly<{
  id: string;
  languageId: string;
  categoryId: string;
  sourceId: string | null;
  createdBy: string | null;
  approvedBy: string | null;
  type: DatabaseEnum<"story_type">;
  status: DatabaseEnum<"story_status">;
  slug: string;
  title: string;
  summary: string;
  content: string;
  externalId: string | null;
  externalUrl: string | null;
  externalAuthor: string | null;
  externalPublishedAt: string | null;
  externalImageUrl: string | null;
  featuredMediaId: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: readonly string[];
  canonicalUrl: string | null;
  isFeatured: boolean;
  isBreaking: boolean;
  submittedAt: string | null;
  approvedAt: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type CmsStoryListResultDto = Readonly<{
  items: readonly CmsStoryDto[];
  total: number;
}>;

export type CmsStoryReferenceDto = Readonly<{
  languages: readonly Readonly<{ id: string; code: string; name: string }>[];
  categories: readonly Readonly<{ id: string; languageId: string; name: string }>[];
  sources: readonly Readonly<{ id: string; name: string }>[];
  authors: readonly Readonly<{ id: string; displayName: string }>[];
}>;
