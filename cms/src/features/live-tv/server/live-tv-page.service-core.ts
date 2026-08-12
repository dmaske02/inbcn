import {
  composeLiveTvPageData,
  type LiveTvPageLabels,
  type LiveTvPageViewModel,
} from "./live-tv-page.model.ts";
import type { LiveStreamViewModel } from "./live-tv.types.ts";
import type { HomepageStory } from "@/features/news/server/services/homepage.model";

type PageNews = Readonly<{
  breaking: readonly HomepageStory[];
  latest: readonly HomepageStory[];
  all?: readonly HomepageStory[];
}>;

export type LiveTvPageDataDependencies = Readonly<{
  getStreams(locale: string): Promise<readonly LiveStreamViewModel[]>;
  getNews(locale: string): Promise<PageNews>;
  getLabels(locale: string): Promise<LiveTvPageLabels>;
  getAllowedHlsHosts?: () => readonly string[];
  now?: () => Date;
}>;

export function createLiveTvPageDataService(
  dependencies: LiveTvPageDataDependencies,
) {
  return async function getLiveTvPageData(
    locale: string,
  ): Promise<LiveTvPageViewModel> {
    const [streams, news, labels] = await Promise.all([
      dependencies.getStreams(locale).catch(() => []),
      dependencies.getNews(locale).catch(() => ({ breaking: [], latest: [], all: [] })),
      dependencies.getLabels(locale),
    ]);
    return composeLiveTvPageData({
      locale,
      streams,
      breaking: news.breaking,
      latest: news.latest,
      allStories: news.all,
      labels,
      now: dependencies.now?.() ?? new Date(),
      allowedHlsHosts: dependencies.getAllowedHlsHosts?.() ?? [],
    });
  };
}
