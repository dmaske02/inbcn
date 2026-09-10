/** Shared identity/locale checks. Callers load only publicly eligible stories. */
export async function resolveHomepageHero<T extends { id: string; href: string }>(
  locale: string,
  storyId: unknown,
  loadPublishedStory: (locale: string, id: string) => Promise<T | null>,
): Promise<T | null> {
  if (!["en", "hi", "mr"].includes(locale) || typeof storyId !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(storyId)) return null;
  const story = await loadPublishedStory(locale, storyId);
  return story?.id === storyId && story.href.startsWith(`/${locale}/`) ? story : null;
}
