import { z } from "zod";

import {
  normalizeExternalUrl,
  normalizeProviderLanguage,
} from "./newsdata.model.ts";
import type { ParsedRssEntry } from "./rss.parser.ts";

const countrySchema = z.preprocess(
  (value) =>
    typeof value === "string" ? value.trim().toLocaleLowerCase("en") : value,
  z.union([z.literal(""), z.string().regex(/^[a-z]{2}$/u)]),
);

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }
  return (
    parts[0] === 0 ||
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
  );
}

export function normalizeRssFeedUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a valid RSS feed URL.");
  }
  const hostname = url.hostname.toLocaleLowerCase("en");
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    isPrivateIpv4(hostname)
  ) {
    throw new Error("Enter a public HTTP or HTTPS RSS feed URL.");
  }
  url.hash = "";
  return url.toString();
}

const feedUrlSchema = z.string().trim().min(1).transform((value, context) => {
  try {
    return normalizeRssFeedUrl(value);
  } catch (error) {
    context.addIssue({
      code: "custom",
      message:
        error instanceof Error ? error.message : "Enter a valid RSS feed URL.",
    });
    return z.NEVER;
  }
});

export const rssSourceSchema = z
  .object({
    id: z.union([z.literal(""), z.uuid()]),
    name: z.string().trim().min(1).max(160),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    feedUrl: feedUrlSchema,
    defaultLanguageId: z.uuid(),
    defaultCategoryId: z.uuid(),
    country: countrySchema,
    ingestionPriority: z.coerce.number().int().min(1).max(100),
    isActive: z.boolean(),
  })
  .transform((value) => ({
    ...value,
    country: value.country || null,
  }));

export type RssSourceInput = z.infer<typeof rssSourceSchema>;

export type NormalizedRssArticle = Readonly<{
  externalId: string | null;
  externalUrl: string | null;
  title: string;
  summary: string;
  content: string;
  externalAuthor: string | null;
  externalPublishedAt: string | null;
  externalImageUrl: string | null;
  externalImageWidth: number | null;
  externalImageHeight: number | null;
  tags: readonly string[];
  categories: readonly string[];
  languageCode: "en" | "hi" | "mr" | null;
}>;

function decodeEntities(value: string): string {
  const named: Readonly<Record<string, string>> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/giu, (match, entity: string) => {
    if (entity.startsWith("#x")) {
      const point = Number.parseInt(entity.slice(2), 16);
      return Number.isSafeInteger(point) ? String.fromCodePoint(point) : match;
    }
    if (entity.startsWith("#")) {
      const point = Number.parseInt(entity.slice(1), 10);
      return Number.isSafeInteger(point) ? String.fromCodePoint(point) : match;
    }
    return named[entity.toLocaleLowerCase("en")] ?? match;
  });
}

function cleanText(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = decodeEntities(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
      .replace(/<[^>]+>/gu, " "),
  )
    .replace(/\s+/gu, " ")
    .trim();
  return text || null;
}

function normalizeDate(value: string | null): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function normalizeCategories(values: readonly string[]): string[] {
  return [
    ...new Set(
      values
        .map((value) => cleanText(value)?.toLocaleLowerCase("en") ?? "")
        .filter(Boolean),
    ),
  ];
}

function normalizeLanguage(value: string | null): "en" | "hi" | "mr" | null {
  const primary = value?.trim().split(/[-_]/u)[0] ?? null;
  return normalizeProviderLanguage(primary);
}

export function normalizeRssEntry(entry: ParsedRssEntry): NormalizedRssArticle {
  const title = cleanText(entry.title);
  if (!title) throw new Error("RSS article headline is missing.");
  const summary = cleanText(entry.summary) ?? title;
  const categories = normalizeCategories(entry.categories);

  return {
    externalId: cleanText(entry.id),
    externalUrl: normalizeExternalUrl(entry.link),
    title,
    summary,
    content: cleanText(entry.content) ?? summary,
    externalAuthor: cleanText(entry.author),
    externalPublishedAt: normalizeDate(entry.publishedAt),
    externalImageUrl: normalizeExternalUrl(entry.imageUrl),
    externalImageWidth: entry.imageWidth,
    externalImageHeight: entry.imageHeight,
    tags: categories,
    categories,
    languageCode: normalizeLanguage(entry.language),
  };
}

export function isRssSourceReady(
  source: Readonly<{
    feedUrl: string | null;
    defaultLanguageId: string | null;
    defaultCategoryId: string | null;
    isActive: boolean;
  }>,
  references: Readonly<{
    languages: readonly Readonly<{ id: string }>[];
    categories: readonly Readonly<{ id: string; languageId: string }>[];
  }>,
): boolean {
  if (!source.feedUrl) return false;
  try {
    normalizeRssFeedUrl(source.feedUrl);
  } catch {
    return false;
  }
  if (
    !source.isActive ||
    !source.defaultLanguageId ||
    !source.defaultCategoryId ||
    !references.languages.some(
      (language) => language.id === source.defaultLanguageId,
    )
  ) {
    return false;
  }
  const category = references.categories.find(
    (item) => item.id === source.defaultCategoryId,
  );
  return category?.languageId === source.defaultLanguageId;
}
