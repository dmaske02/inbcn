import type { DatabaseEnum } from "@/lib/supabase/types";
import type { ImportRunMetadata } from "./newsdata.model";

export type IngestionSourceDto = Readonly<{
  id: string;
  name: string;
  slug: string;
  sourceType: DatabaseEnum<"source_type">;
  websiteUrl: string | null;
  feedUrl: string | null;
  defaultLanguageId: string | null;
  defaultCategoryId: string | null;
  country: string | null;
  ingestionPriority: number;
  isActive: boolean;
  lastIngestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type NewsDataSourceDto = IngestionSourceDto;

export type IngestRunDto = Readonly<{
  id: string;
  sourceId: string | null;
  sourceName: string;
  triggeredBy: string | null;
  status: "queued" | "running" | "completed" | "partial" | "failed" | "skipped";
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

export type IngestionReferenceDto = Readonly<{
  languages: readonly Readonly<{ id: string; code: string; name: string }>[];
  categories: readonly Readonly<{
    id: string;
    languageId: string;
    slug: string;
    name: string;
  }>[];
}>;

export type NewsDataReferenceDto = IngestionReferenceDto;
