export const PUBLIC_STORY_FALLBACK_IMAGE = "/images/news/story-fallback.svg";

export function formatPublicAuthor(externalAuthor, newsDeskLabel) {
  return externalAuthor?.trim() || newsDeskLabel;
}

export function buildPublicStoryUrl(locale, slug) {
  return `/${locale}/story/${slug}`;
}

export function calculateReadTime(content) {
  const words = content.trim() ? content.trim().split(/\s+/u).length : 0;
  return words === 0 ? 0 : Math.ceil(words / 200);
}

export function buildCloudinaryDeliveryUrl(cloudName, publicId) {
  const encodedCloud = encodeURIComponent(cloudName.trim());
  const encodedPublicId = publicId
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `https://res.cloudinary.com/${encodedCloud}/image/upload/f_auto,q_auto/${encodedPublicId}`;
}

export function resolvePublicStoryImage(
  featuredMedia,
  externalImageUrl,
  cloudName,
  title,
  externalImageWidth = null,
  externalImageHeight = null,
) {
  const dimensions = (width, height) => ({
    width: Number.isFinite(width) && width > 0 ? width : null,
    height: Number.isFinite(height) && height > 0 ? height : null,
    aspectRatio:
      Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
        ? width / height
        : null,
  });
  if (featuredMedia?.publicId && cloudName?.trim()) {
    return {
      src: buildCloudinaryDeliveryUrl(cloudName, featuredMedia.publicId),
      alt: featuredMedia.altText?.trim() || title,
      unoptimized: false,
      ...dimensions(featuredMedia.width, featuredMedia.height),
    };
  }
  if (featuredMedia?.secureUrl) {
    return {
      src: featuredMedia.secureUrl,
      alt: featuredMedia.altText?.trim() || title,
      unoptimized: false,
      ...dimensions(featuredMedia.width, featuredMedia.height),
    };
  }
  if (externalImageUrl?.trim()) {
    return {
      src: externalImageUrl.trim(),
      alt: title,
      unoptimized: true,
      ...dimensions(externalImageWidth, externalImageHeight),
    };
  }
  return {
    src: PUBLIC_STORY_FALLBACK_IMAGE,
    alt: title,
    unoptimized: false,
    ...dimensions(null, null),
  };
}

function fallbackPublicStoryImage(alt) {
  return {
    src: PUBLIC_STORY_FALLBACK_IMAGE,
    alt,
    unoptimized: false,
    width: null,
    height: null,
    aspectRatio: null,
  };
}

export async function resolveAvailablePublicStoryImage(image, fetcher = fetch) {
  if (!image.unoptimized || image.src.startsWith("/")) return image;

  let imageUrl;
  try {
    imageUrl = new URL(image.src);
    if (imageUrl.protocol !== "https:" && imageUrl.protocol !== "http:") {
      return fallbackPublicStoryImage(image.alt);
    }
  } catch {
    return fallbackPublicStoryImage(image.alt);
  }

  try {
    const response = await fetcher(imageUrl, {
      method: "GET",
      headers: { Accept: "image/*", Range: "bytes=0-0" },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    const contentType = response.headers.get("content-type")?.toLocaleLowerCase("en") ?? "";
    await response.body?.cancel();
    return response.ok && contentType.startsWith("image/")
      ? image
      : fallbackPublicStoryImage(image.alt);
  } catch {
    return fallbackPublicStoryImage(image.alt);
  }
}

export function getHeroImagePresentation(image) {
  const lowResolution = image?.width !== null && image?.width !== undefined && image.width < 800;
  return {
    objectFit: lowResolution ? "contain" : "cover",
    objectPosition: "center",
    maxWidth: lowResolution ? `${image.width}px` : undefined,
    maxHeight: lowResolution && image.height ? `${image.height}px` : undefined,
  };
}
