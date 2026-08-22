import type { ReporterMembershipStatus } from "@inbcn/domain";

import type { ReporterStoryInput, SubmissionEvidence } from "./submission.model.ts";

export type ReporterStoryMutationResult = Readonly<{
  id: string;
  status: string;
  updatedAt?: string;
  revisionOutcome?: string;
}>;

export type ReporterSubmissionErrorCode =
  | "classification-invalid"
  | "direct-publish-forbidden"
  | "forbidden"
  | "input-invalid"
  | "media-invalid"
  | "membership-inactive"
  | "not-found"
  | "story-not-editable"
  | "temporarily-unavailable";

export class ReporterSubmissionError extends Error {
  readonly code: ReporterSubmissionErrorCode;

  constructor(code: ReporterSubmissionErrorCode, message: string) {
    super(message);
    this.name = "ReporterSubmissionError";
    this.code = code;
  }
}

type ReporterStoryRepository<Editor, ListItem> = Readonly<{
  getAccess(profileId: string): Promise<Readonly<{
    status: ReporterMembershipStatus;
    canPublishDirectly: boolean;
  }>>;
  saveDraft(profileId: string, id: string | null, input: ReporterStoryInput): Promise<ReporterStoryMutationResult>;
  submit(profileId: string, id: string, evidence: SubmissionEvidence): Promise<ReporterStoryMutationResult>;
  directPublish(profileId: string, id: string, evidence: SubmissionEvidence): Promise<ReporterStoryMutationResult>;
  withdraw(profileId: string, id: string): Promise<ReporterStoryMutationResult>;
  getEditor(profileId: string, id: string): Promise<Editor>;
  listStories(profileId: string): Promise<readonly ListItem[]>;
}>;

function safeRepositoryError(error: unknown): ReporterSubmissionError {
  if (error instanceof ReporterSubmissionError) return error;
  const detail = error instanceof Error ? error.message : "";
  if (detail.includes("REPORTER_STORY_CLASSIFICATION_INVALID")) {
    return new ReporterSubmissionError("classification-invalid", "Choose an active category for the selected language.");
  }
  if (detail.includes("REPORTER_STORY_INPUT_INVALID")
    || detail.includes("REPORTER_STORY_EVENT_TIME_INVALID")
    || detail.includes("REPORTER_LOCATION_INVALID")) {
    return new ReporterSubmissionError("input-invalid", "Check the story details and try again.");
  }
  if (detail.includes("REPORTER_STORY_MEDIA_INVALID")) {
    return new ReporterSubmissionError("media-invalid", "Choose only completed media uploaded for this story.");
  }
  if (detail.includes("REPORTER_STORY_NOT_FOUND")) {
    return new ReporterSubmissionError("not-found", "Story not found.");
  }
  if (detail.includes("REPORTER_STORY_INVALID_STATE")
    || detail.includes("REPORTER_STORY_EDITORIAL_CONTROL")
    || detail.includes("REPORTER_STORY_REVISION_CONFLICT")) {
    return new ReporterSubmissionError("story-not-editable", "This story can no longer be changed.");
  }
  if (detail.includes("REPORTER_STORY_FORBIDDEN")
    || detail.includes("REPORTER_DIRECT_PUBLISH_FORBIDDEN")) {
    return new ReporterSubmissionError("forbidden", "You cannot change this story.");
  }
  return new ReporterSubmissionError("temporarily-unavailable", "The story could not be saved. Please try again.");
}

export function createReporterSubmissionService<Editor, ListItem>(
  { repository }: Readonly<{ repository: ReporterStoryRepository<Editor, ListItem> }>,
) {
  async function activeAccess(profileId: string) {
    const access = await repository.getAccess(profileId);
    if (access.status !== "active" && access.status !== "grace_period") {
      throw new ReporterSubmissionError("membership-inactive", "Renew membership before changing stories.");
    }
    return access;
  }

  return {
    async saveDraft(profileId: string, id: string | null, input: ReporterStoryInput) {
      await activeAccess(profileId);
      try {
        return await repository.saveDraft(profileId, id, input);
      } catch (error) {
        throw safeRepositoryError(error);
      }
    },

    async submit(profileId: string, id: string, evidence: SubmissionEvidence) {
      await activeAccess(profileId);
      try {
        return await repository.submit(profileId, id, evidence);
      } catch (error) {
        throw safeRepositoryError(error);
      }
    },

    async directPublish(profileId: string, id: string, evidence: SubmissionEvidence) {
      const access = await repository.getAccess(profileId);
      if (access.status !== "active" || !access.canPublishDirectly) {
        throw new ReporterSubmissionError("direct-publish-forbidden", "This story requires editorial review.");
      }
      try {
        return await repository.directPublish(profileId, id, evidence);
      } catch (error) {
        throw safeRepositoryError(error);
      }
    },

    async withdraw(profileId: string, id: string) {
      await activeAccess(profileId);
      try {
        return await repository.withdraw(profileId, id);
      } catch (error) {
        throw safeRepositoryError(error);
      }
    },

    getEditor: (profileId: string, id: string) => repository.getEditor(profileId, id),
    listStories: (profileId: string) => repository.listStories(profileId),
  } as const;
}

async function runtimeService() {
  const { reporterStoryRepository } = await import("./submission.repository.ts");
  return createReporterSubmissionService({ repository: reporterStoryRepository });
}

export async function saveReporterDraft(profileId: string, id: string | null, input: ReporterStoryInput) {
  return (await runtimeService()).saveDraft(profileId, id, input);
}

export async function submitReporterStory(profileId: string, id: string, evidence: SubmissionEvidence) {
  return (await runtimeService()).submit(profileId, id, evidence);
}

export async function directPublishReporterStory(profileId: string, id: string, evidence: SubmissionEvidence) {
  return (await runtimeService()).directPublish(profileId, id, evidence);
}

export async function withdrawReporterStory(profileId: string, id: string) {
  return (await runtimeService()).withdraw(profileId, id);
}

export async function getReporterStoryEditor(profileId: string, id: string) {
  return (await runtimeService()).getEditor(profileId, id);
}

export async function getReporterStories(profileId: string) {
  return (await runtimeService()).listStories(profileId);
}
