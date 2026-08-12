import "server-only";

import { cache } from "react";
import { getTranslations } from "next-intl/server";

import { env } from "@/config/env";
import { getCategories } from "../categories.repository";
import { getLanguage } from "../languages.repository";
import { searchPublishedStories } from "../stories.repository";
import {
  composeSearchPageModel,
  getPublishedAfter,
  normalizeSearchDate,
  normalizeSearchQuery,
  parseSearchPage,
  resolveSearchPageStatus,
  type SearchPageModel,
} from "./search.model";

const SEARCH_PAGE_SIZE = 12;

export type SearchPageSearchParams = Readonly<{
  q?: string | string[];
  category?: string | string[];
  date?: string | string[];
  page?: string | string[];
}>;

export type SearchPageResult =
  | Readonly<{ status: "not-found" | "out-of-range" }>
  | Readonly<{
      status: "ready";
      state: "initial" | "searched";
      data: SearchPageModel;
      categories: readonly Readonly<{ name: string; slug: string }>[];
      languageName: string;
    }>;

function parseCategory(value: string | string[] | undefined): string | null | undefined {
  if (value === undefined || value === "") return null;
  if (Array.isArray(value)) return undefined;
  const category = value.trim();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(category) ? category : undefined;
}

function serializeSearchParams(params: SearchPageSearchParams): string {
  return JSON.stringify({
    q: params.q ?? null,
    category: params.category ?? null,
    date: params.date ?? null,
    page: params.page ?? null,
  });
}

const getCachedSearchPageData = cache(async (
  locale: string,
  serializedParams: string,
): Promise<SearchPageResult> => {
  const parsed = JSON.parse(serializedParams) as {
    q: string | string[] | null;
    category: string | string[] | null;
    date: string | string[] | null;
    page: string | string[] | null;
  };
  const query = normalizeSearchQuery(parsed.q ?? undefined);
  const categorySlug = parseCategory(parsed.category ?? undefined);
  const date = normalizeSearchDate(parsed.date ?? undefined);
  const page = parseSearchPage(parsed.page ?? undefined);

  if (query.status === "invalid" || categorySlug === undefined || date === null || page === null) {
    return { status: "not-found" };
  }

  const [language, categories, t] = await Promise.all([
    getLanguage(locale),
    getCategories(locale),
    getTranslations({ locale, namespace: "searchPage" }),
  ]);
  if (!language) return { status: "not-found" };

  const selectedCategory = categorySlug
    ? categories.find((category) => category.slug === categorySlug) ?? null
    : null;
  if (categorySlug && !selectedCategory) return { status: "not-found" };

  if (query.status === "empty" && (page !== 1 || categorySlug || date !== "all")) {
    return { status: "not-found" };
  }

  const storyPage = query.status === "valid"
    ? await searchPublishedStories({
        languageId: language.id,
        query: query.query,
        categoryId: selectedCategory?.id,
        publishedAfter: getPublishedAfter(date, new Date().toISOString()) ?? undefined,
        page,
        pageSize: SEARCH_PAGE_SIZE,
      })
    : { stories: [], total: 0 };
  const searched = query.status === "valid";
  const title = searched
    ? page > 1
      ? t("metadata.titlePage", { query: query.query, page })
      : t("metadata.title", { query: query.query })
    : t("metadata.defaultTitle");
  const description = searched
    ? t("metadata.description", { query: query.query })
    : t("metadata.defaultDescription");
  const data = composeSearchPageModel({
    locale,
    query: query.query,
    category: categorySlug,
    date,
    page,
    pageSize: SEARCH_PAGE_SIZE,
    total: storyPage.total,
    stories: storyPage.stories,
    categories,
    siteUrl: env.public.appUrl ?? "http://localhost:3000",
    cloudName: env.public.cloudinaryCloudName,
    labels: {
      newsDesk: t("author.newsDesk"),
      title,
      description,
      emptyTitle: searched
        ? t("empty.title", { query: query.query })
        : t("initial.title"),
      emptyDescription: searched
        ? t("empty.description")
        : t("initial.description"),
      categoryFallback: t("categoryFallback"),
    },
  });
  if (searched && resolveSearchPageStatus({
    page,
    totalPages: data.pagination.totalPages,
  }) !== "ready") {
    return { status: "out-of-range" };
  }

  return {
    status: "ready",
    state: searched ? "searched" : "initial",
    data,
    categories: categories.map((category) => ({
      name: category.name,
      slug: category.slug,
    })),
    languageName: language.nativeName,
  };
});

export function getSearchPageData(
  locale: string,
  searchParams: SearchPageSearchParams,
): Promise<SearchPageResult> {
  return getCachedSearchPageData(locale, serializeSearchParams(searchParams));
}

export { SEARCH_PAGE_SIZE };
