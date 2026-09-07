import { Fragment } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { getHeroImagePresentation } from "@/features/news/server/services/story-reader.model";

import { AdvertisementPlaceholder } from "@/components/common/advertisement-placeholder";
import { Badge } from "@/components/ui/badge";
import { ReadingProgress } from "@/features/news/components/reading-progress";
import { getStoryReaderData, type StoryReaderViewModel } from "@/features/news/server/services/story-reader.service";
import { ReporterBylineCard } from "@/features/reporters/reporter-byline-card";
import { buildPublicReporterUrl } from "@/features/reporters/public-reporter.model";

type StoryPageProps = { params: Promise<{ locale: string; slug: string }> };
type ReaderCard = StoryReaderViewModel["related"][number];

function SecondaryStoryImage({ story, sizes }: Readonly<{ story: ReaderCard; sizes: string }>) {
  return <Image src={story.image.src} alt={story.image.alt} fill loading="lazy" fetchPriority="auto" unoptimized={story.image.unoptimized} className="object-cover object-center" sizes={sizes} />;
}

function InlineRelatedCard({ story }: Readonly<{ story: ReaderCard }>) {
  return (
    <aside className="article-inline-related" aria-label="Related story">
      <Link href={story.href} className="group grid grid-cols-[112px_1fr] gap-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b3261e] sm:grid-cols-[160px_1fr]">
        <span className="relative aspect-[3/2] overflow-hidden bg-[#e7e0d4]"><SecondaryStoryImage story={story} sizes="160px" /></span>
        <span className="self-center"><span className="article-inline-related-label">Related story</span><strong className="mt-1 block font-heading text-[17px] leading-[1.28] group-hover:text-[#b3261e]">{story.title}</strong></span>
      </Link>
    </aside>
  );
}

function SidebarSection({ title, stories }: Readonly<{ title: string; stories: readonly ReaderCard[] }>) {
  if (!stories.length) return null;
  return (
    <section className="border-t border-[#14110f] pt-3">
      <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#6e655c]">{title}</h2>
      <div className="mt-2 divide-y divide-[#e3ddd3]">
        {stories.map((story) => <article key={story.id} className="py-3"><Link href={story.href} className="group grid grid-cols-[76px_1fr] gap-3"><span className="relative aspect-[4/3] overflow-hidden bg-[#e7e0d4]"><SecondaryStoryImage story={story} sizes="76px" /></span><span className="self-center font-heading text-[13px] font-semibold leading-[1.25] group-hover:text-[#b3261e]">{story.title}</span></Link></article>)}
      </div>
    </section>
  );
}

export async function generateMetadata({ params }: StoryPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const view = await getStoryReaderData(locale, slug);
  if (!view) notFound();
  return {
    title: view.metadata.title,
    description: view.metadata.description,
    authors: [{ name: view.story.author }],
    alternates: { canonical: view.metadata.canonical },
    openGraph: { ...view.metadata.openGraph, images: [...view.metadata.openGraph.images], publishedTime: view.story.publishedAt, modifiedTime: view.story.updatedAt, authors: [view.story.author], locale },
    twitter: { ...view.metadata.twitter, images: [...view.metadata.twitter.images] },
    other: { "article:reading_time": String(view.story.readTime) },
  };
}

