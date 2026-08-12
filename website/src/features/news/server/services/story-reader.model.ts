export const PUBLIC_STORY_FALLBACK_IMAGE = "/images/news/story-fallback.svg";

export {
  buildPublicStoryUrl,
  calculateReadTime,
  formatPublicAuthor,
  getHeroImagePresentation,
  resolvePublicStoryImage,
} from "./public-story.mjs";

import { buildPublicStoryUrl } from "./public-story.mjs";

export function selectRelatedStories<T extends { id: string }>(
  currentStoryId: string,
  preferred: readonly T[],
  fallback: readonly T[] = [],
  limit = 4,
): T[] {
  const selected: T[] = [];
  const seen = new Set([currentStoryId]);
  for (const story of [...preferred, ...fallback]) {
    if (selected.length >= limit) break;
    if (!seen.has(story.id)) {
      seen.add(story.id);
      selected.push(story);
    }
  }
  return selected;
}

export function composeInlineRelated<T>(
  paragraphCount: number,
  related: readonly T[],
  interval = 6,
): ReadonlyArray<Readonly<{ afterParagraph: number; story: T }>> {
  if (paragraphCount <= 0 || related.length === 0 || interval <= 0) return [];
  const placementCount = Math.min(related.length, Math.max(1, Math.floor(paragraphCount / interval)));
  return related.slice(0, placementCount).map((story, index) => ({
    afterParagraph: paragraphCount < interval ? paragraphCount : interval * (index + 1),
    story,
  }));
}

export function selectAdjacentStories<T extends { id: string; publishedAt: string }>(
  currentStoryId: string,
  preferred: readonly T[],
  fallback: readonly T[] = [],
  excludedIds: ReadonlySet<string> = new Set(),
): Readonly<{ previous: T | null; next: T | null }> {
  const adjacent = (stories: readonly T[]) => {
    const sorted = stories
      .filter(({ id }) => id === currentStoryId || !excludedIds.has(id))
      .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));
    const currentIndex = sorted.findIndex(({ id }) => id === currentStoryId);
    return currentIndex < 0
      ? { previous: null, next: null }
      : { previous: sorted[currentIndex + 1] ?? null, next: sorted[currentIndex - 1] ?? null };
  };
  const preferredAdjacent = adjacent(preferred);
  const fallbackAdjacent = adjacent(fallback);
  return {
    previous: preferredAdjacent.previous ?? fallbackAdjacent.previous,
    next: preferredAdjacent.next ?? fallbackAdjacent.next,
  };
}

export function composeArticleSidebar<
  T extends { id: string; publishedAt: string; isBreaking: boolean; isFeatured: boolean },
>(currentStoryId: string, storyDtos: readonly T[], limit = 3, excludedIds: ReadonlySet<string> = new Set()) {
  const stories = [...storyDtos]
    .filter(({ id }) => id !== currentStoryId && !excludedIds.has(id))
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));
  const assigned = new Set<string>();
  const allocate = (predicate: (story: T) => boolean) => {
    const selected: T[] = [];
    for (const story of stories) {
      if (selected.length >= limit) break;
      if (!assigned.has(story.id) && predicate(story)) {
        assigned.add(story.id);
        selected.push(story);
      }
    }
    return selected;
  };
  return {
    breaking: allocate((story) => story.isBreaking),
    editorPicks: allocate((story) => story.isFeatured),
    latest: allocate(() => true),
    trending: allocate(() => true),
  } as const;
}

export function splitStoryBody(content: string): string[] {
  return content.split(/\n+/u).map((paragraph) => paragraph.trim()).filter(Boolean);
}

function absoluteUrl(siteUrl: string, value: string): string {
  return new URL(value, `${siteUrl.replace(/\/$/u, "")}/`).toString();
}

export type StoryMetadataModel = Readonly<{
  title: string;
  description: string;
  canonical: string;
  openGraph: Readonly<{ title: string; description: string; url: string; type: "article"; images: readonly string[] }>;
  twitter: Readonly<{ card: "summary_large_image"; title: string; description: string; images: readonly string[] }>;
}>;

export function composeStoryMetadata(input: Readonly<{
  title: string;
  description: string;
  canonicalUrl: string | null;
  siteUrl: string;
  locale: string;
  slug: string;
  imageUrl: string;
}>): StoryMetadataModel {
  const canonical = input.canonicalUrl || absoluteUrl(input.siteUrl, buildPublicStoryUrl(input.locale, input.slug));
  const image = absoluteUrl(input.siteUrl, input.imageUrl);
  return {
    title: input.title,
    description: input.description,
    canonical,
    openGraph: { title: input.title, description: input.description, url: canonical, type: "article", images: [image] },
    twitter: { card: "summary_large_image", title: input.title, description: input.description, images: [image] },
  };
}

export function buildArticleJsonLd(input: Readonly<{
  title: string;
  description: string;
  canonical: string;
  imageUrl: string;
  author: string;
  publishedAt: string;
  updatedAt: string;
  readTime: number;
}>) {
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: input.title,
    description: input.description,
    mainEntityOfPage: input.canonical,
    image: [input.imageUrl],
    datePublished: input.publishedAt,
    dateModified: input.updatedAt,
    timeRequired: `PT${input.readTime}M`,
    author: { "@type": "Organization", name: input.author },
    publisher: { "@type": "Organization", name: "INBCN" },
  } as const;
}
