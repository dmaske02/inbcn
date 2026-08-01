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
