import "server-only";

import { getCurrentMembership } from "../membership/membership.repository.ts";
import { createClient } from "../../lib/supabase/server.ts";
import {
  canonicalReporterStoryState,
  type ReporterStoryInput,
  type SubmissionEvidence,
} from "./submission.model.ts";
import type { ReporterStoryMutationResult } from "./submission.service.ts";

export type ReporterStoryReferences = Readonly<{
  languages: readonly Readonly<{ id: string; code: "en" | "hi" | "mr"; name: string; nativeName: string }>[];
  categories: readonly Readonly<{ id: string; languageId: string; name: string }>[];
}>;

export type ReporterStoryEditor = Readonly<{
  story: Readonly<{
    id: string;
    status: string;
    reporterState: ReturnType<typeof canonicalReporterStoryState>;
    title: string;
    summary: string;
    body: string;
    languageId: string;
    categoryId: string;
    eventOccurredAt: string;
    featuredMediaId: string | null;
    submittedAt: string | null;
    publishedAt: string | null;
    updatedAt: string;
  }>;
  latestRevision: Readonly<{
    id: string;
    number: number;
    outcome: string;
    reason: string | null;
    submittedAt: string;
    mediaIds: readonly string[];
  }> | null;
  media: readonly Readonly<{ id: string; title: string; type: string; sortOrder: number }>[];
  location: Readonly<{
    latitude: number;
    longitude: number;
    accuracy: number;
    capturedAt: string;
    locality: string;
  }> | null;
  membership: Readonly<{
    status: string;
    canPublishDirectly: boolean;
    canSubmit: boolean;
    canDirectPublish: boolean;
  }>;
  references: ReporterStoryReferences;
}>;

export type ReporterStoryListItem = Readonly<{
  id: string;
  title: string;
  status: string;
  reporterState: ReturnType<typeof canonicalReporterStoryState>;
  reviewReason: string | null;
  updatedAt: string;
}>;

export class SubmissionRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubmissionRepositoryError";
  }
}

function repositoryFailure(error: unknown): never {
  const message = typeof error === "object" && error !== null && "message" in error
    ? String(error.message)
    : "REPORTER_STORY_REPOSITORY_UNAVAILABLE";
  throw new SubmissionRepositoryError(message);
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SubmissionRepositoryError("REPORTER_STORY_RESPONSE_INVALID");
  }
  return value as Record<string, unknown>;
}

function mutationResult(value: unknown): ReporterStoryMutationResult {
  const data = record(value);
  if (typeof data.story_id !== "string" || typeof data.story_status !== "string") {
    throw new SubmissionRepositoryError("REPORTER_STORY_RESPONSE_INVALID");
  }
  return {
    id: data.story_id,
    status: data.story_status,
    ...(typeof data.updated_at === "string" ? { updatedAt: data.updated_at } : {}),
    ...(typeof data.revision_outcome === "string" ? { revisionOutcome: data.revision_outcome } : {}),
  };
}

export async function getReporterStoryReferences(): Promise<ReporterStoryReferences> {
  const client = await createClient();
  const [{ data: languages, error: languageError }, { data: categories, error: categoryError }] = await Promise.all([
    client.from("languages").select("id, code, name, native_name").in("code", ["en", "hi", "mr"]).eq("is_active", true).order("name"),
    client.from("categories").select("id, language_id, name").eq("is_active", true).order("name"),
  ]);
  if (languageError) repositoryFailure(languageError);
  if (categoryError) repositoryFailure(categoryError);
  const supportedLanguageIds = new Set(languages.map((language) => language.id));
  return {
    languages: languages.map((language) => ({
      id: language.id,
      code: language.code as "en" | "hi" | "mr",
      name: language.name,
      nativeName: language.native_name,
    })),
    categories: categories
      .filter((category) => supportedLanguageIds.has(category.language_id))
      .map((category) => ({ id: category.id, languageId: category.language_id, name: category.name })),
  };
}

async function getAccess(profileId: string) {
  const membership = await getCurrentMembership(profileId);
  return { status: membership.status, canPublishDirectly: membership.canPublishDirectly } as const;
}

async function saveDraft(profileId: string, id: string | null, input: ReporterStoryInput) {
  void profileId;
  const { data, error } = await (await createClient()).rpc("save_reporter_story_draft", {
    p_story_id: id,
    p_language_id: input.languageId,
    p_category_id: input.categoryId,
    p_title: input.title,
    p_summary: input.summary,
    p_content: input.body,
    p_event_occurred_at: input.eventOccurredAt,
    p_media_ids: [...input.mediaIds],
    p_featured_media_id: input.featuredMediaId,
  });
  if (error) repositoryFailure(error);
  return mutationResult(data);
}

async function submit(profileId: string, id: string, evidence: SubmissionEvidence) {
  void profileId;
  const { data, error } = await (await createClient()).rpc("submit_reporter_story", {
    p_story_id: id,
    p_latitude: evidence.location.latitude,
    p_longitude: evidence.location.longitude,
    p_accuracy_meters: evidence.location.accuracy,
    p_captured_at: evidence.location.capturedAt,
    p_locality: evidence.locality,
  });
  if (error) repositoryFailure(error);
  return mutationResult(data);
}

