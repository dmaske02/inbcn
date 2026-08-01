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
} from "./media.types";

const MEDIA_COLUMNS =
  "id, story_id, created_by, cloudinary_public_id, secure_url, resource_format, mime_type, alt_text, caption, width, height, bytes, metadata, created_at, updated_at" as const;

function toDatabaseValues(
  input: MediaPersistenceInput,
): Database["public"]["Tables"]["media"]["Insert"] {
  return {
    story_id: null,
    created_by: input.createdBy,
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
    .select(MEDIA_COLUMNS, { count: "exact" })
    .eq("media_type", "image");

  const search = query.search
    ?.replace(/[^\p{L}\p{N}\s_-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (search) {
    request = request.or(
      `cloudinary_public_id.ilike.%${search}%,alt_text.ilike.%${search}%,caption.ilike.%${search}%,metadata->>title.ilike.%${search}%`,
    );
  }

  if (query.sort === "oldest") {
    request = request.order("created_at", { ascending: true });
  } else if (query.sort === "largest") {
    request = request.order("bytes", { ascending: false, nullsFirst: false });
  } else {
    request = request.order("created_at", { ascending: false });
  }

  const { data, error, count } = await request.range(from, from + query.pageSize - 1);
  assertRepositoryQuerySucceeded(error, "load media library");
  const items = data.map(mapMediaRecord);
  const ids = items.map((item) => item.id);
  const storyReferenceCounts = new Map<string, number>();

  if (ids.length > 0) {
    const references = await supabase
      .from("stories")
      .select("featured_media_id")
      .in("featured_media_id", ids);
    assertRepositoryQuerySucceeded(references.error, "load media story references");
    for (const row of references.data) {
      if (!row.featured_media_id) continue;
      storyReferenceCounts.set(
        row.featured_media_id,
        (storyReferenceCounts.get(row.featured_media_id) ?? 0) + 1,
      );
    }
  }

  return { items, total: count ?? 0, storyReferenceCounts };
}

export async function getMediaById(id: string): Promise<MediaDto | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("media")
    .select(MEDIA_COLUMNS)
    .eq("id", id)
    .eq("media_type", "image")
    .maybeSingle();
  assertRepositoryQuerySucceeded(error, "load media item");
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

export async function countMediaStoryReferences(id: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("stories")
    .select("id", { count: "exact", head: true })
    .eq("featured_media_id", id);
  assertRepositoryQuerySucceeded(error, "check media usage");
  return count ?? 0;
}

export async function deleteMedia(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("media").delete().eq("id", id);
  assertRepositoryQuerySucceeded(error, "delete media metadata");
}

export async function assertMediaExists(id: string): Promise<void> {
  if (!(await getMediaById(id))) {
    throw new RepositoryError("validate selected media");
  }
}
