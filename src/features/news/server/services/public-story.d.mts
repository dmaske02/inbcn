export const PUBLIC_STORY_FALLBACK_IMAGE: "/images/news/story-fallback.svg";

export function formatPublicAuthor(
  externalAuthor: string | null | undefined,
  newsDeskLabel: string,
): string;

export function buildPublicStoryUrl(locale: string, slug: string): string;

export function calculateReadTime(content: string): number;
