import "server-only";

import type { AdminIdentity } from "@/features/admin/auth/authorization.model";
import {
  cmsStorySlugExists,
  getImportedStoryIdentities,
  insertImportedStoryDraft,
  type CmsStoryInsert,
} from "@/features/news/server";
import {
  completeIngestRun,
  createIngestRun,
  getIngestRunPage,
  getNewsDataReferences,
  getNewsDataSourceById,
  getNewsDataSources,
  insertNewsDataSource,
  newsDataSourceSlugExists,
  touchSourceLastIngestedAt,
  updateNewsDataSource as persistNewsDataSource,
} from "./ingestion.repository";
import {
  NewsDataImportError,
  runNewsDataImportOperation,
} from "./ingestion.operations";
import type {
  IngestRunDto,
  NewsDataReferenceDto,
  NewsDataSourceDto,
} from "./ingestion.types";
import { fetchNewsDataPage } from "./newsdata.repository";
import {
  canManageNewsData,
  isNewsDataSourceReady,
  newsDataSourceSchema,
  type NewsDataSourceInput,
} from "./newsdata.model";

const HISTORY_PAGE_SIZE = 20;

export class IngestionManagementError extends Error {
  constructor(
    readonly code:
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "VALIDATION"
      | "DUPLICATE_SOURCE"
      | "IMPORT_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "IngestionManagementError";
  }
}

export type SourceManagementView = Readonly<{
  sources: readonly Readonly<
    NewsDataSourceDto & {
      languageName: string;
      categoryName: string;
      isReady: boolean;
    }
  >[];
  references: NewsDataReferenceDto;
}>;

export type ImportDashboardView = Readonly<{
  sources: SourceManagementView["sources"];
  runs: readonly IngestRunDto[];
  page: number;
  total: number;
  totalPages: number;
}>;

function assertManager(admin: AdminIdentity): void {
  if (!canManageNewsData(admin.role)) {
    throw new IngestionManagementError(
      "FORBIDDEN",
      "You cannot manage NewsData imports.",
    );
  }
}

function composeSources(
  sources: readonly NewsDataSourceDto[],
  references: NewsDataReferenceDto,
): SourceManagementView["sources"] {
  const languages = new Map(
    references.languages.map((language) => [language.id, language.name]),
  );
  const categories = new Map(
    references.categories.map((category) => [category.id, category.name]),
  );
  return sources.map((source) => ({
    ...source,
    languageName: source.defaultLanguageId
      ? (languages.get(source.defaultLanguageId) ?? "Unknown language")
      : "Not configured",
    categoryName: source.defaultCategoryId
      ? (categories.get(source.defaultCategoryId) ?? "Unknown category")
      : "Not configured",
    isReady: isNewsDataSourceReady(source, references),
  }));
}

export async function getSourcesDashboard(
  admin: AdminIdentity,
): Promise<SourceManagementView> {
  assertManager(admin);
  const [sources, references] = await Promise.all([
    getNewsDataSources(),
    getNewsDataReferences(),
  ]);
  return { sources: composeSources(sources, references), references };
}

export async function getImportDashboard(
  admin: AdminIdentity,
  requestedPage?: string,
): Promise<ImportDashboardView> {
  assertManager(admin);
  const parsedPage = Number.parseInt(requestedPage ?? "1", 10);
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const [sourceView, history] = await Promise.all([
    getSourcesDashboard(admin),
    getIngestRunPage(page, HISTORY_PAGE_SIZE),
  ]);
  return {
    sources: sourceView.sources,
    runs: history.items,
    page,
    total: history.total,
    totalPages: Math.max(1, Math.ceil(history.total / HISTORY_PAGE_SIZE)),
  };
}

function parseSource(input: unknown): NewsDataSourceInput {
  const parsed = newsDataSourceSchema.safeParse(input);
  if (!parsed.success) {
    throw new IngestionManagementError(
      "VALIDATION",
      "Check the source configuration and try again.",
    );
  }
  return parsed.data;
}

export async function saveNewsDataSource(
  admin: AdminIdentity,
  input: unknown,
): Promise<NewsDataSourceDto> {
  assertManager(admin);
  const values = parseSource(input);
  const references = await getNewsDataReferences();
  const category = references.categories.find(
    (item) => item.id === values.defaultCategoryId,
  );
  if (!category || category.languageId !== values.defaultLanguageId) {
    throw new IngestionManagementError(
      "VALIDATION",
      "The default category must belong to the selected language.",
    );
  }
  if (await newsDataSourceSlugExists(values.slug, values.id || undefined)) {
    throw new IngestionManagementError(
      "DUPLICATE_SOURCE",
      "That source slug is already in use.",
    );
  }

  const persistence = {
    default_language_id: values.defaultLanguageId,
    default_category_id: values.defaultCategoryId,
    name: values.name,
    slug: values.slug,
    source_type: "newsdata_api" as const,
    website_url: "https://newsdata.io/",
    feed_url: null,
    country: values.country,
    ingestion_priority: values.ingestionPriority,
    is_active: values.isActive,
    updated_at: new Date().toISOString(),
  };

  return values.id
    ? persistNewsDataSource(values.id, persistence)
    : insertNewsDataSource(persistence);
}

export async function runManualNewsDataImport(
  admin: AdminIdentity,
  sourceId: string,
) {
  assertManager(admin);
  const [source, references] = await Promise.all([
    getNewsDataSourceById(sourceId),
    getNewsDataReferences(),
  ]);
  if (!source) {
    throw new IngestionManagementError("NOT_FOUND", "NewsData source not found.");
  }
  const language = references.languages.find(
    (item) => item.id === source.defaultLanguageId,
  );
  const defaultCategory = references.categories.find(
    (item) => item.id === source.defaultCategoryId,
  );
  const categories = references.categories.filter(
    (item) => item.languageId === source.defaultLanguageId,
  );

  try {
    const result = await runNewsDataImportOperation(
      {
        actorId: admin.id,
        source: {
          id: source.id,
          name: source.name,
          defaultLanguageId: source.defaultLanguageId,
          defaultLanguageCode: language?.code ?? null,
          defaultCategoryId: source.defaultCategoryId,
          defaultCategorySlug: defaultCategory?.slug ?? null,
          country: source.country,
          isActive: source.isActive,
        },
        categories: categories.map((category) => ({
          id: category.id,
          slug: category.slug,
        })),
      },
      {
        createRun: createIngestRun,
        completeRun: completeIngestRun,
        fetchPage: fetchNewsDataPage,
        getExistingIdentities: getImportedStoryIdentities,
        slugExists: cmsStorySlugExists,
        insertDraft: (draft) =>
          insertImportedStoryDraft({
            ...draft,
            seo_keywords: [...draft.seo_keywords],
          } satisfies CmsStoryInsert),
        now: () => new Date().toISOString(),
      },
    );
    await touchSourceLastIngestedAt(source.id, new Date().toISOString());
    return result;
  } catch (error) {
    if (error instanceof NewsDataImportError) {
      throw new IngestionManagementError("IMPORT_FAILED", error.message);
    }
    throw new IngestionManagementError(
      "IMPORT_FAILED",
      "The NewsData import could not be completed.",
    );
  }
}