export default async function StoryPage({ params }: StoryPageProps) {
  const { locale, slug } = await params;
  const view = await getStoryReaderData(locale, slug);
  if (!view) notFound();
  const [t, reporterT] = await Promise.all([
    getTranslations({ locale, namespace: "storyReader" }),
    getTranslations({ locale, namespace: "reporters" }),
  ]);
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" });
  const jsonLd = JSON.stringify(view.jsonLd).replace(/</gu, "\\u003c");
  const inlineByParagraph = new Map(view.inlineRelated.map((placement) => [placement.afterParagraph, placement.story]));
  const showUpdated = view.story.updatedAt !== view.story.publishedAt;
  const heroImagePresentation = getHeroImagePresentation(view.story.image);
  const reporterHref = view.story.reporter
    ? buildPublicReporterUrl(locale, view.story.reporter.slug)
    : null;

  return (
    <div className="bg-[#f6f3ed] pb-24 text-[#14110f] lg:pb-12">
      <ReadingProgress articleId="story-article" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <div className="mx-auto w-full max-w-[1180px] px-4 py-7 sm:px-6 sm:py-10">
        <Link href={`/${locale}`} className="text-[12px] font-semibold text-[#6e655c] hover:text-[#b3261e] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b3261e]">← {t("breadcrumb.home")}</Link>

        <div className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,760px)_320px] lg:gap-10">
          <article id="story-article" className="min-w-0">
            <header>
              <Badge variant="outline" className="rounded-[2px] border-0 p-0 text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#b3261e]">{view.story.category.name}</Badge>
              <h1 className="mt-3 max-w-[18ch] font-heading text-[38px] font-bold leading-[1.04] tracking-[-0.03em] sm:text-[50px] lg:text-[58px]">{view.story.title}</h1>
              <p className="mt-5 max-w-[60ch] font-heading text-[18px] leading-[1.55] text-[#4a423c] sm:text-[21px]">{view.story.summary}</p>
              <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-[#d8d0c5] py-4 text-[11.5px] text-[#6e655c]">
                {view.story.reporter && reporterHref ? (
                  <Link className="font-bold text-[#14110f] underline-offset-4 hover:text-[#b3261e] hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b3261e]" href={reporterHref}>
                    {view.story.author}
                  </Link>
                ) : (
                  <strong className="text-[#14110f]">{view.story.author}</strong>
                )}
                <span>{t("meta.published")} <time dateTime={view.story.publishedAt}>{dateTime.format(new Date(view.story.publishedAt))}</time></span>
                {showUpdated ? <span>{t("meta.updated")} <time dateTime={view.story.updatedAt}>{dateTime.format(new Date(view.story.updatedAt))}</time></span> : null}
                <span className="font-semibold text-[#14110f]">{t("meta.readTime", { minutes: view.story.readTime })}</span>
              </div>
            </header>

            <figure className="mt-7">
              <div className="relative aspect-[16/10] overflow-hidden border border-[#ded7cb] bg-[#e7e0d4]">
                <Image src={view.story.image.src} alt={view.story.image.alt} fill priority loading="eager" fetchPriority="high" unoptimized={view.story.image.unoptimized} className="object-cover object-center" style={{ objectFit: heroImagePresentation.objectFit, objectPosition: heroImagePresentation.objectPosition, maxWidth: heroImagePresentation.maxWidth, maxHeight: heroImagePresentation.maxHeight, margin: "auto" }} sizes="(min-width: 1024px) 760px, 100vw" />
              </div>
              {view.story.image.caption ? <figcaption className="mt-2 border-l-2 border-[#b3261e] pl-3 text-[11.5px] leading-relaxed text-[#6e655c]">{view.story.image.caption}</figcaption> : null}
            </figure>

            <div className="article-plain-body mt-10 max-w-[66ch] font-heading text-[18px] leading-[1.78] text-[#221e1b] sm:text-[18.5px]">
              {view.story.paragraphs.map((paragraph, index) => {
                const paragraphNumber = index + 1;
                const inlineStory = inlineByParagraph.get(paragraphNumber);
                return <Fragment key={`${index}-${paragraph.slice(0, 24)}`}><p>{paragraph}</p>{inlineStory ? <InlineRelatedCard story={inlineStory} /> : null}</Fragment>;
              })}
            </div>

            {view.story.reporter && reporterHref ? (
              <div className="mt-10">
                <ReporterBylineCard
                  href={reporterHref}
                  labels={{
                    status: reporterT("status.label"),
                    statusValues: {
                      verified: reporterT("status.verified"),
                      former: reporterT("status.former"),
                      suspended: reporterT("status.suspended"),
                    },
                    district: reporterT("district"),
                    beats: reporterT("beats"),
                    profile: reporterT("viewProfile"),
                  }}
                  reporter={view.story.reporter}
                />
              </div>
            ) : (
              <section className="mt-10 border-y border-[#d8d0c5] py-6" aria-label="Author information">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#b3261e]">{t("sections.author")}</p>
                <h2 className="mt-2 font-heading text-[22px] font-bold">{view.story.author}</h2>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-[#6e655c]"><time dateTime={view.story.publishedAt}>{dateTime.format(new Date(view.story.publishedAt))}</time>{showUpdated ? <time dateTime={view.story.updatedAt}>{t("meta.updated")} {dateTime.format(new Date(view.story.updatedAt))}</time> : null}<span>{t("meta.readTime", { minutes: view.story.readTime })}</span></div>
              </section>
            )}

            {view.story.tags.length ? <section className="mt-8" aria-labelledby="story-tags"><h2 id="story-tags" className="text-[10px] font-bold uppercase tracking-[0.16em]">{t("sections.tags")}</h2><div className="mt-3 flex flex-wrap gap-2">{view.story.tags.map((tag) => <Badge key={tag} variant="outline" className="rounded-[2px] text-[11px]">{tag}</Badge>)}</div></section> : null}

            {(view.previous || view.next) ? <nav className="mt-10 grid border-y border-[#14110f] sm:grid-cols-2" aria-label="Article navigation">{view.previous ? <Link href={view.previous.href} className="group py-5 pr-5"><span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#6e655c]">← {t("sections.previous")}</span><strong className="mt-2 block font-heading text-[17px] leading-[1.3] group-hover:text-[#b3261e]">{view.previous.title}</strong></Link> : <span />}{view.next ? <Link href={view.next.href} className="group border-t border-[#d8d0c5] py-5 sm:border-l sm:border-t-0 sm:pl-5 sm:text-right"><span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#6e655c]">{t("sections.next")} →</span><strong className="mt-2 block font-heading text-[17px] leading-[1.3] group-hover:text-[#b3261e]">{view.next.title}</strong></Link> : null}</nav> : null}
          </article>

          <aside className="hidden lg:block" aria-label="Article sidebar">
            <div className="sticky top-20 space-y-6">
              <SidebarSection title={t("sections.trending")} stories={view.sidebar.trending} />
              <SidebarSection title={t("sections.latest")} stories={view.sidebar.latest} />
              <SidebarSection title={t("sections.editorPicks")} stories={view.sidebar.editorPicks} />
              <SidebarSection title={t("sections.breaking")} stories={view.sidebar.breaking} />
              <section className="border border-[#14110f] bg-[#fbf9f5] p-4"><h2 className="text-[10px] font-bold uppercase tracking-[0.16em]">{t("sections.newsletter")}</h2><p className="mt-2 text-[12px] leading-relaxed text-[#6e655c]">Essential INBCN reporting, delivered daily.</p><div className="mt-3 flex"><input aria-label="Email address" type="email" className="min-w-0 flex-1 border border-[#d8d0c5] bg-white px-2 text-[11px]" /><button type="button" className="bg-[#b3261e] px-3 py-2 text-[10px] font-bold text-white">Sign up</button></div></section>
              <AdvertisementPlaceholder size="rectangle" label={t("advertisement")} />
            </div>
          </aside>
        </div>

        {view.related.length ? <section className="mt-12 border-t-2 border-[#14110f] pt-5" aria-labelledby="related-stories"><h2 id="related-stories" className="font-heading text-[22px] font-bold">{t("sections.related")}</h2><div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{view.related.slice(0, 3).map((story) => <article key={story.id}><Link href={story.href} className="group"><div className="relative aspect-[3/2] overflow-hidden border border-[#ded7cb] bg-[#e7e0d4]"><SecondaryStoryImage story={story} sizes="(min-width: 1024px) 33vw, 50vw" /></div><h3 className="mt-3 font-heading text-[17px] font-semibold leading-[1.3] group-hover:text-[#b3261e]">{story.title}</h3></Link><p className="mt-2 text-[12px] text-[#6e655c]">{story.author}</p></article>)}</div></section> : null}
      </div>
    </div>
  );
}
