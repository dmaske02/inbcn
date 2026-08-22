import "server-only";

import { cache } from "react";
import { getTranslations } from "next-intl/server";

import { env } from "@/config/env";
import { getCategories } from "../categories.repository";
import { getStoriesByCategory, getStoriesByLanguage, getStoryBySlug } from "../stories.repository";
import type { StorySummaryDto } from "../dto";
import {
  composePublicReporterMetadata,
  type PublicReporter,
} from "@/features/reporters/public-reporter.model";
import {
  buildArticleJsonLd,
  buildPublicStoryUrl,
  calculateReadTime,
  composeArticleSidebar,
  composeInlineRelated,
  composeStoryMetadata,
  formatPublicAuthor,
  resolvePublicStoryImage,
  selectAdjacentStories,
  selectRelatedStories,
  splitStoryBody,
} from "./story-reader.model";

type StoryReaderCard = Readonly<{
  id: string;
  title: string;
  summary: string;
  href: string;
  author: string;
  publishedAt: string;
  categoryName: string | null;
  image: Readonly<{ src: string; alt: string; unoptimized: boolean; width: number | null; height: number | null; aspectRatio: number | null }>;
}>;

export type StoryReaderViewModel = Readonly<{
  story: Readonly<{
    id: string;
    title: string;
    summary: string;
    paragraphs: readonly string[];
    author: string;
    reporter: PublicReporter | null;
    publishedAt: string;
    updatedAt: string;
    readTime: number;
    tags: readonly string[];
    category: Readonly<{ name: string; slug: string; href: string }>;
    image: Readonly<{
      src: string;
      alt: string;
      unoptimized: boolean;
      width: number | null;
      height: number | null;
      aspectRatio: number | null;
      caption: string | null;
    }>;
  }>;
  related: readonly StoryReaderCard[];
  inlineRelated: readonly Readonly<{ afterParagraph: number; story: StoryReaderCard }>[];
  previous: StoryReaderCard | null;
  next: StoryReaderCard | null;
  sidebar: Readonly<{
    trending: readonly StoryReaderCard[];
    latest: readonly StoryReaderCard[];
    editorPicks: readonly StoryReaderCard[];
    breaking: readonly StoryReaderCard[];
  }>;
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

  const [sameCategoryStories, latestStories] = await Promise.all([
    getStoriesByCategory(locale, category.slug),
    getStoriesByLanguage(locale),
  ]);
  const relatedDtos = selectRelatedStories(story.id, sameCategoryStories, latestStories);
  const author = story.reporter?.legalName
    ?? formatPublicAuthor(story.externalAuthor, t("author.newsDesk"));
  const categoriesById = new Map(categories.map((item) => [item.id, item]));
  const toCard = (item: StorySummaryDto): StoryReaderCard => ({
    id: item.id,
    title: item.title,
    summary: item.summary,
    href: buildPublicStoryUrl(locale, item.slug),
    author: formatPublicAuthor(item.externalAuthor, t("author.newsDesk")),
    publishedAt: item.publishedAt,
    categoryName: categoriesById.get(item.categoryId)?.name ?? null,
    image: resolvePublicStoryImage(
      item.featuredMedia,
      item.externalImageUrl,
      env.public.cloudinaryCloudName,
      item.title,
      item.externalImageWidth,
      item.externalImageHeight,
    ),
  });
  const paragraphs = splitStoryBody(story.content);
  const readTime = calculateReadTime(story.content);
  const relatedCards = relatedDtos.map(toCard);
  const inlineRelated = composeInlineRelated(paragraphs.length, relatedCards);
  const inlineIds = new Set(inlineRelated.map(({ story: item }) => item.id));
  const assignedIds = new Set(relatedDtos.map(({ id }) => id));
  const adjacent = selectAdjacentStories(story.id, sameCategoryStories, latestStories, assignedIds);
  if (adjacent.previous) assignedIds.add(adjacent.previous.id);
  if (adjacent.next) assignedIds.add(adjacent.next.id);
  const sidebarDtos = composeArticleSidebar(story.id, latestStories, 3, assignedIds);
  const resolvedImage = resolvePublicStoryImage(
    story.featuredMedia,
    story.externalImageUrl,
    env.public.cloudinaryCloudName,
    story.title,
    story.externalImageWidth,
    story.externalImageHeight,
  );
  const image = {
    ...resolvedImage,
    caption: story.featuredMedia?.caption ?? null,
  };
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
  const reporterMetadata = composePublicReporterMetadata({
    reporter: story.reporter,
    locale,
    siteUrl,
  });

  return {
    story: {
      id: story.id,
      title: story.title,
      summary: story.summary,
      paragraphs,
      author,
      reporter: story.reporter,
      publishedAt: story.publishedAt,
      updatedAt: story.updatedAt,
      readTime,
      tags: story.seoKeywords,
      category: {
        name: category.name,
        slug: category.slug,
        href: `/${locale}#${category.slug}`,
      },
      image,
    },
    related: relatedCards.filter(({ id }) => !inlineIds.has(id)),
    inlineRelated,
    previous: adjacent.previous ? toCard(adjacent.previous) : null,
    next: adjacent.next ? toCard(adjacent.next) : null,
    sidebar: {
      trending: sidebarDtos.trending.map(toCard),
      latest: sidebarDtos.latest.map(toCard),
      editorPicks: sidebarDtos.editorPicks.map(toCard),
      breaking: sidebarDtos.breaking.map(toCard),
    },
    metadata,
    jsonLd: buildArticleJsonLd({
      title: story.title,
      description: story.summary,
      canonical: metadata.canonical,
      imageUrl: metadata.openGraph.images[0],
      author,
      reporter: story.reporter && reporterMetadata
        ? {
            legalName: story.reporter.legalName,
            profileUrl: reporterMetadata.canonical,
            photoUrl: story.reporter.photoUrl,
          }
        : null,
      publishedAt: story.publishedAt,
      updatedAt: story.updatedAt,
      readTime,
    }),
  };
});
