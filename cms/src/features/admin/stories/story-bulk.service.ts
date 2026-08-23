export class StoryBatchAuthorizationError extends Error {
  readonly code = "BULK_STORY_UNAUTHORIZED";

  constructor() {
    super("The batch contains a story that cannot run this action.");
    this.name = "StoryBatchAuthorizationError";
  }
}

export class StoryBatchPartialError extends Error {
  readonly code = "BULK_STORY_PARTIAL";
  readonly completedIds: readonly string[];

  constructor(completedIds: readonly string[], options: ErrorOptions) {
    super("The batch stopped after another change made a later story ineligible.", options);
    this.name = "StoryBatchPartialError";
    this.completedIds = completedIds;
  }
}

export async function runPreauthorizedStoryBatch<T>(
  ids: readonly string[],
  load: (id: string) => Promise<T | null>,
  isAuthorized: (story: T) => boolean,
  mutate: (id: string) => Promise<void>,
): Promise<void> {
  const uniqueIds = [...new Set(ids)];
  const stories = await Promise.all(uniqueIds.map(load));
  if (stories.some((story) => story === null || !isAuthorized(story))) {
    throw new StoryBatchAuthorizationError();
  }
  const completedIds: string[] = [];
  for (const id of uniqueIds) {
    try {
      await mutate(id);
      completedIds.push(id);
    } catch (error) {
      throw new StoryBatchPartialError(completedIds, { cause: error });
    }
  }
}
