import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";
import {
  assertRepositoryQuerySucceeded,
  RepositoryError,
} from "@/features/news/server/errors";
import { mapMediaRecord } from "./media.model";
import type { MediaPersistenceInput } from "./media.operations";
import type {
  MediaDto,
  MediaListQuery,
  MediaListResult,
  MediaLifecycleRepositoryErrorCode,
  MediaStoryUsage,
} from "./media.types";

export type MediaMetadataPersistenceInput = Readonly<{
  title: string;
  originalFilename: string;
  altText: string;
  caption: string;
  credit: string;
  updatedBy: string;
  expectedUpdatedAt: string;
}>;

const MEDIA_COLUMNS =
  "id, story_id, created_by, title, original_filename, credit, updated_by, deleted_at, deleted_by, media_type, cloudinary_public_id, secure_url, resource_format, mime_type, alt_text, caption, width, height, bytes, metadata, created_at, updated_at" as const;

function toDatabaseValues(
  input: MediaPersistenceInput,
): Database["public"]["Tables"]["media"]["Insert"] {
  return {
    story_id: null,
    created_by: input.createdBy,
    title: input.metadata.title,
    original_filename: input.metadata.originalFilename,
    credit: input.metadata.credit,
    updated_by: input.createdBy,
    media_type: "image",
    cloudinary_public_id: input.publicId,
    secure_url: input.secureUrl,
    resource_format: input.format,
    mime_type: input.mimeType,
    alt_text: input.altText,
    caption: input.caption,
    width: input.width,
    height: input.height,
    bytes: input.bytes,
    metadata: {
      ...input.metadata,
      tags: [...input.metadata.tags],
    } satisfies Json,
  };
}

export async function getMediaPage(query: MediaListQuery): Promise<MediaListResult> {
  const supabase = await createClient();
  const from = (query.page - 1) * query.pageSize;
  let request = supabase
    .from("media")
    .select(MEDIA_COLUMNS, { count: "exact" });

  request = query.lifecycle === "retired"
    ? request.not("deleted_at", "is", null)
    : request.is("deleted_at", null);

  if (query.mediaType === "image") {
    request = request.eq("media_type", query.mediaType);
  }
  if (query.createdAfter) {
    request = request.gte("created_at", query.createdAfter);
  }

  const search = query.search
    ?.replace(/[^\p{L}\p{N}\s_-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (search) {
    request = request.or(
      `title.ilike.%${search}%,original_filename.ilike.%${search}%,credit.ilike.%${search}%,alt_text.ilike.%${search}%,caption.ilike.%${search}%,metadata->>title.ilike.%${search}%`,
    );
  }

  if (query.sort === "oldest") {
    request = request.order("created_at", { ascending: true });
  } else if (query.sort === "largest") {
    request = request.order("bytes", { ascending: false, nullsFirst: false });
  } else {
    request = request.order("created_at", { ascending: false }).order("id", { ascending: false });
  }

  const { data, error, count } = await request.range(from, from + query.pageSize - 1);
  assertRepositoryQuerySucceeded(error, "load media library");
  const items = data.map(mapMediaRecord);
  const ids = items.map((item) => item.id);
  const storyReferenceCounts = new Map<string, number>();
  const storyUsages = new Map<string, MediaStoryUsage[]>();

  if (ids.length > 0) {
    const references = await supabase
      .from("stories")
      .select("id, title, status, language_id, featured_media_id, languages!stories_language_id_fkey(code)")
      .in("featured_media_id", ids)
      .order("title", { ascending: true }).order("id", { ascending: true });
    assertRepositoryQuerySucceeded(references.error, "load media story references");
    for (const row of references.data) {
      if (!row.featured_media_id) continue;
      storyReferenceCounts.set(
        row.featured_media_id,
        (storyReferenceCounts.get(row.featured_media_id) ?? 0) + 1,
      );
      const usages = storyUsages.get(row.featured_media_id) ?? [];
      usages.push({
        storyId: row.id,
        title: row.title,
        status: row.status,
        languageId: row.language_id,
        languageCode: row.languages.code,
        adminHref: `/admin/stories/${row.id}`,
      });
      storyUsages.set(row.featured_media_id, usages);
    }
  }

  return { items, total: count ?? 0, storyReferenceCounts, storyUsages };
}

export async function getMediaById(id: string): Promise<MediaDto | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("media")
    .select(MEDIA_COLUMNS)
    .eq("id", id)
    .eq("media_type", "image")
    .is("deleted_at", null)
    .maybeSingle();
  assertRepositoryQuerySucceeded(error, "load media item");
  return data ? mapMediaRecord(data) : null;
}

export async function getMediaByIdIncludingRetired(id: string): Promise<MediaDto | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("media")
    .select(MEDIA_COLUMNS)
    .eq("id", id)
    .eq("media_type", "image")
    .maybeSingle();
  assertRepositoryQuerySucceeded(error, "load media lifecycle item");
  return data ? mapMediaRecord(data) : null;
}

