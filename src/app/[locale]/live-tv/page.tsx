import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { LiveTvExperience } from "@/features/live-tv/components/live-tv-experience";
import { getLiveTvPageData } from "@/features/live-tv/server/live-tv-page.service";
import { routing } from "@/i18n/routing";
import { env } from "@/config/env";
import { composeLiveTvMetadata } from "@/features/live-tv/server/live-tv-editorial.model";

type LiveTvPageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: LiveTvPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const data = await getLiveTvPageData(locale);
  const source = data.stream ?? data.nextScheduled;
  const model = composeLiveTvMetadata({
    siteUrl: env.public.appUrl ?? "http://localhost:3000",
    locale,
    locales: routing.locales,
    title: source?.seoTitle ?? data.labels.pageTitle,
    description: source?.seoDescription ?? source?.description ?? data.offline.message,
    imageUrl: source?.socialImageUrl ?? source?.poster.src ?? data.offline.poster.src,
  });
  return {
    title: model.title,
    description: model.description,
    alternates: { canonical: model.canonical, languages: model.languages },
    openGraph: { ...model.openGraph, images: [...model.openGraph.images], locale },
    twitter: { ...model.twitter, images: [...model.twitter.images] },
  };
}

export default async function LiveTvPage({ params }: LiveTvPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const data = await getLiveTvPageData(locale);
  return <LiveTvExperience data={data} />;
}
