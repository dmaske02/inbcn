import { generateStorySlug } from "../stories/story.model.ts";
import {
  createExternalFingerprint,
  normalizeExternalUrl,
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

export type NormalizedExternalArticle = Readonly<{
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

export type ImportedStoryDraft = Readonly<{
  language_id: string;
  category_id: string;
  source_id: string;
  created_by: string | null;
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
  external_image_width: number | null;
  external_image_height: number | null;
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

export type ImportQuota = Readonly<{
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
  quota: ImportQuota | null;
  errorMessage: string | null;
  completedAt: string;
}>;

export type ExternalImportDependencies = Readonly<{
  createRun(input: Readonly<{
    sourceId: string;
    actorId: string | null;
    startedAt: string;
  }>): Promise<Readonly<{ id: string }>>;
  completeRun(id: string, result: ImportCompletion): Promise<void>;
  getExistingIdentities(
    sourceId: string,
  ): Promise<readonly ImportedStoryIdentity[]>;
  slugExists(languageId: string, slug: string): Promise<boolean>;
  insertDraft(
    draft: ImportedStoryDraft,
  ): Promise<
    Readonly<{ status: "created"; id: string } | { status: "duplicate" }>
  >;
  now(): string;
}>;

export type ImportOperationInput = Readonly<{
  actorId: string | null;
  source: ImportSource;
  categories: readonly Readonly<{ id: string; slug: string }>[];
}>;

export type ImportOperationResult = Readonly<{
  runId: string;
  status: "completed" | "partial";
  counts: ImportCounts;
  details: readonly ImportDetail[];
  quota: ImportQuota | null;
}>;

export type ExternalImportBatch = Readonly<{
  articles: readonly unknown[];
  nextPage: string | null;
  quota: ImportQuota | null;
}>;

export type ExternalImportAdapter = Readonly<{
  providerName: string;
  invalidArticleReason: string;
  fetchBatch(): Promise<ExternalImportBatch>;
  normalizeArticle(input: unknown): NormalizedExternalArticle;
  createError(message: string): Error;
  failureReason?(error: unknown): string | null;
}>;

function assertSourceReady(
  input: ImportOperationInput,
  adapter: ExternalImportAdapter,
): asserts input is ImportOperationInput & {
  source: ImportSource & {
    defaultLanguageId: string;
    defaultLanguageCode: string;
    defaultCategoryId: string;
    defaultCategorySlug: string;
  };
} {
  if (!input.source.isActive) {
    throw adapter.createError(
      `An active ${adapter.providerName} source is required.`,
    );
  }
  if (
    !input.source.defaultLanguageId ||
    !input.source.defaultLanguageCode ||
    !input.source.defaultCategoryId ||
    !input.source.defaultCategorySlug
  ) {
    throw adapter.createError(
      "Configure the source language and category before importing.",
    );
  }
}

async function uniqueSlug(
  title: string,
  languageId: string,
  externalId: string | null,
  sequence: number,
  exists: ExternalImportDependencies["slugExists"],
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

export async function runExternalArticleImportOperation(
  input: ImportOperationInput,
  dependencies: ExternalImportDependencies,
  adapter: ExternalImportAdapter,
): Promise<ImportOperationResult> {
  assertSourceReady(input, adapter);
  const run = await dependencies.createRun({
    sourceId: input.source.id,
    actorId: input.actorId,
    startedAt: dependencies.now(),
  });
  const counts = { ...emptyCounts() };
  const details: ImportDetail[] = [];
  const failRun = async (
    nextPage: string | null = null,
    quota: ImportQuota | null = null,
    error?: unknown,
  ): Promise<never> => {
    const failureReason = error === undefined
      ? null
      : (adapter.failureReason?.(error) ?? null);
    if (failureReason) {
      details.push({
        externalId: null,
        title: "",
        outcome: "failed",
        reason: failureReason,
      });
    }
    await dependencies.completeRun(run.id, {
      status: "failed",
      counts,
      details,
      nextPage,
      quota,
      errorMessage: failureReason ?? `${adapter.providerName} import failed.`,
      completedAt: dependencies.now(),
    });
    throw adapter.createError(
      failureReason ?? `The ${adapter.providerName} import could not be completed.`,
    );
  };

  let batch: ExternalImportBatch;
  try {
    batch = await adapter.fetchBatch();
  } catch (error) {
    return failRun(null, null, error);
  }
  counts.fetched = batch.articles.length;

  let existing: readonly ImportedStoryIdentity[];
  try {
    existing = await dependencies.getExistingIdentities(input.source.id);
  } catch {
    return failRun(batch.nextPage, batch.quota);
  }
  const externalIds = new Set(
    existing
      .map((item) => item.externalId)
      .filter((value): value is string => Boolean(value)),
  );
  const externalUrls = new Set(
    existing
      .map((item) => normalizeExternalUrl(item.externalUrl))
      .filter((value): value is string => Boolean(value)),
  );
  const fingerprints = new Set(
    existing.map((item) =>
      createExternalFingerprint(item.title, input.source.name),
    ),
  );
  const categoryBySlug = new Map(
    input.categories.map((category) => [category.slug, category.id]),
  );
  const supportedCategorySlugs = [...categoryBySlug.keys()];

  for (const [index, raw] of batch.articles.entries()) {
    let article: NormalizedExternalArticle;
    try {
      article = adapter.normalizeArticle(raw);
    } catch {
      counts.failed += 1;
      details.push({
        externalId: null,
        title: "Untitled provider article",
        outcome: "failed",
        reason: adapter.invalidArticleReason,
      });
      continue;
    }

    const fingerprint = createExternalFingerprint(
      article.title,
      input.source.name,
    );
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
      return failRun(batch.nextPage, batch.quota);
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
        external_image_width: article.externalImageWidth,
        external_image_height: article.externalImageHeight,
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
    nextPage: batch.nextPage,
    quota: batch.quota,
    errorMessage: null,
    completedAt: dependencies.now(),
  };
  await dependencies.completeRun(run.id, completion);
  return {
    runId: run.id,
    status,
    counts,
    details,
    quota: batch.quota,
  };
}