export async function findMediaByChecksum(
  checksum: string,
): Promise<Readonly<{ id: string }> | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("media")
    .select("id")
    .contains("metadata", { checksum })
    .maybeSingle();
  assertRepositoryQuerySucceeded(error, "check duplicate media");
  return data;
}

export async function insertMedia(input: MediaPersistenceInput): Promise<MediaDto> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("media")
    .insert(toDatabaseValues(input))
    .select(MEDIA_COLUMNS)
    .single();
  assertRepositoryQuerySucceeded(error, "save media metadata");
  return mapMediaRecord(data);
}

export async function updateMedia(
  id: string,
  input: MediaPersistenceInput,
): Promise<MediaDto> {
  const supabase = await createClient();
  const values = toDatabaseValues(input);
  const update: Database["public"]["Tables"]["media"]["Update"] = {
    ...values,
    updated_at: new Date().toISOString(),
  };
  delete update.story_id;
  const { data, error } = await supabase
    .from("media")
    .update(update)
    .eq("id", id)
    .select(MEDIA_COLUMNS)
    .single();
  assertRepositoryQuerySucceeded(error, "replace media metadata");
  return mapMediaRecord(data);
}

export async function updateMediaMetadata(
  id: string,
  input: MediaMetadataPersistenceInput,
): Promise<MediaDto | null> {
  const supabase = await createClient();
  const current = await supabase
    .from("media")
    .select("metadata")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  assertRepositoryQuerySucceeded(current.error, "load media metadata");
  if (!current.data) return null;
  const legacyMetadata = current.data.metadata && typeof current.data.metadata === "object" && !Array.isArray(current.data.metadata)
    ? current.data.metadata
    : {};
  const updatedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("media")
    .update({
      title: input.title,
      original_filename: input.originalFilename || null,
      alt_text: input.altText,
      caption: input.caption || null,
      credit: input.credit || null,
      updated_by: input.updatedBy,
      updated_at: updatedAt,
      metadata: {
        ...legacyMetadata,
        title: input.title,
        originalFilename: input.originalFilename,
        credit: input.credit || null,
      } as Json,
    })
    .eq("id", id)
    .eq("updated_at", input.expectedUpdatedAt)
    .is("deleted_at", null)
    .select(MEDIA_COLUMNS)
    .maybeSingle();
  assertRepositoryQuerySucceeded(error, "update media metadata");
  return data ? mapMediaRecord(data) : null;
}

export async function countMediaStoryReferences(id: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("stories")
    .select("id", { count: "exact", head: true })
    .eq("featured_media_id", id);
  assertRepositoryQuerySucceeded(error, "check media usage");
  return count ?? 0;
}

export async function getMediaStoryUsages(id: string): Promise<readonly MediaStoryUsage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stories")
    .select("id, title, status, language_id, languages!stories_language_id_fkey(code)")
    .eq("featured_media_id", id)
    .order("title", { ascending: true }).order("id", { ascending: true });
  assertRepositoryQuerySucceeded(error, "load media Story usage");
  return data.map((story) => ({
    storyId: story.id,
    title: story.title,
    status: story.status,
    languageId: story.language_id,
    languageCode: story.languages.code,
    adminHref: `/admin/stories/${story.id}`,
  }));
}

export class MediaLifecycleRepositoryError extends Error {
  constructor(readonly code: MediaLifecycleRepositoryErrorCode) {
    super(code);
    this.name = "MediaLifecycleRepositoryError";
  }
}

function lifecycleError(error: unknown): MediaLifecycleRepositoryError {
  const message = typeof error === "object" && error && "message" in error
    ? String(error.message)
    : "";
  const matches: ReadonlyArray<readonly [string, MediaLifecycleRepositoryErrorCode]> = [
    ["MEDIA_NOT_FOUND", "NOT_FOUND"], ["MEDIA_IN_USE", "IN_USE"],
    ["MEDIA_CONFLICT", "CONFLICT"], ["MEDIA_ALREADY_RETIRED", "ALREADY_RETIRED"],
    ["MEDIA_NOT_RETIRED", "NOT_RETIRED"], ["MEDIA_FORBIDDEN", "FORBIDDEN"],
  ];
  return new MediaLifecycleRepositoryError(matches.find(([token]) => message.includes(token))?.[1] ?? "PERSISTENCE");
}

export async function retireMediaRecord(id: string, expectedUpdatedAt: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("retire_media_asset", {
    media_id: id,
    expected_updated_at: expectedUpdatedAt,
  });
  if (error) throw lifecycleError(error);
}

export async function restoreMediaRecord(id: string, expectedUpdatedAt: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("restore_media_asset", {
    media_id: id,
    expected_updated_at: expectedUpdatedAt,
  });
  if (error) throw lifecycleError(error);
}

export async function assertMediaExists(id: string): Promise<void> {
  if (!(await getMediaById(id))) {
    throw new RepositoryError("validate selected media");
  }
}
