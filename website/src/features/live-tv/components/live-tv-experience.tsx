import { CalendarClock, Radio } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { ShareButton } from "@/components/common/share-button";
import { EditorialSponsorRow } from "@/components/editorial";
import { env } from "@/config/env";
import { LiveViewer } from "@/features/live-broadcast-viewer/components/live-viewer";
import type { ViewerSession } from "@/features/live-broadcast-viewer/models/viewer.model";
import { routing } from "@/i18n/routing";
import { LiveTvPlayer } from "../player/live-tv-player";
import { buildLiveTvJsonLd, composeLiveTvMetadata } from "../server/live-tv-editorial.model";
import type { LiveTvPageViewModel } from "../server/live-tv-page.model.ts";
import { LiveTvStorySection } from "./live-tv-story-section";

export function LiveTvExperience({
  data,
  internalBroadcast,
}: Readonly<{
  data: LiveTvPageViewModel;
  internalBroadcast?: ViewerSession;
}>) {
  const { labels } = data;
  const source = data.stream ?? data.nextScheduled;
  const metadata = composeLiveTvMetadata({
    siteUrl: env.public.appUrl ?? "http://localhost:3000",
    locale: data.locale,
    locales: routing.locales,
    title: source?.seoTitle ?? labels.pageTitle,
    description: source?.seoDescription ?? source?.description ?? data.offline.message,
    imageUrl: source?.socialImageUrl ?? source?.poster.src ?? data.offline.poster.src,
  });
  const structuredData = buildLiveTvJsonLd({
    canonical: metadata.canonical,
    homeUrl: metadata.languages[data.locale].replace(/\/live-tv$/u, ""),
    pageTitle: labels.pageTitle,
    description: metadata.description,
    imageUrl: metadata.openGraph.images[0],
    programme: source,
    embedUrl: source?.provider === "youtube" && source.playback.providerStreamId
      ? `https://www.youtube-nocookie.com/embed/${source.playback.providerStreamId}`
      : undefined,
    contentUrl: source?.provider === "hls" ? source.playback.streamUrl ?? undefined : undefined,
  });
  const jsonLd = JSON.stringify(Object.values(structuredData)).replace(/</gu, "\\u003c");
  const offlineFallback = (
    <div className="editorial-live-offline aspect-video">
      <Image
        src={data.offline.poster.src}
        alt={data.offline.poster.alt}
        fill
        priority
        unoptimized={data.offline.poster.unoptimized}
        sizes="(min-width: 1280px) 860px, 100vw"
      />
      <div className="editorial-live-offline-shade" />
      <div className="editorial-live-offline-copy">
        <p className="editorial-live-kicker">{labels.offline}</p>
        <h2 id="live-broadcast-title">{labels.pageTitle}</h2>
        <p>{data.offline.message}</p>
        {data.nextScheduled ? (
          <div className="editorial-live-next">
            <p>
              <CalendarClock aria-hidden="true" />
              {labels.scheduled}
            </p>
            <h3>{data.nextScheduled.title}</h3>
            <small>{data.nextScheduled.statusLabel}</small>
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="editorial-live-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <div className="editorial-container editorial-live-page-inner">
        <nav aria-label="Breadcrumb" className="editorial-live-breadcrumb">
          <Link href={`/${data.locale}`}>{labels.home}</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{labels.pageTitle}</span>
        </nav>

        <header className="editorial-live-page-header">
          <div>
            <p>{data.mode === "live" ? labels.live : labels.offline}</p>
            <h1>{labels.pageTitle}</h1>
          </div>
          <p>{data.mode === "live" ? data.stream?.statusLabel : data.offline.message}</p>
        </header>

        <div className="editorial-live-briefing">
          <section aria-labelledby="live-broadcast-title" className="editorial-live-broadcast">
            {internalBroadcast ? (
              <LiveViewer
                session={internalBroadcast}
                offlineFallback={offlineFallback}
              />
            ) : data.mode === "live" && data.stream ? (
              <div className="editorial-live-programme">
                <LiveTvPlayer
                  key={data.stream.id}
                  programme={data.stream}
                  ariaLabel={labels.playerLabel ?? labels.pageTitle}
                  liveLabel={labels.live}
                  labels={labels.player}
                />
                <div className="editorial-live-programme-copy">
                  <div>
                    <p className="editorial-live-kicker">
                      <Radio aria-hidden="true" />
                      {labels.nowPlaying}
                    </p>
                    <h2 id="live-broadcast-title">{data.stream.title}</h2>
                    <p>{data.stream.description}</p>
                  </div>
                  <div className="editorial-live-programme-meta">
                    <strong>{data.stream.statusLabel}</strong>
                    <small>{data.stream.providerLabel}</small>
                  </div>
                </div>
              </div>
            ) : offlineFallback}
          </section>

          <section className="editorial-live-schedule" aria-labelledby="live-tv-schedule-title">
            <div className="editorial-live-schedule-head">
              <h2 id="live-tv-schedule-title">{labels.sections.schedule}</h2>
              <ShareButton
                title={metadata.title}
                text={metadata.description}
                url={metadata.canonical}
                label={labels.share.label}
                copiedLabel={labels.share.copied}
              />
            </div>
            {data.schedule.length ? (
              <ol aria-label={labels.sections.schedule}>
                {data.schedule.map((item) => (
                  <li
                    key={item.id}
                    aria-current={item.isCurrent ? "true" : undefined}
                    data-current={item.isCurrent ? "true" : undefined}
                  >
                    <time dateTime={item.startsAt ?? undefined}>{item.timeLabel}</time>
                    <div>
                      <h3>{item.title}</h3>
                      <p>{item.description}</p>
                    </div>
                    <span>{labels.schedule[item.state]}</span>
                  </li>
                ))}
              </ol>
            ) : <p className="editorial-live-schedule-empty">{data.offline.message}</p>}
            <p className="sr-only" role="status" aria-live="polite">
              {data.schedule.find((item) => item.isCurrent)?.title ?? data.offline.message}
            </p>
          </section>
        </div>

        <EditorialSponsorRow
          className="editorial-live-sponsor"
          label={labels.advertisement}
          slotId="live-tv-feed"
        />

        <div className="editorial-live-stories">
          <LiveTvStorySection
            id="live-breaking-news"
            title={labels.sections.breaking}
            stories={data.breaking}
            locale={data.locale}
            emphasis
          />
          <LiveTvStorySection
            id="live-related-stories"
            title={labels.sections.related}
            stories={data.related}
            locale={data.locale}
          />
          <LiveTvStorySection
            id="live-latest-stories"
            title={labels.sections.latest}
            stories={data.latest}
            locale={data.locale}
          />
        </div>
      </div>
    </div>
  );
}
