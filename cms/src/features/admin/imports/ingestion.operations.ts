import {
  runExternalArticleImportOperation,
  type ExternalImportDependencies,
  type ImportOperationInput,
  type ImportOperationResult,
  type ImportQuota,
} from "./external-import.operations.ts";
import { normalizeNewsDataArticle } from "./newsdata.model.ts";

export type {
  ImportedStoryDraft,
  ImportedStoryIdentity,
  ImportCompletion,
  ImportCounts,
  ImportDetail,
  ImportOperationInput,
  ImportOperationResult,
} from "./external-import.operations.ts";

type NewsDataImportDependencies = ExternalImportDependencies &
  Readonly<{
    fetchPage(query: Readonly<{
      country: string | null;
      language: string | null;
      page: string | null;
      size: number;
    }>): Promise<
      Readonly<{
        totalResults: number;
        articles: readonly unknown[];
        nextPage: string | null;
        quota: ImportQuota;
      }>
    >;
  }>;

export class NewsDataImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NewsDataImportError";
  }
}

export async function runNewsDataImportOperation(
  input: ImportOperationInput,
  dependencies: NewsDataImportDependencies,
): Promise<ImportOperationResult> {
  return runExternalArticleImportOperation(input, dependencies, {
    providerName: "NewsData",
    invalidArticleReason: "Invalid provider article.",
    fetchBatch: async () => {
      const page = await dependencies.fetchPage({
        country: input.source.country,
        language: input.source.defaultLanguageCode,
        page: null,
        size: 10,
      });
      return {
        articles: page.articles,
        nextPage: page.nextPage,
        quota: page.quota,
      };
    },
    normalizeArticle: normalizeNewsDataArticle,
    createError: (message) => new NewsDataImportError(message),
  });
}
