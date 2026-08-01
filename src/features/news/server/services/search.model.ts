import {
  buildPublicStoryUrl,
  calculateReadTime,
  formatPublicAuthor,
  PUBLIC_STORY_FALLBACK_IMAGE,
  resolvePublicStoryImage,
} from "./public-story.mjs";

const MAX_SEARCH_QUERY_LENGTH = 160;

export const SEARCH_DATE_FILTERS = ["all", "day", "week", "month"] as const;
export type SearchDateFilter = (typeof SEARCH_DATE_FILTERS)[number];

export type SearchQueryResult =
  | Readonly<{ status: "empty"; query: "" }>
  | Readonly<{ status: "invalid"; query: "" }>
  | Readonly<{ status: "valid"; query: string }>;

export function normalizeSearchQuery(
  value: string | string[] | undefined,
): SearchQueryResult {
  if (value === undefined) return { status: "empty", query: "" };
  if (Array.isArray(value)) return { status: "invalid", query: "" };

  const query = value.replace(/\s+/gu, " ").trim();
  if (!query) return { status: "empty", query: "" };
  if (query.length > MAX_SEARCH_QUERY_LENGTH) {
    return { status: "invalid", query: "" };
  }
  return { status: "valid", query };
}

export function parseSearchPage(
  value: string | string[] | undefined,
): number | null {
  if (value === undefined) return 1;
  if (Array.isArray(value) || !/^\d+$/u.test(value)) return null;
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : null;
}

export function normalizeSearchDate(
  value: string | string[] | undefined,
): SearchDateFilter | null {
  if (value === undefined) return "all";
  if (Array.isArray(value)) return null;
  return SEARCH_DATE_FILTERS.includes(value as SearchDateFilter)
    ? (value as SearchDateFilter)
    : null;
}

export function getPublishedAfter(
  date: SearchDateFilter,
  nowIso: string,
): string | null {
  const days = date === "day" ? 1 : date === "week" ? 7 : date === "month" ? 30 : 0;
  if (days === 0) return null;
  return new Date(Date.parse(nowIso) - days * 24 * 60 * 60 * 1000).toISOString();
}

export function buildSearchHref(input: Readonly<{
  locale: string;
  query: string;
  category?: string | null;
  date: SearchDateFilter;
  page: number;
}>): string {
  const params = new URLSearchParams();
  if (input.query) params.set("q", input.query);
  if (input.category) params.set("category", input.category);
  if (input.date !== "all") params.set("date", input.date);
  if (input.page > 1) params.set("page", String(input.page));
  const queryString = params.toString();
  return `/${input.locale}/search${queryString ? `?${queryString}` : ""}`;
}

export type SearchPaginationModel = Readonly<{
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  previousPage: number | null;
  nextPage: number | null;
}>;

export function createSearchPagination(input: Readonly<{
  page: number;
  pageSize: number;
  total: number;
}>): SearchPaginationModel {
  const totalPages = Math.max(1, Math.ceil(input.total / input.pageSize));
  return {
    page: input.page,
    pageSize: input.pageSize,
    total: input.total,
    totalPages,
    previousPage: input.page > 1 && input.page <= totalPages ? input.page - 1 : null,
    nextPage: input.page < totalPages ? input.page + 1 : null,
  };
}

export function resolveSearchPageStatus(input: Readonly<{
  page: number;
  totalPages: number;
}>): "ready" | "out-of-range" {
  return Number.isInteger(input.page)
    && input.page > 0
    && input.page <= input.totalPages
    ? "ready"
    : "out-of-range";
}

export type SearchModelCategory = Readonly<{
  id: string;
  name: string;
  slug: string;
}>;

export type SearchModelStory = Readonly<{
  id: string;
  categoryId: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  externalAuthor: string | null;
  publishedAt: string;
  featuredMedia: Readonly<{
    publicId: string;
    secureUrl: string;
    altText: string | null;
  }> | null;
}>;

