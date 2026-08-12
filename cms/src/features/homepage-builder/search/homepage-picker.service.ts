import "server-only";

import { HomepageBuilderError } from "../homepage-builder.model.ts";
import { HOMEPAGE_LOCALES, type HomepageLocale } from "../homepage-builder.types.ts";
import * as productionRepository from "./homepage-picker.repository.ts";
import {
  HOMEPAGE_PICKER_MAX_PAGE,
  HOMEPAGE_PICKER_PAGE_SIZE,
  type CategoryPickerOption,
  type HomepagePickerPage,
  type HomepagePickerQuery,
  type HomepagePickerRepository,
  type HomepagePickerSearchInput,
  type HomepagePickerStoryRecord,
  type StoryPickerOption,
} from "./homepage-picker.types.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type ServiceDependencies = Readonly<{
  authenticate: () => Promise<unknown>;
  repository: HomepagePickerRepository;
}>;

function parseLocale(value: unknown): HomepageLocale {
  if (typeof value !== "string") {
    throw new HomepageBuilderError("VALIDATION", "Select a valid Homepage Picker locale.");
  }
  const locale = value.trim().toLowerCase();
  if (!HOMEPAGE_LOCALES.includes(locale as HomepageLocale)) {
    throw new HomepageBuilderError("VALIDATION", "Select a valid Homepage Picker locale.");
  }
  return locale as HomepageLocale;
}

function normalizeQuery(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new HomepageBuilderError("VALIDATION", "Search query must be text.");
  }
  const query = value.trim().replace(/\s+/gu, " ");
  if (query.length > 120) {
    throw new HomepageBuilderError("VALIDATION", "Search query must use 120 characters or fewer.");
  }
  return query;
}

function parsePage(value: unknown): number {
  const page = value === undefined ? 1 : value;
  if (!Number.isInteger(page) || (page as number) < 1 || (page as number) > HOMEPAGE_PICKER_MAX_PAGE) {
    throw new HomepageBuilderError(
      "VALIDATION",
      `Search page must be a whole number between 1 and ${HOMEPAGE_PICKER_MAX_PAGE}.`,
    );
  }
  return page as number;
}

function parseSearchInput(input: HomepagePickerSearchInput): HomepagePickerQuery {
  return {
    locale: parseLocale(input.locale),
    query: normalizeQuery(input.query),
    page: parsePage(input.page),
    pageSize: HOMEPAGE_PICKER_PAGE_SIZE,
  };
}

function parseId(value: unknown, type: "story" | "category"): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new HomepageBuilderError("VALIDATION", `Select a valid ${type}.`);
  }
  return value;
}

function toStoryOption(record: HomepagePickerStoryRecord): StoryPickerOption {
  const thumbnail = record.featuredMedia
    ? {
        url: record.featuredMedia.url,
        altText: record.featuredMedia.altText?.trim() || record.title,
        width: record.featuredMedia.width,
        height: record.featuredMedia.height,
      }
    : record.externalImage
      ? {
          url: record.externalImage.url,
          altText: record.title,
          width: record.externalImage.width,
          height: record.externalImage.height,
        }
      : null;
  return {
    id: record.id,
    title: record.title,
    publishedAt: record.publishedAt,
    category: record.category,
    thumbnail,
  };
}

function toCategoryOption(record: Awaited<ReturnType<HomepagePickerRepository["findActiveCategoryRecord"]>> extends infer T ? NonNullable<T> : never): CategoryPickerOption {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    publishedStoryCount: record.publishedStoryCount,
  };
}

function page<T>(items: readonly T[], total: number, query: HomepagePickerQuery): HomepagePickerPage<T> {
  return {
    items,
    total,
    page: query.page,
    pageSize: HOMEPAGE_PICKER_PAGE_SIZE,
    totalPages: Math.ceil(total / HOMEPAGE_PICKER_PAGE_SIZE),
  };
}

export function createHomepagePickerService(dependencies: ServiceDependencies) {
  return {
    async searchStories(input: HomepagePickerSearchInput): Promise<HomepagePickerPage<StoryPickerOption>> {
      await dependencies.authenticate();
      const query = parseSearchInput(input);
      const result = await dependencies.repository.searchStoryRecords(query);
      return page(result.records.map(toStoryOption), result.total, query);
    },

    async searchCategories(input: HomepagePickerSearchInput): Promise<HomepagePickerPage<CategoryPickerOption>> {
      await dependencies.authenticate();
      const query = parseSearchInput(input);
      const result = await dependencies.repository.searchCategoryRecords(query);
      return page(result.records.map(toCategoryOption), result.total, query);
    },

    async findPublishedStoryForLocale(storyIdValue: unknown, localeValue: unknown): Promise<StoryPickerOption | null> {
      await dependencies.authenticate();
      const storyId = parseId(storyIdValue, "story");
      const locale = parseLocale(localeValue);
      const record = await dependencies.repository.findPublishedStoryRecord(storyId, locale);
      return record ? toStoryOption(record) : null;
    },

    async findActiveCategoryForLocale(categoryIdValue: unknown, localeValue: unknown): Promise<CategoryPickerOption | null> {
      await dependencies.authenticate();
      const categoryId = parseId(categoryIdValue, "category");
      const locale = parseLocale(localeValue);
      const record = await dependencies.repository.findActiveCategoryRecord(categoryId, locale);
      return record ? toCategoryOption(record) : null;
    },
  } as const;
}

const service = createHomepagePickerService({
  authenticate: async () => {
    const { requireAdminUser } = await import("../../admin/auth/server.ts");
    return requireAdminUser();
  },
  repository: productionRepository,
});

export const searchStories = service.searchStories;
export const searchCategories = service.searchCategories;
export const findPublishedStoryForLocale = service.findPublishedStoryForLocale;
export const findActiveCategoryForLocale = service.findActiveCategoryForLocale;
