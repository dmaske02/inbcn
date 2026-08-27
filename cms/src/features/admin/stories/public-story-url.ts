export function buildPublicStoryUrl(
  websiteOrigin: string,
  locale: string,
  slug: string,
): string {
  return `${websiteOrigin.replace(/\/+$/u, "")}/${locale}/story/${slug}`;
}
