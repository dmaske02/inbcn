import { generateStorySlug } from "../stories/story.model.ts";
import {
  createExternalFingerprint,
  normalizeExternalUrl,
  normalizeNewsDataArticle,
  selectProviderCategory,
} from "./newsdata.model.ts";

export type ImportSource = Readonly<{
  id: string;
  name: string;
  defaultLanguageId: string | null;
  defaultLanguageCode: string | null;
  defaultCategoryId: string | null;
  defaultCategorySlug: string | null;
  country: string | null;
  isActive: boolean;
}>;

export type ImportedStoryIdentity = Readonly<{
  externalId: string | null;
  externalUrl: string | null;
  title: string;
}>;

export type ImportedStoryDraft = Readonly<{
  language_id: string;
  category_id: string;
  source_id: string;
  created_by: string;
  story_type: "external_article";
  status: "draft";
  slug: string;
  title: string;
  summary: string;
  content: string;
  external_id: string | null;
  external_url: string | null;
  external_author: string | null;
  external_published_at: string | null;
  external_image_url: string | null;
  featured_media_id: null;
  seo_keywords: readonly string[];
  canonical_url: null;
  is_featured: false;
  is_breaking: false;
  is_sponsored: false;
  submitted_at: null;
  approved_by: null;
  approved_at: null;
  rejected_at: null;
  rejection_reason: null;
  scheduled_at: null;
  published_at: null;
}>;

export type ImportCounts = Readonly<{
  fetched: number;
  imported: number;
  skipped: number;
  duplicates: number;
  failed: number;
}>;

export type ImportDetail = Readonly<{
  externalId: string | null;
  title: string;
  outcome: "imported" | "skipped" | "duplicate" | "failed";
  reason: string;
}>;

type Quota = Readonly<{
  apiCreditsRemaining: number | null;
  windowLimit: number | null;
  windowRemaining: number | null;
  windowResetAt: string | null;
}>;

export type ImportCompletion = Readonly<{
  status: "completed" | "partial" | "failed";
  counts: ImportCounts;
  details: readonly ImportDetail[];
  nextPage: string | null;
  quota: Quota | null;
  errorMessage: string | null;
  completedAt: string;
}>;

type ImportDependencies = Readonly<{
  createRun(input: Readonly<{ sourceId: string; actorId: string; startedAt: string }>): Promise<Readonly<{ id: string }>>;
  completeRun(id: string, result: ImportCompletion): Promise<void>;
  fetchPage(query: Readonly<{ country: string | null; language: string | null; page: string | null; size: number }>): Promise<Readonly<{
    totalResults: number;
    articles: readonly unknown[];
    nextPage: string | null;
    quota: Quota;
  }>>;
  getExistingIdentities(sourceId: string): Promise<readonly ImportedStoryIdentity[]>;
  slugExists(languageId: string, slug: string): Promise<boolean>;
  insertDraft(draft: ImportedStoryDraft): Promise<Readonly<{ status: "created"; id: string } | { status: "duplicate" }>>;
  now(): string;
}>;

export type ImportOperationInput = Readonly<{
  actorId: string;
  source: ImportSource;
  categories: readonly Readonly<{ id: string; slug: string }>[];
}>;

export type ImportOperationResult = Readonly<{
  runId: string;
  status: "completed" | "partial";
  counts: ImportCounts;
  details: readonly ImportDetail[];
  quota: Quota;
}>;

export class NewsDataImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NewsDataImportError";
  }
}

function assertSourceReady(input: ImportOperationInput): asserts input is ImportOperationInput & {
  source: ImportSource & {
    defaultLanguageId: string;
    defaultLanguageCode: string;
    defaultCategoryId: string;
    defaultCategorySlug: string;
  };
} {
  if (!input.source.isActive) {
    throw new NewsDataImportError("An active NewsData source is required.");
  }
  if (
    !input.source.defaultLanguageId ||
    !input.source.defaultLanguageCode ||
    !input.source.defaultCategoryId ||
    !input.source.defaultCategorySlug
  ) {
    throw new NewsDataImportError(
      "Configure the source language and category before importing.",
    );
  }
}

async function uniqueSlug(
  title: string,
  languageId: string,
  externalId: string | null,
  sequence: number,
  exists: ImportDependencies["slugExists"],
): Promise<string> {
  const base = generateStorySlug(title);
  if (!(await exists(languageId, base))) return base;
  const suffix = (externalId ?? String(sequence + 1))
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/gu, "")
    .slice(-8) || String(sequence + 1);
  let candidate = `${base}-${suffix}`;
  let attempt = 2;
  while (await exists(languageId, candidate)) {
    candidate = `${base}-${suffix}-${attempt}`;
    attempt += 1;
  }
  return candidate;
}

function emptyCounts(): ImportCounts {
  return { fetched: 0, imported: 0, skipped: 0, duplicates: 0, failed: 0 };
}

