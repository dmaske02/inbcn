export const PUBLIC_STORY_FALLBACK_IMAGE = "/images/news/story-fallback.svg";

export {
  buildPublicStoryUrl,
  calculateReadTime,
  formatPublicAuthor,
  resolvePublicStoryImage,
} from "./public-story.mjs";

import { buildPublicStoryUrl } from "./public-story.mjs";

export function selectRelatedStories<T extends { id: string }>(currentStoryId: string, stories: readonly T[], limit = 4): T[] {
  return stories.filter((story) => story.id !== currentStoryId).slice(0, limit);
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
    author: { "@type": "Organization", name: input.author },
    publisher: { "@type": "Organization", name: "INBCN" },
  } as const;
}
