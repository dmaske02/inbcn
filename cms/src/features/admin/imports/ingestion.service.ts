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
  getIngestionReferences,
  getIngestionSourceById,
  getIngestionSources,
  getIngestRunPage,
  ingestionSourceSlugExists,
  insertIngestionSource,
  touchSourceLastIngestedAt,
  updateIngestionSource,
} from "./ingestion.repository";
import {
  NewsDataImportError,
  runNewsDataImportOperation,
} from "./ingestion.operations";
import type { ImportedStoryDraft } from "./external-import.operations";
import type {
  IngestRunDto,
  IngestionReferenceDto,
  IngestionSourceDto,
} from "./ingestion.types";
import { fetchNewsDataPage } from "./newsdata.repository";
import {
  canManageNewsData,
  isNewsDataSourceReady,
  newsDataSourceSchema,
  type NewsDataSourceInput,
} from "./newsdata.model";
import {
  isRssSourceReady,
  rssSourceSchema,
  type RssSourceInput,
} from "./rss.model";
import { RssImportError, runRssImportOperation } from "./rss.operations";
import { fetchRssFeed } from "./rss.repository";
import {
  getSchedulerDashboard,
  getSchedulerDashboardForSources,
} from "./scheduler.service";

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
    IngestionSourceDto & {
      providerLabel: "NewsData" | "RSS";
      languageName: string;
      categoryName: string;
      isReady: boolean;
    }
  >[];
  references: IngestionReferenceDto;
}>;

export type ImportDashboardView = Readonly<{
  sources: SourceManagementView["sources"];
  runs: readonly IngestRunDto[];
  page: number;
  total: number;
  totalPages: number;
  scheduler: Awaited<ReturnType<typeof getSchedulerDashboard>>;
}>;

function assertManager(admin: AdminIdentity): void {
  if (!canManageNewsData(admin.role)) {
    throw new IngestionManagementError(
      "FORBIDDEN",
      "You cannot manage content imports.",
    );
  }
}

function composeSources(
  sources: readonly IngestionSourceDto[],
  references: IngestionReferenceDto,
): SourceManagementView["sources"] {
  const languages = new Map(
    references.languages.map((language) => [language.id, language.name]),
  );
  const categories = new Map(
    references.categories.map((category) => [category.id, category.name]),
  );
  return sources.map((source) => ({
    ...source,
    providerLabel: source.sourceType === "rss" ? "RSS" : "NewsData",
    languageName: source.defaultLanguageId
      ? (languages.get(source.defaultLanguageId) ?? "Unknown language")
      : "Not configured",
    categoryName: source.defaultCategoryId
      ? (categories.get(source.defaultCategoryId) ?? "Unknown category")
      : "Not configured",
    isReady:
      source.sourceType === "rss"
        ? isRssSourceReady(source, references)
        : isNewsDataSourceReady(source, references),
  }));
}

