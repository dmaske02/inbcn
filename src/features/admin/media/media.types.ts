import type { MediaMetadata } from "./media.model";

export type MediaDto = Readonly<{
  id: string;
  storyId: string | null;
  createdBy: string | null;
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
}>;

export type MediaListResult = Readonly<{
  items: readonly MediaDto[];
  total: number;
  storyReferenceCounts: ReadonlyMap<string, number>;
}>;
