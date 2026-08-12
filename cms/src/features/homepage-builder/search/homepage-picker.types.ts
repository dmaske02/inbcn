import type { HomepageLocale } from "../homepage-builder.types.ts";

export const HOMEPAGE_PICKER_PAGE_SIZE = 20 as const;
export const HOMEPAGE_PICKER_MAX_PAGE = 10_000 as const;

export type HomepagePickerSearchInput = Readonly<{
  locale: unknown;
  query?: unknown;
  page?: unknown;
}>;

export type HomepagePickerQuery = Readonly<{
  locale: HomepageLocale;
  query: string;
  page: number;
  pageSize: typeof HOMEPAGE_PICKER_PAGE_SIZE;
}>;

export type HomepagePickerPage<T> = Readonly<{
  items: readonly T[];
  total: number;
  page: number;
  pageSize: typeof HOMEPAGE_PICKER_PAGE_SIZE;
  totalPages: number;
}>;

export type HomepagePickerThumbnail = Readonly<{
  url: string;
  altText: string;
  width: number | null;
  height: number | null;
}>;

export type StoryPickerOption = Readonly<{
  id: string;
  title: string;
  publishedAt: string;
  category: Readonly<{ id: string; name: string }> | null;
  thumbnail: HomepagePickerThumbnail | null;
}>;

export type CategoryPickerOption = Readonly<{
  id: string;
  name: string;
  slug: string;
  publishedStoryCount: number;
}>;

export type HomepagePickerStoryRecord = Readonly<{
  id: string;
  languageId: string;
  title: string;
  publishedAt: string;
  category: Readonly<{ id: string; name: string }> | null;
  featuredMedia: Readonly<{
    url: string;
    altText: string | null;
    width: number | null;
    height: number | null;
  }> | null;
  externalImage: Readonly<{
    url: string;
    width: number | null;
    height: number | null;
  }> | null;
}>;

export type HomepagePickerCategoryRecord = Readonly<{
  id: string;
  languageId: string;
  name: string;
  slug: string;
  publishedStoryCount: number;
}>;

export type HomepagePickerRecordPage<T> = Readonly<{
  records: readonly T[];
  total: number;
}>;

export type HomepagePickerRepository = Readonly<{
  searchStoryRecords(query: HomepagePickerQuery): Promise<HomepagePickerRecordPage<HomepagePickerStoryRecord>>;
  searchCategoryRecords(query: HomepagePickerQuery): Promise<HomepagePickerRecordPage<HomepagePickerCategoryRecord>>;
  findPublishedStoryRecord(id: string, locale: HomepageLocale): Promise<HomepagePickerStoryRecord | null>;
  findActiveCategoryRecord(id: string, locale: HomepageLocale): Promise<HomepagePickerCategoryRecord | null>;
}>;

