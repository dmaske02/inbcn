import type { TableRow } from "@/lib/supabase/types";
import type { LiveStreamDto, LiveStreamViewModel } from "./live-tv.types.ts";

export type LiveStreamRow = TableRow<"live_streams">;

export function toLiveStreamDto(row: LiveStreamRow): LiveStreamDto {
  return {
    id: row.id,
    languageId: row.language_id,
    internalName: row.internal_name,
    title: row.title,
    description: row.description,
    provider: row.provider,
    providerStreamId: row.provider_stream_id,
    streamUrl: row.stream_url,
    externalWatchUrl: row.external_watch_url,
    posterUrl: row.poster_url,
    posterAltText: row.poster_alt_text,
    status: row.status,
    autoplay: row.autoplay,
    muted: row.muted,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    offlineMessage: row.offline_message,
    relatedCategoryId: row.related_category_id,
    relatedStoryId: row.related_story_id,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    socialImageUrl: row.social_image_url,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toLiveStreamViewModel(
  dto: LiveStreamDto,
): LiveStreamViewModel {
  const { createdBy: _createdBy, updatedBy: _updatedBy, ...view } = dto;
  void _createdBy;
  void _updatedBy;
  return view;
}
