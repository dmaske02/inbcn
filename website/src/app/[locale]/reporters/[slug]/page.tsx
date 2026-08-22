import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { StoryCard } from "@/components/common/story-card";
import { Badge } from "@/components/ui/badge";
import { env } from "@/config/env";
import {
  buildPublicStoryUrl,
  resolvePublicStoryImage,
} from "@/features/news/server/services/story-reader.model";
import {
  composePublicReporterMetadata,
  type PublicReporterStatus,
} from "@/features/reporters/public-reporter.model";
import { getPublicReporter } from "@/features/reporters/public-reporter.repository";

type ReporterPageProps = Readonly<{
  params: Promise<{ locale: string; slug: string }>;
}>;

export async function generateMetadata({
  params,
}: ReporterPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const profile = await getPublicReporter(slug, locale);
  if (!profile) notFound();
  const metadata = composePublicReporterMetadata({
    reporter: profile.reporter,
    locale,
    siteUrl: env.public.appUrl ?? "http://localhost:3000",
  });
  if (!metadata) notFound();

  return {
    title: metadata.title,
    description: metadata.description,
    alternates: { canonical: metadata.canonical },
    openGraph: {
      ...metadata.openGraph,
      images: [...metadata.openGraph.images],
      locale,
    },
    twitter: {
      ...metadata.twitter,
      images: [...metadata.twitter.images],
    },
  };
}

export default async function ReporterPage({ params }: ReporterPageProps) {
  const { locale, slug } = await params;
  const profile = await getPublicReporter(slug, locale);
  if (!profile) notFound();

  const t = await getTranslations({ locale, namespace: "reporters" });
  const { reporter, stories } = profile;
  const statusLabels: Readonly<Record<PublicReporterStatus, string>> = {
    verified: t("status.verified"),
    former: t("status.former"),
    suspended: t("status.suspended"),
  };

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-7 sm:px-6 sm:py-10">
      <Link
        className="text-[12px] font-semibold text-[#6e655c] hover:text-[#b3261e] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b3261e]"
        href={`/${locale}`}
      >
        ← {t("home")}
      </Link>

      <header className="mt-7 grid gap-6 border-b-2 border-[#14110f] pb-8 sm:grid-cols-[144px_1fr] sm:items-center">
        <div className="relative size-36 overflow-hidden rounded-full border border-[#d8d0c5] bg-[#e7e0d4]">
          <Image
            alt={reporter.legalName}
            className="object-cover"
            fill
            priority
            sizes="144px"
            src={reporter.photoUrl}
          />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-[36px] font-bold leading-tight tracking-[-0.02em] sm:text-[46px]">
              {reporter.legalName}
            </h1>
            <Badge
              aria-label={`${t("status.label")}: ${statusLabels[reporter.status]}`}
              className="rounded-[2px]"
              variant="outline"
            >
              {statusLabels[reporter.status]}
            </Badge>
          </div>
          <p className="mt-2 text-[13px] text-[#6e655c]">
            {t("district")}: {reporter.district}
          </p>
          {reporter.bio ? (
            <p className="mt-4 max-w-[65ch] text-[15px] leading-relaxed text-[#4a423c]">
              {reporter.bio}
            </p>
          ) : null}
          {reporter.beats.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2" aria-label={t("beats")}>
              {reporter.beats.map((beat) => (
                <Badge className="rounded-[2px]" key={beat} variant="secondary">
                  {beat}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      <section className="mt-10" aria-labelledby="reporter-stories">
        <h2 id="reporter-stories" className="font-heading text-[26px] font-bold">
          {t("publishedStories")}
        </h2>
        {stories.length > 0 ? (
          <div className="mt-4 divide-y divide-[#e3ddd3] border-t border-[#e3ddd3]">
            {stories.map((story) => {
              const image = resolvePublicStoryImage(
                story.featuredMedia,
                story.externalImageUrl,
                env.public.cloudinaryCloudName,
                story.title,
                story.externalImageWidth,
                story.externalImageHeight,
              );
              return (
                <StoryCard
                  author={reporter.legalName}
                  className="py-6"
                  href={buildPublicStoryUrl(locale, story.slug)}
                  image={{
                    src: image.src,
                    alt: image.alt,
                    unoptimized: image.unoptimized,
                    width: image.width ?? undefined,
                    height: image.height ?? undefined,
                  }}
                  key={story.id}
                  locale={locale}
                  publishedAt={story.publishedAt}
                  summary={story.summary}
                  title={story.title}
                  variant="horizontal"
                />
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-[14px] text-[#6e655c]">{t("noStories")}</p>
        )}
      </section>
    </div>
  );
}
