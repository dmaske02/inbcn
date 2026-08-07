import Image from "next/image";
import Link from "next/link";
import { CalendarClock, Radio } from "lucide-react";

import { AdvertisementPlaceholder } from "@/components/common/advertisement-placeholder";
import type { LiveTvPageViewModel } from "../server/live-tv-page.model.ts";
import { LiveTvStorySection } from "./live-tv-story-section";
import { LiveTvPlayer } from "../player/live-tv-player";
import { ShareButton } from "@/components/common/share-button";
import { buildLiveTvJsonLd, composeLiveTvMetadata } from "../server/live-tv-editorial.model";
import { env } from "@/config/env";
import { routing } from "@/i18n/routing";

export function LiveTvExperience({
  data,
}: Readonly<{ data: LiveTvPageViewModel }>) {
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
  return (
    <div className="bg-[#f6f3ed] pb-16 text-[#14110f] sm:pb-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <div className="mx-auto w-full max-w-[1288px] px-4 py-7 sm:px-6 sm:py-10">
        <nav aria-label="Breadcrumb" className="text-xs font-semibold text-[#6e655c]">
          <Link href={`/${data.locale}`} className="hover:text-[#b3261e]">
            {labels.home}
          </Link>
          <span aria-hidden="true" className="mx-2">/</span>
          <span aria-current="page">{labels.pageTitle}</span>
        </nav>

        <header className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b-2 border-[#14110f] pb-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#b3261e]">
              {data.mode === "live" ? labels.live : labels.offline}
            </p>
            <h1 className="mt-2 text-[34px] font-bold leading-none tracking-[-0.03em] sm:text-[46px]">
              {labels.pageTitle}
            </h1>
          </div>
          <p className="max-w-[42ch] text-sm leading-6 text-[#6e655c]">
            {data.mode === "live" ? data.stream?.statusLabel : data.offline.message}
          </p>
        </header>

        <section aria-labelledby="live-broadcast-title" className="mt-7">
          {data.mode === "live" && data.stream ? (
            <div className="grid overflow-hidden border border-[#14110f] bg-[#fbf9f5] lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,.65fr)]">
              <LiveTvPlayer
                key={data.stream.id}
                programme={data.stream}
                ariaLabel={labels.playerLabel ?? labels.pageTitle}
                liveLabel={labels.live}
                labels={labels.player}
              />
              <div className="flex flex-col justify-between p-6 sm:p-8">
                <div>
                  <p className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#b3261e]">
                    <Radio aria-hidden="true" className="size-3.5" />
                    {labels.nowPlaying}
                  </p>
                  <h2 id="live-broadcast-title" className="mt-4 text-2xl font-bold leading-tight sm:text-3xl">
                    {data.stream.title}
                  </h2>
                  <p className="mt-4 text-sm leading-6 text-[#5c534b]">
                    {data.stream.description}
                  </p>
                </div>
                <div className="mt-8 border-t border-[#d8d0c5] pt-4">
                  <p className="text-xs font-semibold">{data.stream.statusLabel}</p>
                  <p className="mt-1 text-[11px] text-[#8a7f73]">{data.stream.providerLabel}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="relative min-h-[360px] overflow-hidden border border-[#39312c] bg-[#14110f] text-white sm:min-h-[460px]">
              <Image
                src={data.offline.poster.src}
                alt={data.offline.poster.alt}
                fill
                priority
                unoptimized={data.offline.poster.unoptimized}
                sizes="(min-width: 1280px) 1288px, 100vw"
                className="object-cover opacity-30"
              />
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(20,17,15,0.94),rgba(20,17,15,0.58))]" />
              <div className="relative flex min-h-[360px] max-w-2xl flex-col justify-end p-7 sm:min-h-[460px] sm:p-12">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#efb2ac]">{labels.offline}</p>
                <h2 id="live-broadcast-title" className="mt-3 text-3xl font-bold tracking-[-0.02em] sm:text-5xl">
                  {labels.pageTitle}
                </h2>
                <p className="mt-5 max-w-[58ch] text-sm leading-6 text-white/75 sm:text-base">
                  {data.offline.message}
                </p>
                {data.nextScheduled ? (
                  <div className="mt-7 border-l-2 border-[#b3261e] pl-4">
                    <p className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-white/60">
                      <CalendarClock aria-hidden="true" className="size-4" />
                      {labels.scheduled}
                    </p>
                    <h3 className="mt-2 text-xl font-bold">{data.nextScheduled.title}</h3>
                    <p className="mt-1 text-sm text-white/70">{data.nextScheduled.statusLabel}</p>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </section>

        <AdvertisementPlaceholder className="mt-8" label={labels.advertisement} />

        <section className="mt-10 border-y border-[#d8d0c5] py-5" aria-labelledby="live-tv-schedule-title">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 id="live-tv-schedule-title" className="text-2xl font-bold">{labels.sections.schedule}</h2>
            <ShareButton title={metadata.title} text={metadata.description} url={metadata.canonical} label={labels.share.label} copiedLabel={labels.share.copied} />
          </div>
          {data.schedule.length ? (
            <ol className="mt-5 divide-y divide-[#d8d0c5]" aria-label={labels.sections.schedule}>
              {data.schedule.map((item) => (
                <li key={item.id} aria-current={item.isCurrent ? "true" : undefined} className={`grid gap-2 py-4 sm:grid-cols-[180px_1fr_auto] sm:items-center ${item.isCurrent ? "border-l-2 border-[#b3261e] bg-[#fbf9f5] pl-4" : ""}`}>
                  <time dateTime={item.startsAt ?? undefined} className="text-xs font-semibold text-[#6e655c]">{item.timeLabel}</time>
                  <div><h3 className="font-heading text-lg font-bold">{item.title}</h3><p className="mt-1 text-sm text-[#6e655c]">{item.description}</p></div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#b3261e]">{labels.schedule[item.state]}</span>
                </li>
              ))}
            </ol>
          ) : <p className="mt-4 text-sm text-[#6e655c]">{data.offline.message}</p>}
          <p className="sr-only" role="status" aria-live="polite">{data.schedule.find((item) => item.isCurrent)?.title ?? data.offline.message}</p>
        </section>

        <div className="mt-12 space-y-12">
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
