export const PUBLIC_STORY_FALLBACK_IMAGE: "/images/news/story-fallback.svg";

export function formatPublicAuthor(
  externalAuthor: string | null | undefined,
  newsDeskLabel: string,
): string;

export function buildPublicStoryUrl(locale: string, slug: string): string;

export function calculateReadTime(content: string): number;

export function buildCloudinaryDeliveryUrl(
  cloudName: string,
  publicId: string,
): string;

export function resolvePublicStoryImage(
  featuredMedia: Readonly<{
    publicId: string;
    secureUrl: string;
    altText: string | null;
  }> | null | undefined,
  cloudName: string | null | undefined,
  title: string,
): Readonly<{ src: string; alt: string }>;
