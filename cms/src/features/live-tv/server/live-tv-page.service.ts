import "server-only";

import { cache } from "react";
import { getTranslations } from "next-intl/server";

import { getHomepageData } from "@/features/news/server/services/homepage.service";
import { mapLiveStreamRow } from "./live-tv.model.ts";
import { getPublicLiveChannelsByLanguage } from "./live-tv.repository.ts";
import { createLiveTvPageDataService } from "./live-tv-page.service-core.ts";

const loadLiveTvPageData = createLiveTvPageDataService({
  getAllowedHlsHosts() {
    return (process.env.LIVE_TV_HLS_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim().toLocaleLowerCase("en"))
      .filter(Boolean);
  },
  async getStreams(locale) {
    const rows = await getPublicLiveChannelsByLanguage(locale);
    return rows.map((row) => mapLiveStreamRow(row).view);
  },
  async getNews(locale) {
    const homepage = await getHomepageData(locale);
    return { breaking: homepage.breaking, latest: homepage.latest, all: homepage.all };
  },
  async getLabels(locale) {
    const t = await getTranslations({ locale, namespace: "liveTvPage" });
    return {
      pageTitle: t("title"),
      live: t("live"),
      nowPlaying: t("nowPlaying"),
      liveNow: t("liveNow"),
      liveUntil: (time: string) => t("liveUntil", { time }),
      scheduled: t("scheduled"),
      startsAt: (time: string) => t("startsAt", { time }),
      offline: t("offline"),
      defaultOfflineMessage: t("defaultOfflineMessage"),
      provider: {
        youtube: t("youtubeProvider"),
        hls: t("hlsProvider"),
      },
      sections: { breaking: t("breaking"), latest: t("latest"), related: t("related"), schedule: t("schedule") },
      schedule: { current: t("current"), upcoming: t("upcoming"), completed: t("completed"), archive: t("archive"), offline: t("offline") },
      share: { label: t("share"), copied: t("copied") },
      advertisement: t("advertisement"),
      player: {
        play: t("play"),
        loading: t("playerLoading"),
        offline: t("playerOffline"),
        unavailable: t("playerUnavailable"),
        unsupported: t("unsupportedBrowser"),
        youtubeUnavailable: t("youtubeUnavailable"),
        hlsUnavailable: t("hlsUnavailable"),
      },
      playerLabel: t("playerLabel"),
      home: t("home"),
    };
  },
});

export const getLiveTvPageData = cache(loadLiveTvPageData);
