export class StoryBatchAuthorizationError extends Error {
  readonly code = "BULK_STORY_UNAUTHORIZED";

  constructor() {
    super("The batch contains a story that cannot run this action.");
    this.name = "StoryBatchAuthorizationError";
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
  for (const id of uniqueIds) await mutate(id);
}
