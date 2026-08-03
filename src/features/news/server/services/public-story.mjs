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
) {
  if (featuredMedia?.publicId && cloudName?.trim()) {
    return {
      src: buildCloudinaryDeliveryUrl(cloudName, featuredMedia.publicId),
      alt: featuredMedia.altText?.trim() || title,
      unoptimized: false,
    };
  }
  if (featuredMedia?.secureUrl) {
    return {
      src: featuredMedia.secureUrl,
      alt: featuredMedia.altText?.trim() || title,
      unoptimized: false,
    };
  }
  if (externalImageUrl?.trim()) {
    return {
      src: externalImageUrl.trim(),
      alt: title,
      unoptimized: true,
    };
  }
  return {
    src: PUBLIC_STORY_FALLBACK_IMAGE,
    alt: title,
    unoptimized: false,
  };
}
