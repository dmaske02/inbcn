import type { ImportRunMetadata } from "./newsdata.model";

export type NewsDataSourceDto = Readonly<{
  id: string;
  name: string;
  slug: string;
  defaultLanguageId: string | null;
  defaultCategoryId: string | null;
  country: string | null;
  ingestionPriority: number;
  isActive: boolean;
  lastIngestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type IngestRunDto = Readonly<{
  id: string;
  sourceId: string;
  sourceName: string;
  triggeredBy: string | null;
  status: "queued" | "running" | "completed" | "partial" | "failed";
  itemsFetched: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsFailed: number;
  errorMessage: string | null;
  metadata: ImportRunMetadata;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}>;

export type IngestRunPageDto = Readonly<{
  items: readonly IngestRunDto[];
  total: number;
}>;

export type NewsDataReferenceDto = Readonly<{
  languages: readonly Readonly<{ id: string; code: string; name: string }>[];
  categories: readonly Readonly<{
    id: string;
    languageId: string;
    slug: string;
    name: string;
  }>[];
}>;
