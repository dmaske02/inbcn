import {
  buildPublicStoryUrl,
  calculateReadTime,
  formatPublicAuthor,
  PUBLIC_STORY_FALLBACK_IMAGE,
  resolvePublicStoryImage,
} from "./public-story.mjs";

export type CategoryModelCategory = Readonly<{
  id: string;
  name: string;
  slug: string;
  description: string | null;
}>;

export type CategoryModelStory = Readonly<{
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  externalAuthor: string | null;
  publishedAt: string;
  isFeatured: boolean;
  externalImageUrl: string | null;
  featuredMedia: Readonly<{
    publicId: string;
    secureUrl: string;
    altText: string | null;
  }> | null;
}>;

export type CategoryStoryCardModel = Readonly<{
  id: string;
  title: string;
  summary: string;
  href: string;
  author: string;
  publishedAt: string;
  readTime: number;
  image: Readonly<{ src: string; alt: string; unoptimized: boolean }>;
}>;

export type CategoryPaginationModel = Readonly<{
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  offset: number;
  excludeStoryId: string | null;
  outOfRange: boolean;
  previousPage: number | null;
  nextPage: number | null;
}>;

export function selectCategoryHero<T>(
  featuredCandidates: readonly T[],
  latestCandidates: readonly T[],
): T | null {
  return featuredCandidates[0] ?? latestCandidates[0] ?? null;
}

export function resolveCategoryPageStatus(input: Readonly<{
  categoryExists: boolean;
  page: number;
  totalPages: number;
}>): "ready" | "not-found" | "out-of-range" {
  if (!input.categoryExists) return "not-found";
  if (!Number.isInteger(input.page) || input.page < 1 || input.page > input.totalPages) {
    return "out-of-range";
  }
  return "ready";
}

export function createCategoryPagination(input: Readonly<{
  page: number;
  pageSize: number;
  total: number;
  heroId: string | null;
}>): CategoryPaginationModel {
  const totalPages = Math.max(1, Math.ceil(input.total / input.pageSize));
  const outOfRange = input.page < 1 || input.page > totalPages;

  return {
    page: input.page,
    pageSize: input.pageSize,
    total: input.total,
    totalPages,
    offset: (input.page - 1) * input.pageSize,
    excludeStoryId: input.heroId,
    outOfRange,
    previousPage: input.page > 1 && !outOfRange ? input.page - 1 : null,
    nextPage: input.page < totalPages && !outOfRange ? input.page + 1 : null,
  };
}

function toCard(
  story: CategoryModelStory,
  locale: string,
  newsDeskLabel: string,
  cloudName?: string,
): CategoryStoryCardModel {
  return {
    id: story.id,
    title: story.title,
    summary: story.summary,
    href: buildPublicStoryUrl(locale, story.slug),
    author: formatPublicAuthor(story.externalAuthor, newsDeskLabel),
    publishedAt: story.publishedAt,
    readTime: calculateReadTime(story.content),
    image: resolvePublicStoryImage(
      story.featuredMedia,
      story.externalImageUrl,
      cloudName,
      story.title,
    ),
  };
}

export type CategoryMetadataModel = Readonly<{
  title: string;
  description: string;
  canonical: string;
  openGraph: Readonly<{
    title: string;
    description: string;
    url: string;
    type: "website";
    images: readonly string[];
  }>;
  twitter: Readonly<{
    card: "summary_large_image";
    title: string;
    description: string;
    images: readonly string[];
  }>;
}>;

function absoluteUrl(siteUrl: string, value: string): string {
  return new URL(value, `${siteUrl.replace(/\/$/u, "")}/`).toString();
}

export function composeCategoryMetadata(input: Readonly<{
  categoryName: string;
  description: string;
  siteUrl: string;
  locale: string;
  slug: string;
  page: number;
  pageLabel: string;
  imageUrl: string;
}>): CategoryMetadataModel {
  const pageSuffix = input.page > 1 ? `?page=${input.page}` : "";
  const canonical = absoluteUrl(
    input.siteUrl,
    `/${input.locale}/category/${input.slug}${pageSuffix}`,
  );
  const title = input.page > 1
    ? `${input.categoryName} - ${input.pageLabel} ${input.page}`
    : input.categoryName;
  const image = absoluteUrl(input.siteUrl, input.imageUrl);

  return {
    title,
    description: input.description,
    canonical,
    openGraph: {
      title,
      description: input.description,
      url: canonical,
      type: "website",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: input.description,
      images: [image],
    },
  };
}

export function buildCategoryJsonLd(input: Readonly<{
  name: string;
  description: string;
  canonical: string;
  stories: readonly Readonly<{ title: string; href: string }>[];
  siteUrl: string;
}>) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: input.name,
    description: input.description,
    url: input.canonical,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: input.stories.map((story, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: story.title,
        url: absoluteUrl(input.siteUrl, story.href),
      })),
    },
  } as const;
}

export type CategoryPageModel = Readonly<{
  category: CategoryModelCategory;
  hero: CategoryStoryCardModel | null;
  stories: readonly CategoryStoryCardModel[];
  storyCount: number;
  pagination: CategoryPaginationModel;
  emptyState: Readonly<{ title: string; description: string }> | null;
  relatedCategories: readonly Readonly<{ name: string; href: string }>[];
  metadata: CategoryMetadataModel;
  jsonLd: ReturnType<typeof buildCategoryJsonLd>;
}>;

export function composeCategoryPageModel(input: Readonly<{
  locale: string;
  category: CategoryModelCategory;
  hero: CategoryModelStory | null;
  stories: readonly CategoryModelStory[];
  relatedCategories: readonly Readonly<{ name: string; slug: string }>[];
  page: number;
  pageSize: number;
  total: number;
  siteUrl: string;
  labels: Readonly<{
    newsDesk: string;
    emptyTitle: string;
    emptyDescription: string;
    pageLabel?: string;
  }>;
  description?: string;
  cloudName?: string;
}>): CategoryPageModel {
  const pagination = createCategoryPagination({
    page: input.page,
    pageSize: input.pageSize,
    total: input.total,
    heroId: input.hero?.id ?? null,
  });
  const hero = input.page === 1 && input.hero
    ? toCard(input.hero, input.locale, input.labels.newsDesk, input.cloudName)
    : null;
  const stories = input.stories.map((story) =>
    toCard(story, input.locale, input.labels.newsDesk, input.cloudName));
  const description = input.category.description
    ?? input.description
    ?? input.labels.emptyDescription;
  const metadata = composeCategoryMetadata({
    categoryName: input.category.name,
    description,
    siteUrl: input.siteUrl,
    locale: input.locale,
    slug: input.category.slug,
    page: input.page,
    pageLabel: input.labels.pageLabel ?? "Page",
    imageUrl: hero?.image.src ?? stories[0]?.image.src ?? PUBLIC_STORY_FALLBACK_IMAGE,
  });
  const visibleStories = hero ? [hero, ...stories] : stories;

  return {
    category: input.category,
    hero,
    stories,
    storyCount: input.total + (input.hero ? 1 : 0),
    pagination,
    emptyState: input.hero || stories.length > 0
      ? null
      : { title: input.labels.emptyTitle, description: input.labels.emptyDescription },
    relatedCategories: input.relatedCategories.map((category) => ({
      name: category.name,
      href: `/${input.locale}/category/${category.slug}`,
    })),
    metadata,
    jsonLd: buildCategoryJsonLd({
      name: input.category.name,
      description,
      canonical: metadata.canonical,
      stories: visibleStories,
      siteUrl: input.siteUrl,
    }),
  };
}
