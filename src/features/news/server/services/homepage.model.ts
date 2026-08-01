import type { CategoryDto, StorySummaryDto } from "../dto";

export const HOMEPAGE_FALLBACK_IMAGE = "/images/news/story-fallback.svg";

export const HOMEPAGE_CATEGORY_SLUGS = [
  "national",
  "world",
  "business",
  "technology",
  "sports",
  "entertainment",
  "opinion",
] as const;

export type HomepageCategorySlug = (typeof HOMEPAGE_CATEGORY_SLUGS)[number];

export type HomepageStory = Readonly<{
  id: string;
  slug: string;
  href: string;
  title: string;
  summary: string;
  publishedAt: string;
  categoryId: string;
  categoryName: string | null;
  categorySlug: string | null;
  isBreaking: boolean;
  isFeatured: boolean;
  image: Readonly<{
    src: string;
    alt: string;
  }>;
}>;

export type HomepageCategorySection = Readonly<{
  category: CategoryDto | null;
  stories: readonly HomepageStory[];
}>;

export type HomepageViewModel = Readonly<{
  signal: HomepageStory | null;
  hero: HomepageStory | null;
  latest: readonly HomepageStory[];
  categories: readonly CategoryDto[];
  across: readonly HomepageCategorySection[];
  sections: Readonly<Record<HomepageCategorySlug, HomepageCategorySection>>;
  editorsPicks: readonly HomepageStory[];
  trending: readonly HomepageStory[];
}>;

function byPublishedAtDescending(
  left: StorySummaryDto,
  right: StorySummaryDto,
) {
  return Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
}

export function composeHomepageData(
  locale: string,
  storyDtos: readonly StorySummaryDto[],
  categoryDtos: readonly CategoryDto[],
): HomepageViewModel {
  const categories = [...categoryDtos].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  );
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const categoriesBySlug = new Map(
    categories.map((category) => [category.slug, category]),
  );
  const stories = [...storyDtos]
    .sort(byPublishedAtDescending)
    .map<HomepageStory>((story) => {
      const category = categoriesById.get(story.categoryId) ?? null;

      return {
        id: story.id,
        slug: story.slug,
        href: `/${locale}/story/${story.slug}`,
        title: story.title,
        summary: story.summary,
        publishedAt: story.publishedAt,
        categoryId: story.categoryId,
        categoryName: category?.name ?? null,
        categorySlug: category?.slug ?? null,
        isBreaking: story.isBreaking,
        isFeatured: story.isFeatured,
        image: {
          src: HOMEPAGE_FALLBACK_IMAGE,
          alt: story.title,
        },
      };
    });

  const hero = stories.find((story) => story.isFeatured) ?? stories[0] ?? null;
  const latest = stories.filter((story) => story.id !== hero?.id).slice(0, 4);
  const sectionFor = (slug: HomepageCategorySlug): HomepageCategorySection => {
    const category = categoriesBySlug.get(slug) ?? null;
    return {
      category,
      stories: category
        ? stories.filter((story) => story.categoryId === category.id).slice(0, 4)
        : [],
    };
  };
  const sections: Record<HomepageCategorySlug, HomepageCategorySection> = {
    national: sectionFor("national"),
    world: sectionFor("world"),
    business: sectionFor("business"),
    technology: sectionFor("technology"),
    sports: sectionFor("sports"),
    entertainment: sectionFor("entertainment"),
    opinion: sectionFor("opinion"),
  };

  return {
    signal: stories.find((story) => story.isBreaking) ?? stories[0] ?? null,
    hero,
    latest,
    categories,
    across: categories.slice(0, 6).map((category) => ({
      category,
      stories: stories.filter((story) => story.categoryId === category.id).slice(0, 1),
    })),
    sections,
    editorsPicks: stories
      .filter((story) => story.isFeatured && story.id !== hero?.id)
      .slice(0, 4),
    trending: stories.slice(0, 5),
  };
}
