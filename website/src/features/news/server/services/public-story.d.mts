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
    width?: number | null;
    height?: number | null;
  }> | null | undefined,
  externalImageUrl: string | null | undefined,
  cloudName: string | null | undefined,
  title: string,
  externalImageWidth?: number | null,
  externalImageHeight?: number | null,
): Readonly<{
  src: string;
  alt: string;
  unoptimized: boolean;
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
}>;

export function buildPublicStoryVideoPosterUrl(
  videoUrl: string | null | undefined,
): string | null;

export function resolvePublicStoryVideoPreview(
  featuredMedia: Readonly<{
    publicId: string;
    secureUrl: string;
  }> | null | undefined,
  externalImageUrl: string | null | undefined,
  video: Readonly<{
    secureUrl: string;
    mimeType: string;
  }> | null | undefined,
): Readonly<{
  src: string;
  mimeType: string;
  poster: string | null;
}> | null;

export function resolveAvailablePublicStoryImage(
  image: Readonly<{
    src: string;
    alt: string;
    unoptimized: boolean;
    width: number | null;
    height: number | null;
    aspectRatio: number | null;
  }>,
  fetcher?: typeof fetch,
): Promise<Readonly<{
  src: string;
  alt: string;
  unoptimized: boolean;
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
}>>;

export function getHeroImagePresentation(image: Readonly<{
  width: number | null;
  height: number | null;
}>): Readonly<{
  objectFit: "cover" | "contain";
  objectPosition: "center";
  maxWidth: string | undefined;
  maxHeight: string | undefined;
}>;
