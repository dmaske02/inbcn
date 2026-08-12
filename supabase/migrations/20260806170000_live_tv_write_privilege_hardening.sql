-- Prevent authenticated CMS users from altering immutable audit columns.
revoke insert, update on table public.live_streams from authenticated;

grant insert (
  language_id, internal_name, title, description, provider,
  provider_stream_id, stream_url, external_watch_url, poster_url,
  poster_alt_text, status, autoplay, muted, starts_at, ends_at,
  offline_message, related_category_id, related_story_id, seo_title,
  seo_description, social_image_url, created_by, updated_by
) on table public.live_streams to authenticated;

grant update (
  language_id, internal_name, title, description, provider,
  provider_stream_id, stream_url, external_watch_url, poster_url,
  poster_alt_text, status, autoplay, muted, starts_at, ends_at,
  offline_message, related_category_id, related_story_id, seo_title,
  seo_description, social_image_url, updated_by
) on table public.live_streams to authenticated;
