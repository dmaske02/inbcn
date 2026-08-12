import { z } from "zod";

const nullableText = z.string().nullable().optional();
const nullableTextList = z.array(z.string()).nullable().optional();
const nullableTextOrList = z
  .union([z.string(), z.array(z.string())])
  .nullable()
  .optional();

const providerArticleSchema = z
  .object({
    article_id: nullableText,
    title: nullableText,
    link: nullableText,
    description: nullableText,
    content: nullableText,
    pubDate: nullableText,
    pubDateTZ: nullableText,
    image_url: nullableText,
    creator: z.union([z.string(), z.array(z.string())]).nullable().optional(),
    keywords: nullableTextList,
    ai_tag: nullableTextOrList,
    category: nullableTextList,
    language: nullableText,
    source_id: nullableText,
    source_name: nullableText,
    source_url: nullableText,
  })
  .passthrough();

const TRACKING_PARAMETERS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
]);

const LANGUAGE_CODES: Readonly<Record<string, "en" | "hi" | "mr">> = {
  en: "en",
  english: "en",
  hi: "hi",
  hindi: "hi",
  mr: "mr",
  marathi: "mr",
};

const CATEGORY_SLUG_BY_PROVIDER_LABEL: Readonly<Record<string, string>> = {
  india: "national",
  national: "national",
  "राष्ट्रीय": "national",
  "महाराष्ट्र": "national",
  "मुंबई": "national",
  world: "world",
  "विश्व": "world",
  "जागतिक": "world",
  politics: "politics",
  "राजनीति": "politics",
  "राजकारण": "politics",
  business: "business",
  "व्यापार": "business",
  "व्यवसाय": "business",
  technology: "technology",
  tech: "technology",
  "तकनीक": "technology",
  "प्रौद्योगिकी": "technology",
  "तंत्रज्ञान": "technology",
  sports: "sports",
  sport: "sports",
  "खेल": "sports",
  "क्रीडा": "sports",
  entertainment: "entertainment",
  "मनोरंजन": "entertainment",
  health: "health",
  "स्वास्थ्य": "health",
  "आरोग्य": "health",
  lifestyle: "lifestyle",
  "जीवनशैली": "lifestyle",
  education: "education",
  "शिक्षा": "education",
  "शिक्षण": "education",
  science: "science",
  "विज्ञान": "science",
  crime: "crime",
  "अपराध": "crime",
  "गुन्हे": "crime",
  "क्राईम": "crime",
};

const countrySchema = z.preprocess(
  (value) =>
    typeof value === "string" ? value.trim().toLocaleLowerCase("en") : value,
  z.union([z.literal(""), z.string().regex(/^[a-z]{2}$/u)]),
);

