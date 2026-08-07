type SchedulableProgramme = Readonly<{
  id: string;
  title: string;
  description: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
}>;

export type ProgrammeState = "archive" | "completed" | "current" | "upcoming" | "offline";

export function composeProgrammeSchedule<T extends SchedulableProgramme>(
  programmes: readonly T[],
  now = new Date(),
) {
  const timestamp = now.getTime();
  return programmes
    .filter(({ startsAt }) => Boolean(startsAt))
    .toSorted((left, right) => Date.parse(left.startsAt ?? "") - Date.parse(right.startsAt ?? ""))
    .map((programme) => {
      const start = Date.parse(programme.startsAt ?? "");
      const end = programme.endsAt ? Date.parse(programme.endsAt) : Number.POSITIVE_INFINITY;
      const state: ProgrammeState = programme.status === "archived"
        ? "archive"
        : programme.status === "offline"
          ? "offline"
          : timestamp < start
            ? "upcoming"
            : timestamp >= end
              ? "completed"
              : programme.status === "live" || timestamp >= start
                ? "current"
                : "upcoming";
      return { ...programme, state, isCurrent: state === "current" } as const;
    });
}

function absoluteUrl(siteUrl: string, value: string) {
  return new URL(value, `${siteUrl.replace(/\/$/u, "")}/`).toString();
}

export function composeLiveTvMetadata(input: Readonly<{
  siteUrl: string;
  locale: string;
  locales: readonly string[];
  title: string;
  description: string;
  imageUrl: string;
}>) {
  const canonical = absoluteUrl(input.siteUrl, `/${input.locale}/live-tv`);
  const image = absoluteUrl(input.siteUrl, input.imageUrl);
  const languages = Object.fromEntries(input.locales.map((locale) => [locale, absoluteUrl(input.siteUrl, `/${locale}/live-tv`)]));
  languages["x-default"] = absoluteUrl(input.siteUrl, "/en/live-tv");
  return {
    title: input.title,
    description: input.description,
    canonical,
    languages,
    openGraph: { title: input.title, description: input.description, url: canonical, type: "website" as const, images: [image] },
    twitter: { card: "summary_large_image" as const, title: input.title, description: input.description, images: [image] },
  };
}

export function buildLiveTvJsonLd(input: Readonly<{
  canonical: string;
  homeUrl: string;
  pageTitle: string;
  description: string;
  imageUrl: string;
  programme: SchedulableProgramme | null;
  embedUrl?: string;
  contentUrl?: string;
}>) {
  const publication = input.programme?.startsAt ? [{
    "@type": "BroadcastEvent",
    isLiveBroadcast: input.programme.status === "live",
    startDate: input.programme.startsAt,
    ...(input.programme.endsAt ? { endDate: input.programme.endsAt } : {}),
  }] : [];
  return {
    breadcrumb: {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "INBCN", item: input.homeUrl },
        { "@type": "ListItem", position: 2, name: input.pageTitle, item: input.canonical },
      ],
    },
    video: input.programme ? {
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name: input.programme?.title ?? input.pageTitle,
      description: input.programme?.description ?? input.description,
      thumbnailUrl: [input.imageUrl],
      ...(input.programme.startsAt ? { uploadDate: input.programme.startsAt } : {}),
      ...(input.embedUrl ? { embedUrl: input.embedUrl } : {}),
      ...(input.contentUrl ? { contentUrl: input.contentUrl } : {}),
      publication,
    } : null,
  } as const;
}

export function selectLiveTvRelatedStories<T extends { id: string; categoryId: string }>(
  stories: readonly T[],
  relatedStoryId: string | null,
  relatedCategoryId: string | null,
  limit = 4,
) {
  const preferred = stories.filter(({ id }) => id === relatedStoryId);
  const category = stories.filter(({ id, categoryId }) => id !== relatedStoryId && categoryId === relatedCategoryId);
  const fallback = stories.filter(({ id, categoryId }) => id !== relatedStoryId && categoryId !== relatedCategoryId);
  return [...preferred, ...category, ...fallback].slice(0, limit);
}
