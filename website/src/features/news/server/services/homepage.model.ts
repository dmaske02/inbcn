import type { CategoryDto, StorySummaryDto } from "../dto";
import { buildPublicStoryUrl, resolvePublicStoryImage } from "./public-story.mjs";

export const HOMEPAGE_FALLBACK_IMAGE = "/images/news/story-fallback.svg";

export type HomepageStory = Readonly<{
  id: string; slug: string; href: string; title: string; summary: string;
  publishedAt: string; categoryId: string; categoryName: string | null;
  categorySlug: string | null; isBreaking: boolean; isFeatured: boolean;
  image: Readonly<{ src: string; alt: string; unoptimized: boolean; width: number | null; height: number | null; aspectRatio: number | null }>;
}>;

export type HomepagePinnedAlert = Readonly<{
  id: string; title: string; message: string; dismissible: boolean;
}>;

export type HomepageCategorySection = Readonly<{
  category: CategoryDto;
  stories: readonly HomepageStory[];
}>;

export type HomepageViewModel = Readonly<{
  all: readonly HomepageStory[];
  featured: HomepageStory | null;
  breaking: readonly HomepageStory[];
  pinnedAlert: HomepagePinnedAlert | null;
  topHeadlines: readonly HomepageStory[];
  latest: readonly HomepageStory[];
  trending: readonly HomepageStory[];
  categoryRails: readonly HomepageCategorySection[];
  editorPicks: readonly HomepageStory[];
}>;

type HomepageAlertInput = Readonly<{
  id: string; title: string; message: string; placement: string; dismissible: boolean; startAt?: string;
}>;

export function composeHomepageData(
  locale: string,
  storyDtos: readonly StorySummaryDto[],
  categoryDtos: readonly CategoryDto[],
  cloudName?: string,
  alerts: readonly HomepageAlertInput[] = [],
): HomepageViewModel {
  const categories = [...categoryDtos].sort((left, right) => left.sortOrder - right.sortOrder);
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const stories = [...storyDtos]
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
    .map<HomepageStory>((story) => {
      const category = categoriesById.get(story.categoryId) ?? null;
      return {
        id: story.id, slug: story.slug, href: buildPublicStoryUrl(locale, story.slug),
        title: story.title, summary: story.summary, publishedAt: story.publishedAt,
        categoryId: story.categoryId, categoryName: category?.name ?? null,
        categorySlug: category?.slug ?? null, isBreaking: story.isBreaking,
        isFeatured: story.isFeatured,
        image: resolvePublicStoryImage(
          story.featuredMedia,
          story.externalImageUrl,
          cloudName,
          story.title,
          story.externalImageWidth,
          story.externalImageHeight,
        ),
      };
    });

  const assigned = new Set<string>();
  const allocate = (predicate: (story: HomepageStory) => boolean, limit = Number.POSITIVE_INFINITY) => {
    const selected: HomepageStory[] = [];
    for (const story of stories) {
      if (selected.length >= limit) break;
      if (!assigned.has(story.id) && predicate(story)) {
        assigned.add(story.id);
        selected.push(story);
      }
    }
    return selected;
  };

  const featured =
    allocate((story) => story.isFeatured, 1)[0] ??
    allocate(() => true, 1)[0] ??
    null;
  const heroSideStories = allocate(() => true, 2);
  const breaking = stories.filter((story) => story.isBreaking);
  const topHeadlines = allocate(() => true, 3);
  const trending = allocate(() => true, 3);
  const latest = allocate(() => true, 4);
  const categoryRails = categories.flatMap<HomepageCategorySection>((category) => {
    const categoryStories = allocate((story) => story.categoryId === category.id, 3);
    return categoryStories.length ? [{ category, stories: categoryStories }] : [];
  });
  const pinned = alerts
    .filter((alert) => alert.placement === "pinned_banner")
    .toSorted((left, right) => Date.parse(right.startAt ?? "") - Date.parse(left.startAt ?? ""))[0] ?? null;

  return {
    all: stories,
    featured,
    breaking,
    pinnedAlert: pinned ? { id: pinned.id, title: pinned.title, message: pinned.message, dismissible: pinned.dismissible } : null,
    topHeadlines,
    latest,
    trending,
    categoryRails,
    editorPicks: heroSideStories,
  };
}