export const newsDataSourceSchema = z
  .object({
    id: z.union([z.literal(""), z.uuid()]),
    name: z.string().trim().min(1).max(160),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
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

export type NewsDataSourceInput = z.infer<typeof newsDataSourceSchema>;

export function canManageNewsData(role: string): boolean {
  return role === "editor" || role === "admin";
}

export function isNewsDataSourceReady(
  source: Readonly<{
    defaultLanguageId: string | null;
    defaultCategoryId: string | null;
    isActive: boolean;
  }>,
  references: Readonly<{
    languages: readonly Readonly<{ id: string }>[];
    categories: readonly Readonly<{ id: string; languageId: string }>[];
  }>,
): boolean {
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

const importDetailSchema = z.object({
  externalId: z.string().nullable(),
  title: z.string(),
  outcome: z.enum(["imported", "skipped", "duplicate", "failed"]),
  reason: z.string(),
});

const importRunMetadataSchema = z.object({
  skipped: z.number().int().nonnegative().optional().default(0),
  duplicates: z.number().int().nonnegative().optional().default(0),
  details: z.array(importDetailSchema).optional().default([]),
  quota: z
    .object({
      apiCreditsRemaining: z.number().int().nonnegative().nullable().optional(),
      windowRemaining: z.number().int().nonnegative().nullable().optional(),
    })
    .nullable()
    .optional(),
});

export type ImportRunMetadata = Readonly<{
  skipped: number;
  duplicates: number;
  details: readonly z.infer<typeof importDetailSchema>[];
  quota: Readonly<{
    apiCreditsRemaining: number | null;
    windowRemaining: number | null;
  }> | null;
}>;

export function parseImportRunMetadata(input: unknown): ImportRunMetadata {
  const parsed = importRunMetadataSchema.safeParse(input);
  if (!parsed.success) {
    return { skipped: 0, duplicates: 0, details: [], quota: null };
  }
  return {
    skipped: parsed.data.skipped,
    duplicates: parsed.data.duplicates,
    details: parsed.data.details,
    quota: parsed.data.quota
      ? {
          apiCreditsRemaining:
            parsed.data.quota.apiCreditsRemaining ?? null,
          windowRemaining: parsed.data.quota.windowRemaining ?? null,
        }
      : null,
  };
}

export type NormalizedNewsDataArticle = Readonly<{
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
  sourceId: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
}>;

function cleanText(value: string | null | undefined): string | null {
  const text = value?.replace(/\s+/gu, " ").trim();
  return text || null;
}

function isPlanGatedValue(value: string): boolean {
  return /^only available in\b.*\bplans?$/iu.test(value.trim());
}

function normalizeList(values: readonly string[] | null | undefined): string[] {
  return [
    ...new Set(
      (values ?? [])
        .map((value) => cleanText(value)?.toLocaleLowerCase("en") ?? "")
        .filter((value) => Boolean(value) && !isPlanGatedValue(value)),
    ),
  ];
}

function asTextList(
  value: string | readonly string[] | null | undefined,
): readonly string[] {
  if (!value) return [];
  return typeof value === "string" ? [value] : value;
}

function normalizeProviderDate(
  value: string | null | undefined,
  timezone: string | null | undefined,
): string | null {
  const candidate = cleanText(value);
  if (!candidate) return null;

  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/iu.test(candidate);
  const normalized = candidate.includes("T")
    ? candidate
    : candidate.replace(" ", "T");
  const providerTimezone = cleanText(timezone)?.toLocaleUpperCase("en");
  const offsetMatch = providerTimezone?.match(
    /^(?:UTC|GMT)?([+-])(\d{2}):?(\d{2})$/u,
  );
  const suffix =
    providerTimezone === "UTC" || providerTimezone === "GMT"
      ? "Z"
      : offsetMatch
        ? `${offsetMatch[1]}${offsetMatch[2]}:${offsetMatch[3]}`
        : "Z";
  const timestamp = Date.parse(hasTimezone ? normalized : `${normalized}${suffix}`);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

export function normalizeExternalUrl(
  value: string | null | undefined,
): string | null {
  const candidate = cleanText(value);
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    url.hostname = url.hostname.toLocaleLowerCase("en");
    for (const name of [...url.searchParams.keys()]) {
      if (name.toLocaleLowerCase("en").startsWith("utm_") || TRACKING_PARAMETERS.has(name.toLocaleLowerCase("en"))) {
        url.searchParams.delete(name);
      }
    }
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/u, "");
    return url.toString().replace(/\?$/u, "");
  } catch {
    return null;
  }
}

export function normalizeProviderLanguage(
  value: string | null | undefined,
): "en" | "hi" | "mr" | null {
  const language = cleanText(value)?.toLocaleLowerCase("en");
  return language ? (LANGUAGE_CODES[language] ?? null) : null;
}

export function selectProviderCategory(
  providerCategories: readonly string[],
  supportedCategorySlugs: readonly string[],
  fallback: string,
): string {
  const supported = new Set(
    supportedCategorySlugs.map((value) => value.toLocaleLowerCase("en")),
  );
  return (
    normalizeList(providerCategories)
      .map((category) => CATEGORY_SLUG_BY_PROVIDER_LABEL[category] ?? category)
      .find((category) => supported.has(category)) ??
    fallback
  );
}

export function createExternalFingerprint(title: string, source: string): string {
  const normalize = (value: string) =>
    value
      .normalize("NFKC")
      .toLocaleLowerCase("en")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/gu, " ")
      .trim();
  return `${normalize(source)}::${normalize(title)}`;
}

export function normalizeNewsDataArticle(
  input: unknown,
): NormalizedNewsDataArticle {
  const article = providerArticleSchema.parse(input);
  const title = cleanText(article.title);
  if (!title) throw new Error("NewsData article headline is missing.");

  const summary = cleanText(article.description) ?? title;
  const providerContent = cleanText(article.content);
  const content =
    providerContent && !isPlanGatedValue(providerContent)
      ? providerContent
      : summary;
  const creators = Array.isArray(article.creator)
    ? article.creator
    : article.creator
      ? [article.creator]
      : [];

  return {
    externalId: cleanText(article.article_id),
    externalUrl: normalizeExternalUrl(article.link),
    title,
    summary,
    content,
    externalAuthor: creators.map(cleanText).filter(Boolean).join(", ") || null,
    externalPublishedAt: normalizeProviderDate(article.pubDate, article.pubDateTZ),
    externalImageUrl: normalizeExternalUrl(article.image_url),
    externalImageWidth: null,
    externalImageHeight: null,
    tags: normalizeList([
      ...(article.keywords ?? []),
      ...asTextList(article.ai_tag),
    ]),
    categories: normalizeList(article.category),
    languageCode: normalizeProviderLanguage(article.language),
    sourceId: cleanText(article.source_id),
    sourceName: cleanText(article.source_name),
    sourceUrl: normalizeExternalUrl(article.source_url),
  };
}
