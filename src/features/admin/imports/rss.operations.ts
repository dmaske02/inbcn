import {
  runExternalArticleImportOperation,
  type ExternalImportDependencies,
  type ImportOperationInput,
  type ImportOperationResult,
} from "./external-import.operations.ts";
import { normalizeRssEntry } from "./rss.model.ts";
import type {
  ParsedRssEntry,
  ParsedSyndicationFeed,
} from "./rss.parser.ts";

const RSS_IMPORT_LIMIT = 50;

export type RssImportOperationInput = Omit<ImportOperationInput, "source"> &
  Readonly<{
    source: ImportOperationInput["source"] &
      Readonly<{ feedUrl: string | null }>;
  }>;

type RssImportDependencies = ExternalImportDependencies &
  Readonly<{
    fetchFeed(feedUrl: string): Promise<ParsedSyndicationFeed>;
  }>;

export class RssImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RssImportError";
  }
}

export async function runRssImportOperation(
  input: RssImportOperationInput,
  dependencies: RssImportDependencies,
): Promise<ImportOperationResult> {
  if (!input.source.feedUrl) {
    throw new RssImportError("Configure the RSS feed URL before importing.");
  }

  return runExternalArticleImportOperation(input, dependencies, {
    providerName: "RSS",
    invalidArticleReason: "Invalid RSS article.",
    fetchBatch: async () => {
      const feed = await dependencies.fetchFeed(input.source.feedUrl as string);
      return {
        articles: feed.entries.slice(0, RSS_IMPORT_LIMIT),
        nextPage: null,
        quota: null,
      };
    },
    normalizeArticle: (value) => normalizeRssEntry(value as ParsedRssEntry),
    createError: (message) => new RssImportError(message),
  });
}

export { RSS_IMPORT_LIMIT };