export async function getSourcesDashboard(
  admin: AdminIdentity,
): Promise<SourceManagementView> {
  assertManager(admin);
  const [sources, references] = await Promise.all([
    getIngestionSources(),
    getIngestionReferences(),
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
  const sourceViewPromise = getSourcesDashboard(admin);
  const [sourceView, history, scheduler] = await Promise.all([
    sourceViewPromise,
    getIngestRunPage(page, HISTORY_PAGE_SIZE),
    getSchedulerDashboardForSources(
      sourceViewPromise.then((view) => view.sources),
    ),
  ]);
  return {
    sources: sourceView.sources,
    runs: history.items,
    page,
    total: history.total,
    totalPages: Math.max(1, Math.ceil(history.total / HISTORY_PAGE_SIZE)),
    scheduler,
  };
}

type ParsedSource =
  | Readonly<{ sourceType: "newsdata_api"; values: NewsDataSourceInput }>
  | Readonly<{ sourceType: "rss"; values: RssSourceInput }>;

function parseSource(input: unknown): ParsedSource {
  if (!input || typeof input !== "object") {
    throw new IngestionManagementError(
      "VALIDATION",
      "Check the source configuration and try again.",
    );
  }
  const sourceType = Reflect.get(input, "sourceType");
  const schema = sourceType === "rss" ? rssSourceSchema : newsDataSourceSchema;
  if (sourceType !== "rss" && sourceType !== "newsdata_api") {
    throw new IngestionManagementError("VALIDATION", "Select a valid source type.");
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new IngestionManagementError(
      "VALIDATION",
      "Check the source configuration and try again.",
    );
  }
  return sourceType === "rss"
    ? { sourceType, values: parsed.data as RssSourceInput }
    : { sourceType, values: parsed.data as NewsDataSourceInput };
}

export async function saveIngestionSource(
  admin: AdminIdentity,
  input: unknown,
): Promise<IngestionSourceDto> {
  assertManager(admin);
  const parsed = parseSource(input);
  const { values, sourceType } = parsed;
  const references = await getIngestionReferences();
  const category = references.categories.find(
    (item) => item.id === values.defaultCategoryId,
  );
  if (!category || category.languageId !== values.defaultLanguageId) {
    throw new IngestionManagementError(
      "VALIDATION",
      "The default category must belong to the selected language.",
    );
  }
  if (await ingestionSourceSlugExists(values.slug, values.id || undefined)) {
    throw new IngestionManagementError(
      "DUPLICATE_SOURCE",
      "That source slug is already in use.",
    );
  }
  if (values.id) {
    const existing = await getIngestionSourceById(values.id);
    if (!existing) {
      throw new IngestionManagementError("NOT_FOUND", "Source not found.");
    }
    if (existing.sourceType !== sourceType) {
      throw new IngestionManagementError(
        "VALIDATION",
        "An existing source type cannot be changed.",
      );
    }
  }

  const persistence = {
    default_language_id: values.defaultLanguageId,
    default_category_id: values.defaultCategoryId,
    name: values.name,
    slug: values.slug,
    source_type: sourceType,
    website_url: sourceType === "newsdata_api" ? "https://newsdata.io/" : null,
    feed_url: sourceType === "rss" ? parsed.values.feedUrl : null,
    country: values.country,
    ingestion_priority: values.ingestionPriority,
    is_active: values.isActive,
    updated_at: new Date().toISOString(),
  } as const;

  return values.id
    ? updateIngestionSource(values.id, persistence)
    : insertIngestionSource(persistence);
}

export async function runManualSourceImport(
  admin: AdminIdentity,
  sourceId: string,
) {
  assertManager(admin);
  const [source, references] = await Promise.all([
    getIngestionSourceById(sourceId),
    getIngestionReferences(),
  ]);
  if (!source) {
    throw new IngestionManagementError("NOT_FOUND", "Import source not found.");
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
  const operationInput = {
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
  };
  const commonDependencies = {
    createRun: createIngestRun,
    completeRun: completeIngestRun,
    getExistingIdentities: getImportedStoryIdentities,
    slugExists: cmsStorySlugExists,
    insertDraft: (draft: ImportedStoryDraft) =>
      insertImportedStoryDraft({
        ...draft,
        seo_keywords: [...draft.seo_keywords],
      } satisfies CmsStoryInsert),
    now: () => new Date().toISOString(),
  };

  try {
    const result =
      source.sourceType === "rss"
        ? await runRssImportOperation(
            {
              ...operationInput,
              source: { ...operationInput.source, feedUrl: source.feedUrl },
            },
            { ...commonDependencies, fetchFeed: fetchRssFeed },
          )
        : await runNewsDataImportOperation(operationInput, {
            ...commonDependencies,
            fetchPage: fetchNewsDataPage,
          });
    await touchSourceLastIngestedAt(source.id, new Date().toISOString());
    return result;
  } catch (error) {
    if (error instanceof NewsDataImportError || error instanceof RssImportError) {
      throw new IngestionManagementError("IMPORT_FAILED", error.message);
    }
    throw new IngestionManagementError(
      "IMPORT_FAILED",
      "The content import could not be completed.",
    );
  }
}