export type SearchResultCardModel = Readonly<{
  id: string;
  title: string;
  summary: string;
  href: string;
  category: string;
  author: string;
  publishedAt: string;
  readTime: number;
  image: Readonly<{ src: string; alt: string }>;
}>;

export type SearchMetadataModel = Readonly<{
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

export function composeSearchMetadata(input: Readonly<{
  title: string;
  description: string;
  siteUrl: string;
  locale: string;
  query: string;
  category?: string | null;
  date: SearchDateFilter;
  page: number;
  imageUrl: string;
}>): SearchMetadataModel {
  const canonical = absoluteUrl(
    input.siteUrl,
    buildSearchHref({
      locale: input.locale,
      query: input.query,
      category: input.category,
      date: input.date,
      page: input.page,
    }),
  );
  const image = absoluteUrl(input.siteUrl, input.imageUrl);

  return {
    title: input.title,
    description: input.description,
    canonical,
    openGraph: {
      title: input.title,
      description: input.description,
      url: canonical,
      type: "website",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
      images: [image],
    },
  };
}

export function buildSearchJsonLd(input: Readonly<{
  name: string;
  description: string;
  canonical: string;
  siteUrl: string;
  stories: readonly Readonly<{ title: string; href: string }>[];
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

export type SearchPageModel = Readonly<{
  query: string;
  category: string | null;
  date: SearchDateFilter;
  results: readonly SearchResultCardModel[];
  resultCount: number;
  pagination: SearchPaginationModel;
  emptyState: Readonly<{ title: string; description: string }> | null;
  metadata: SearchMetadataModel;
  jsonLd: ReturnType<typeof buildSearchJsonLd>;
}>;

export function composeSearchPageModel(input: Readonly<{
  locale: string;
  query: string;
  category: string | null;
  date: SearchDateFilter;
  page: number;
  pageSize: number;
  total: number;
  stories: readonly SearchModelStory[];
  categories: readonly SearchModelCategory[];
  siteUrl: string;
  cloudName?: string;
  labels: Readonly<{
    newsDesk: string;
    title: string;
    description: string;
    emptyTitle: string;
    emptyDescription: string;
    categoryFallback?: string;
  }>;
}>): SearchPageModel {
  const categories = new Map(input.categories.map((category) => [category.id, category]));
  const results = input.stories.map((story): SearchResultCardModel => ({
    id: story.id,
    title: story.title,
    summary: story.summary,
    href: buildPublicStoryUrl(input.locale, story.slug),
    category: categories.get(story.categoryId)?.name
      ?? input.labels.categoryFallback
      ?? "News",
    author: formatPublicAuthor(story.externalAuthor, input.labels.newsDesk),
    publishedAt: story.publishedAt,
    readTime: calculateReadTime(story.content),
    image: resolvePublicStoryImage(story.featuredMedia, input.cloudName, story.title),
  }));
  const pagination = createSearchPagination({
    page: input.page,
    pageSize: input.pageSize,
    total: input.total,
  });
  const metadata = composeSearchMetadata({
    title: input.labels.title,
    description: input.labels.description,
    siteUrl: input.siteUrl,
    locale: input.locale,
    query: input.query,
    category: input.category,
    date: input.date,
    page: input.page,
    imageUrl: results[0]?.image.src ?? PUBLIC_STORY_FALLBACK_IMAGE,
  });

  return {
    query: input.query,
    category: input.category,
    date: input.date,
    results,
    resultCount: input.total,
    pagination,
    emptyState: input.total === 0
      ? { title: input.labels.emptyTitle, description: input.labels.emptyDescription }
      : null,
    metadata,
    jsonLd: buildSearchJsonLd({
      name: input.labels.title,
      description: input.labels.description,
      canonical: metadata.canonical,
      siteUrl: input.siteUrl,
      stories: results,
    }),
  };
}
