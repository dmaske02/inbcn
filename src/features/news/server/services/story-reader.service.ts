import "server-only";

import { cache } from "react";
import { getTranslations } from "next-intl/server";

import { env } from "@/config/env";
import { getCategories } from "../categories.repository";
import { getStoriesByCategory, getStoryBySlug } from "../stories.repository";
import {
  buildArticleJsonLd,
  buildPublicStoryUrl,
  calculateReadTime,
  composeStoryMetadata,
  formatPublicAuthor,
  PUBLIC_STORY_FALLBACK_IMAGE,
  selectRelatedStories,
  splitStoryBody,
} from "./story-reader.model";

export type StoryReaderViewModel = Readonly<{
  story: Readonly<{
    id: string;
    title: string;
    summary: string;
    paragraphs: readonly string[];
    author: string;
    publishedAt: string;
    updatedAt: string;
    readTime: number;
    tags: readonly string[];
    category: Readonly<{ name: string; slug: string; href: string }>;
    image: Readonly<{ src: string; alt: string; caption: string | null }>;
  }>;
  related: readonly Readonly<{
    id: string;
    title: string;
    summary: string;
    href: string;
    author: string;
    publishedAt: string;
    image: Readonly<{ src: string; alt: string }>;
  }>[];
  metadata: ReturnType<typeof composeStoryMetadata>;
  jsonLd: ReturnType<typeof buildArticleJsonLd>;
}>;

export const getStoryReaderData = cache(async (locale: string, slug: string): Promise<StoryReaderViewModel | null> => {
  const story = await getStoryBySlug(locale, slug);
  if (!story) return null;

  const [categories, t] = await Promise.all([
    getCategories(locale),
    getTranslations({ locale, namespace: "storyReader" }),
  ]);
  const category = categories.find((item) => item.id === story.categoryId);
  if (!category) return null;

  const relatedDtos = selectRelatedStories(
    story.id,
    await getStoriesByCategory(locale, category.slug),
  );
  const author = formatPublicAuthor(story.externalAuthor, t("author.newsDesk"));
  const image = story.featuredMedia
    ? {
        src: story.featuredMedia.secureUrl,
        alt: story.featuredMedia.altText || story.title,
        caption: story.featuredMedia.caption,
      }
    : { src: PUBLIC_STORY_FALLBACK_IMAGE, alt: story.title, caption: null };
  const siteUrl = env.public.appUrl ?? "http://localhost:3000";
  const metadata = composeStoryMetadata({
    title: story.seoTitle || story.title,
    description: story.seoDescription || story.summary,
    canonicalUrl: story.canonicalUrl,
    siteUrl,
    locale,
    slug: story.slug,
    imageUrl: image.src,
  });

  return {
    story: {
      id: story.id,
      title: story.title,
      summary: story.summary,
      paragraphs: splitStoryBody(story.content),
      author,
      publishedAt: story.publishedAt,
      updatedAt: story.updatedAt,
      readTime: calculateReadTime(story.content),
      tags: story.seoKeywords,
      category: {
        name: category.name,
        slug: category.slug,
        href: `/${locale}#${category.slug}`,
      },
      image,
    },
    related: relatedDtos.map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      href: buildPublicStoryUrl(locale, item.slug),
      author: formatPublicAuthor(item.externalAuthor, t("author.newsDesk")),
      publishedAt: item.publishedAt,
      image: { src: PUBLIC_STORY_FALLBACK_IMAGE, alt: item.title },
    })),
    metadata,
    jsonLd: buildArticleJsonLd({
      title: story.title,
      description: story.summary,
      canonical: metadata.canonical,
      imageUrl: metadata.openGraph.images[0],
      author,
      publishedAt: story.publishedAt,
      updatedAt: story.updatedAt,
    }),
  };
});
