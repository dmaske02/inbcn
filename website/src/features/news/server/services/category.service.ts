import "server-only";

import { cache } from "react";
import { getTranslations } from "next-intl/server";

import { env } from "@/config/env";
import { getCategories, getCategoryBySlug } from "../categories.repository";
import {
  getCategoryStoryCandidates,
  getPublishedCategoryStoryPage,
} from "../stories.repository";
import {
  composeCategoryPageModel,
  type CategoryPageModel,
  resolveCategoryPageStatus,
  selectCategoryHero,
} from "./category.model";

const CATEGORY_PAGE_SIZE = 12;

export type CategoryPageResult =
  | Readonly<{ status: "not-found" | "out-of-range" }>
  | Readonly<{ status: "ready"; data: CategoryPageModel }>;

function parsePage(value: string | string[] | undefined): number {
  if (value === undefined) return 1;
  if (Array.isArray(value)) return Number.NaN;
  if (!/^\d+$/u.test(value)) return Number.NaN;
  return Number(value);
}

export const getCategoryPageData = cache(async (
  locale: string,
  slug: string,
  pageValue?: string | string[],
): Promise<CategoryPageResult> => {
  const page = parsePage(pageValue);
  const category = await getCategoryBySlug(locale, slug);
  const initialStatus = resolveCategoryPageStatus({
    categoryExists: category !== null,
    page,
    totalPages: Number.MAX_SAFE_INTEGER,
  });
  if (initialStatus !== "ready") return { status: initialStatus };
  if (!category) return { status: "not-found" };

  const [candidates, categories, t] = await Promise.all([
    getCategoryStoryCandidates(category.languageId, category.id),
    getCategories(locale),
    getTranslations({ locale, namespace: "categoryPage" }),
  ]);
  const hero = selectCategoryHero(candidates.featured, candidates.latest);
  const storyPage = await getPublishedCategoryStoryPage({
    languageId: category.languageId,
    categoryId: category.id,
    page,
    pageSize: CATEGORY_PAGE_SIZE,
    excludeStoryId: hero?.id,
  });
  const siteUrl = env.public.appUrl ?? "http://localhost:3000";
  const data = composeCategoryPageModel({
    locale,
    category,
    hero,
    stories: storyPage.stories,
    relatedCategories: categories.filter((item) => item.id !== category.id),
    page,
    pageSize: CATEGORY_PAGE_SIZE,
    total: storyPage.total,
    siteUrl,
    labels: {
      newsDesk: t("author.newsDesk"),
      emptyTitle: t("empty.title", { category: category.name }),
      emptyDescription: t("empty.description"),
      pageLabel: t("pagination.page"),
    },
    description: t("description", { category: category.name }),
    cloudName: env.public.cloudinaryCloudName,
  });
  const finalStatus = resolveCategoryPageStatus({
    categoryExists: true,
    page,
    totalPages: data.pagination.totalPages,
  });
  if (finalStatus !== "ready") return { status: finalStatus };

  return { status: "ready", data };
});

export { CATEGORY_PAGE_SIZE };