export async function runNewsDataImportOperation(
  input: ImportOperationInput,
  dependencies: ImportDependencies,
): Promise<ImportOperationResult> {
  assertSourceReady(input);
  const startedAt = dependencies.now();
  const run = await dependencies.createRun({
    sourceId: input.source.id,
    actorId: input.actorId,
    startedAt,
  });
  const counts = { ...emptyCounts() };
  const details: ImportDetail[] = [];
  const failRun = async (
    nextPage: string | null = null,
    quota: Quota | null = null,
  ): Promise<never> => {
    await dependencies.completeRun(run.id, {
      status: "failed",
      counts,
      details,
      nextPage,
      quota,
      errorMessage: "NewsData import failed.",
      completedAt: dependencies.now(),
    });
    throw new NewsDataImportError("The NewsData import could not be completed.");
  };

  let page: Awaited<ReturnType<ImportDependencies["fetchPage"]>>;
  try {
    page = await dependencies.fetchPage({
      country: input.source.country,
      language: input.source.defaultLanguageCode,
      page: null,
      size: 10,
    });
  } catch {
    return failRun();
  }

  counts.fetched = page.articles.length;
  let existing: readonly ImportedStoryIdentity[];
  try {
    existing = await dependencies.getExistingIdentities(input.source.id);
  } catch {
    return failRun(page.nextPage, page.quota);
  }
  const externalIds = new Set(
    existing.map((item) => item.externalId).filter((value): value is string => Boolean(value)),
  );
  const externalUrls = new Set(
    existing
      .map((item) => normalizeExternalUrl(item.externalUrl))
      .filter((value): value is string => Boolean(value)),
  );
  const fingerprints = new Set(
    existing.map((item) => createExternalFingerprint(item.title, input.source.name)),
  );
  const categoryBySlug = new Map(
    input.categories.map((category) => [category.slug, category.id]),
  );
  const supportedCategorySlugs = [...categoryBySlug.keys()];

  for (const [index, raw] of page.articles.entries()) {
    let article;
    try {
      article = normalizeNewsDataArticle(raw);
    } catch {
      counts.failed += 1;
      details.push({
        externalId: null,
        title: "Untitled provider article",
        outcome: "failed",
        reason: "Invalid provider article.",
      });
      continue;
    }

    const fingerprint = createExternalFingerprint(article.title, input.source.name);
    const duplicate =
      (article.externalId !== null && externalIds.has(article.externalId)) ||
      (article.externalUrl !== null && externalUrls.has(article.externalUrl)) ||
      fingerprints.has(fingerprint);
    if (duplicate) {
      counts.skipped += 1;
      counts.duplicates += 1;
      details.push({
        externalId: article.externalId,
        title: article.title,
        outcome: "duplicate",
        reason: "Already imported.",
      });
      continue;
    }

    if (
      article.languageCode &&
      article.languageCode !== input.source.defaultLanguageCode
    ) {
      counts.skipped += 1;
      details.push({
        externalId: article.externalId,
        title: article.title,
        outcome: "skipped",
        reason: "Article language did not match the source configuration.",
      });
      continue;
    }

    const categorySlug = selectProviderCategory(
      article.categories,
      supportedCategorySlugs,
      input.source.defaultCategorySlug,
    );
    const categoryId =
      categoryBySlug.get(categorySlug) ?? input.source.defaultCategoryId;
    let slug: string;
    try {
      slug = await uniqueSlug(
        article.title,
        input.source.defaultLanguageId,
        article.externalId,
        index,
        dependencies.slugExists,
      );
    } catch {
      return failRun(page.nextPage, page.quota);
    }

    try {
      const inserted = await dependencies.insertDraft({
        language_id: input.source.defaultLanguageId,
        category_id: categoryId,
        source_id: input.source.id,
        created_by: input.actorId,
        story_type: "external_article",
        status: "draft",
        slug,
        title: article.title,
        summary: article.summary,
        content: article.content,
        external_id: article.externalId,
        external_url: article.externalUrl,
        external_author: article.externalAuthor,
        external_published_at: article.externalPublishedAt,
        external_image_url: article.externalImageUrl,
        featured_media_id: null,
        seo_keywords: article.tags,
        canonical_url: null,
        is_featured: false,
        is_breaking: false,
        is_sponsored: false,
        submitted_at: null,
        approved_by: null,
        approved_at: null,
        rejected_at: null,
        rejection_reason: null,
        scheduled_at: null,
        published_at: null,
      });
      if (inserted.status === "duplicate") {
        counts.skipped += 1;
        counts.duplicates += 1;
        details.push({
          externalId: article.externalId,
          title: article.title,
          outcome: "duplicate",
          reason: "Already imported by a concurrent request.",
        });
        continue;
      }
      counts.imported += 1;
      details.push({
        externalId: article.externalId,
        title: article.title,
        outcome: "imported",
        reason: "Draft created for editorial review.",
      });
      if (article.externalId) externalIds.add(article.externalId);
      if (article.externalUrl) externalUrls.add(article.externalUrl);
      fingerprints.add(fingerprint);
    } catch {
      counts.failed += 1;
      details.push({
        externalId: article.externalId,
        title: article.title,
        outcome: "failed",
        reason: "Draft could not be saved.",
      });
    }
  }

  const status = counts.failed > 0 ? "partial" : "completed";
  const completion: ImportCompletion = {
    status,
    counts,
    details,
    nextPage: page.nextPage,
    quota: page.quota,
    errorMessage: null,
    completedAt: dependencies.now(),
  };
  await dependencies.completeRun(run.id, completion);
  return { runId: run.id, status, counts, details, quota: page.quota };
}
