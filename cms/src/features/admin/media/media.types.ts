import type { MediaMetadata } from "./media.model";
import type { DatabaseEnum } from "@/lib/supabase/types";

export type MediaDto = Readonly<{
  id: string;
  storyId: string | null;
  createdBy: string | null;
  title: string;
  originalFilename: string;
  credit: string | null;
  updatedBy: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
  mediaType: "image" | "video" | "audio" | "document";
  publicId: string;
  secureUrl: string;
  format: string | null;
  mimeType: string | null;
  altText: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  createdAt: string;
  updatedAt: string;
  metadata: MediaMetadata;
}>;

export type MediaListSort = "newest" | "oldest" | "largest";

export type MediaListQuery = Readonly<{
  page: number;
  pageSize: number;
  search?: string;
  sort?: MediaListSort;
  mediaType?: "image";
  createdAfter?: string;
  lifecycle?: "active" | "retired";
}>;

export type MediaStoryUsage = Readonly<{
  storyId: string;
  title: string;
  status: DatabaseEnum<"story_status">;
  languageId: string;
  languageCode: string;
  adminHref: string;
}>;

export type MediaLifecycleRepositoryErrorCode =
  | "NOT_FOUND"
  | "IN_USE"
  | "CONFLICT"
  | "ALREADY_RETIRED"
  | "NOT_RETIRED"
  | "FORBIDDEN"
  | "PERSISTENCE";

export type MediaListResult = Readonly<{
  items: readonly MediaDto[];
  total: number;
  storyReferenceCounts: ReadonlyMap<string, number>;
  storyUsages: ReadonlyMap<string, readonly MediaStoryUsage[]>;
}>;
