import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { env } from "@/config/env";
import { buildPublicReporterUrl, type PublicReporterStatus } from "@/features/reporters/public-reporter.model";
import { ReporterBylineCard } from "@/features/reporters/reporter-byline-card";
import { ReplayPlayer } from "@/features/replays/replay-player";
import { getPublicReplay } from "@/features/replays/replay.service";

type ReplayPageProps = Readonly<{
  params: Promise<{ locale: string; id: string }>;
}>;

function replayUrl(locale: string, id: string): string {
  return `/${locale}/replays/${id}`;
}

export async function generateMetadata({ params }: ReplayPageProps): Promise<Metadata> {
  const { locale, id } = await params;
  const replay = await getPublicReplay(id, locale);
  if (!replay) notFound();
  const canonical = new URL(
    replayUrl(locale, id),
    `${(env.public.appUrl ?? "http://localhost:3000").replace(/\/$/u, "")}/`,
  ).toString();
  return {
    title: replay.title,
    description: replay.description,
    alternates: { canonical },
    openGraph: {
      title: replay.title,
      description: replay.description,
      type: "video.other",
      url: canonical,
      locale,
      images: [{
        url: replay.thumbnail.url,
        alt: replay.thumbnail.alt,
        width: replay.thumbnail.width ?? undefined,
        height: replay.thumbnail.height ?? undefined,
      }],
    },
    twitter: {
      card: "summary_large_image",
      title: replay.title,
      description: replay.description,
      images: [replay.thumbnail.url],
    },
  };
}

export default async function ReplayPage({ params }: ReplayPageProps) {
  const { locale, id } = await params;
  const replay = await getPublicReplay(id, locale);
  if (!replay) notFound();
  const [t, reporterT] = await Promise.all([
    getTranslations({ locale, namespace: "replays" }),
    getTranslations({ locale, namespace: "reporters" }),
  ]);
  const siteUrl = (env.public.appUrl ?? "http://localhost:3000").replace(/\/$/u, "");
  const canonical = new URL(replayUrl(locale, id), `${siteUrl}/`).toString();
  const contentUrl = new URL(replay.playbackUrl, `${siteUrl}/`).toString();
  const reporterHref = buildPublicReporterUrl(locale, replay.reporter.slug);
  if (!reporterHref) notFound();
  const statuses: Readonly<Record<PublicReporterStatus, string>> = {
    verified: reporterT("status.verified"),
    former: reporterT("status.former"),
    suspended: reporterT("status.suspended"),
  };
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" });
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: replay.title,
    description: replay.description,
    thumbnailUrl: [replay.thumbnail.url],
    uploadDate: replay.publishedAt,
    duration: `PT${Math.ceil(replay.durationSeconds)}S`,
    contentUrl,
    url: canonical,
    author: { "@type": "Person", name: replay.reporter.legalName, url: new URL(reporterHref, `${siteUrl}/`).toString() },
  }).replace(/</gu, "\\u003c");

  return (
    <div className="bg-[#f6f3ed] pb-20 text-[#14110f]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <main className="mx-auto w-full max-w-[1080px] px-4 py-7 sm:px-6 sm:py-10">
        <nav aria-label={t("breadcrumb")} className="text-xs font-semibold text-[#6e655c]">
          <Link className="hover:text-[#b3261e]" href={`/${locale}`}>{t("home")}</Link>
          <span aria-hidden="true" className="mx-2">/</span>
          <span aria-current="page">{t("replay")}</span>
        </nav>

        <article className="mt-7">
          <header className="border-b-2 border-[#14110f] pb-7">
            <Badge className="rounded-[2px]" variant="outline">{replay.category.name}</Badge>
            <h1 className="mt-4 max-w-[20ch] font-heading text-[38px] font-bold leading-[1.05] tracking-[-0.03em] sm:text-[54px]">
              {replay.title}
            </h1>
            <p className="mt-5 max-w-[65ch] text-[17px] leading-7 text-[#4a423c]">{replay.description}</p>
            <p className="mt-5 text-xs text-[#6e655c]">
              {t("published")} <time dateTime={replay.publishedAt}>{dateTime.format(new Date(replay.publishedAt))}</time>
            </p>
          </header>

          <section aria-labelledby="replay-player-title" className="mt-7 overflow-hidden border border-[#14110f] bg-black">
            <h2 className="sr-only" id="replay-player-title">{t("playerTitle")}</h2>
            <ReplayPlayer
              fallback={t("playerFallback")}
              label={t("playerLabel", { title: replay.title })}
              replay={replay}
            />
          </section>

          <section aria-labelledby="replay-details" className="mt-8">
            <h2 className="font-heading text-2xl font-bold" id="replay-details">{t("details")}</h2>
            <dl className="mt-4 grid gap-4 border-y border-[#d8d0c5] py-5 text-sm sm:grid-cols-2">
              <div><dt className="font-semibold">{t("recorded")}</dt><dd className="mt-1 text-[#6e655c]"><time dateTime={replay.recordingStartedAt}>{dateTime.format(new Date(replay.recordingStartedAt))}</time></dd></div>
              <div><dt className="font-semibold">{t("duration")}</dt><dd className="mt-1 text-[#6e655c]">{t("durationSeconds", { seconds: Math.ceil(replay.durationSeconds) })}</dd></div>
            </dl>
          </section>

          <div className="mt-10">
            <ReporterBylineCard
              href={reporterHref}
              labels={{
                status: reporterT("status.label"),
                statusValues: statuses,
                district: reporterT("district"),
                beats: reporterT("beats"),
                profile: t("reporter.profile"),
              }}
              reporter={replay.reporter}
            />
          </div>
        </article>
      </main>
    </div>
  );
}