async function directPublish(profileId: string, id: string, evidence: SubmissionEvidence) {
  void profileId;
  const { data, error } = await (await createClient()).rpc("direct_publish_reporter_story", {
    p_story_id: id,
    p_latitude: evidence.location.latitude,
    p_longitude: evidence.location.longitude,
    p_accuracy_meters: evidence.location.accuracy,
    p_captured_at: evidence.location.capturedAt,
    p_locality: evidence.locality,
  });
  if (error) repositoryFailure(error);
  return mutationResult(data);
}

async function withdraw(profileId: string, id: string) {
  void profileId;
  const { data, error } = await (await createClient()).rpc("withdraw_reporter_story", { p_story_id: id });
  if (error) repositoryFailure(error);
  return mutationResult(data);
}

async function getEditor(profileId: string, id: string): Promise<ReporterStoryEditor | null> {
  const client = await createClient();
  const { data: story, error: storyError } = await client
    .from("stories")
    .select("id, created_by, is_reporter_story, status, title, summary, content, language_id, category_id, event_occurred_at, featured_media_id, submitted_at, published_at, updated_at")
    .eq("id", id)
    .eq("created_by", profileId)
    .maybeSingle();
  if (storyError) repositoryFailure(storyError);
  if (!story || !story.is_reporter_story || !story.event_occurred_at) return null;

  const [revisionResult, mediaResult, membership, references] = await Promise.all([
    client.from("story_revisions")
      .select("id, revision_number, review_outcome, review_reason, submitted_at, associated_media_ids")
      .eq("story_id", id)
      .order("revision_number", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client.from("media")
      .select("id, title, media_type, sort_order")
      .eq("story_id", id)
      .is("deleted_at", null)
      .order("sort_order")
      .order("created_at"),
    getCurrentMembership(profileId),
    getReporterStoryReferences(),
  ]);
  if (revisionResult.error) repositoryFailure(revisionResult.error);
  if (mediaResult.error) repositoryFailure(mediaResult.error);
  const revision = revisionResult.data;
  let location: ReporterStoryEditor["location"] = null;
  if (revision) {
    const { data, error } = await client.from("story_locations")
      .select("latitude, longitude, accuracy_meters, captured_at, locality")
      .eq("story_id", id)
      .eq("revision_id", revision.id)
      .maybeSingle();
    if (error) repositoryFailure(error);
    if (data) {
      location = {
        latitude: data.latitude,
        longitude: data.longitude,
        accuracy: data.accuracy_meters,
        capturedAt: data.captured_at,
        locality: data.locality,
      };
    }
  }
  const canSubmit = membership.status === "active" || membership.status === "grace_period";
  return {
    story: {
      id: story.id,
      status: story.status,
      reporterState: canonicalReporterStoryState(story.status, revision?.review_outcome ?? null),
      title: story.title,
      summary: story.summary,
      body: story.content,
      languageId: story.language_id,
      categoryId: story.category_id,
      eventOccurredAt: story.event_occurred_at,
      featuredMediaId: story.featured_media_id,
      submittedAt: story.submitted_at,
      publishedAt: story.published_at,
      updatedAt: story.updated_at,
    },
    latestRevision: revision ? {
      id: revision.id,
      number: revision.revision_number,
      outcome: revision.review_outcome,
      reason: revision.review_reason,
      submittedAt: revision.submitted_at,
      mediaIds: revision.associated_media_ids,
    } : null,
    media: mediaResult.data.map((item) => ({
      id: item.id,
      title: item.title,
      type: item.media_type,
      sortOrder: item.sort_order,
    })),
    location,
    membership: {
      status: membership.status,
      canPublishDirectly: membership.canPublishDirectly,
      canSubmit,
      canDirectPublish: membership.status === "active" && membership.canPublishDirectly,
    },
    references,
  };
}

async function listStories(profileId: string): Promise<readonly ReporterStoryListItem[]> {
  const client = await createClient();
  const { data: stories, error } = await client.from("stories")
    .select("id, created_by, is_reporter_story, status, title, updated_at")
    .eq("created_by", profileId)
    .order("updated_at", { ascending: false });
  if (error) repositoryFailure(error);
  const owned = stories.filter((story) => story.is_reporter_story);
  if (owned.length === 0) return [];
  const { data: revisions, error: revisionError } = await client.from("story_revisions")
    .select("story_id, revision_number, review_outcome, review_reason")
    .in("story_id", owned.map((story) => story.id))
    .order("revision_number", { ascending: false });
  if (revisionError) repositoryFailure(revisionError);
  const latest = new Map<string, (typeof revisions)[number]>();
  for (const revision of revisions) {
    if (!latest.has(revision.story_id)) latest.set(revision.story_id, revision);
  }
  return owned.map((story) => {
    const revision = latest.get(story.id);
    return {
      id: story.id,
      title: story.title,
      status: story.status,
      reporterState: canonicalReporterStoryState(story.status, revision?.review_outcome ?? null),
      reviewReason: revision?.review_reason ?? null,
      updatedAt: story.updated_at,
    };
  });
}

export const reporterStoryRepository = {
  getAccess,
  saveDraft,
  submit,
  directPublish,
  withdraw,
  getEditor,
  listStories,
} as const;
