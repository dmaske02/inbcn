import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { AdvertisementPlaceholder } from "@/components/common/advertisement-placeholder";
import { Breadcrumb } from "@/components/common/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { StoryShareActions } from "@/features/news/components/story-share-actions";
import { getStoryReaderData } from "@/features/news/server/services/story-reader.service";

type StoryPageProps = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: StoryPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const view = await getStoryReaderData(locale, slug);
  if (!view) notFound();
  return {
    title: view.metadata.title,
    description: view.metadata.description,
    alternates: { canonical: view.metadata.canonical },
    openGraph: {
      ...view.metadata.openGraph,
      images: [...view.metadata.openGraph.images],
      publishedTime: view.story.publishedAt,
      modifiedTime: view.story.updatedAt,
      locale,
    },
    twitter: {
      ...view.metadata.twitter,
      images: [...view.metadata.twitter.images],
    },
  };
}

export default async function StoryPage({ params }: StoryPageProps) {
  const { locale, slug } = await params;
  const view = await getStoryReaderData(locale, slug);
  if (!view) notFound();
  const t = await getTranslations({ locale, namespace: "storyReader" });
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" });
  const jsonLd = JSON.stringify(view.jsonLd).replace(/</gu, "\\u003c");

  return (
    <article className="mx-auto w-full max-w-[1360px] px-6 py-8 sm:py-10 lg:py-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <div className="mx-auto max-w-5xl">
        <Breadcrumb items={[
          { label: t("breadcrumb.home"), href: `/${locale}` },
          { label: view.story.category.name, href: view.story.category.href },
          { label: view.story.title },
        ]} />
        <header className="mt-7 border-t-2 border-foreground pt-6">
          <Badge variant="signal">{view.story.category.name}</Badge>
          <h1 className="mt-5 max-w-4xl text-4xl font-semibold leading-[1.08] tracking-tight text-balance sm:text-5xl lg:text-6xl">{view.story.title}</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground sm:text-xl">{view.story.summary}</p>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-y border-border py-4 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{view.story.author}</span>
            <span>{t("meta.published")}: <time dateTime={view.story.publishedAt}>{dateTime.format(new Date(view.story.publishedAt))}</time></span>
            <span>{t("meta.updated")}: <time dateTime={view.story.updatedAt}>{dateTime.format(new Date(view.story.updatedAt))}</time></span>
            <span>{t("meta.readTime", { minutes: view.story.readTime })}</span>
          </div>
        </header>

        <figure className="mt-8">
          <div className="relative aspect-video overflow-hidden rounded-sm bg-muted">
            <Image src={view.story.image.src} alt={view.story.image.alt} fill priority unoptimized className="object-cover" sizes="(min-width: 1024px) 1024px, 100vw" />
          </div>
          {view.story.image.caption ? <figcaption className="mt-2 text-sm text-muted-foreground">{view.story.image.caption}</figcaption> : null}
        </figure>

        <AdvertisementPlaceholder className="mt-8" label={t("advertisement")} />

        <div className="mx-auto mt-10 max-w-[720px] space-y-6 text-lg leading-8 text-foreground sm:text-xl sm:leading-9">
          {view.story.paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>)}
        </div>

        {view.story.tags.length ? <section className="mx-auto mt-10 max-w-[720px] border-t border-border pt-6" aria-labelledby="story-tags"><h2 id="story-tags" className="text-sm font-semibold uppercase tracking-wider">{t("sections.tags")}</h2><div className="mt-3 flex flex-wrap gap-2">{view.story.tags.map((tag)=><Badge key={tag} variant="outline">{tag}</Badge>)}</div></section> : null}

        <section className="mx-auto mt-10 max-w-[720px] border-t border-border pt-6" aria-labelledby="story-share">
          <h2 id="story-share" className="mb-4 text-lg font-semibold">{t("sections.share")}</h2>
          <StoryShareActions title={view.story.title} url={view.metadata.canonical} labels={{ copy:t("share.copy"), copied:t("share.copied"), x:t("share.x"), facebook:t("share.facebook"), linkedin:t("share.linkedin"), email:t("share.email") }} />
        </section>
      </div>

      {view.related.length ? <section className="mt-14 border-t-2 border-foreground pt-5" aria-labelledby="related-stories"><h2 id="related-stories" className="text-2xl font-semibold tracking-tight">{t("sections.related")}</h2><div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{view.related.map((story)=><article key={story.id} className="border-t border-border pt-4"><Link href={story.href} className="group"><div className="relative aspect-video overflow-hidden bg-muted"><Image src={story.image.src} alt={story.image.alt} fill unoptimized className="object-cover transition-transform duration-200 group-hover:scale-[1.02]" sizes="(min-width: 1024px) 25vw, 50vw" /></div><h3 className="mt-3 text-lg font-semibold leading-6 group-hover:underline">{story.title}</h3></Link><p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{story.summary}</p><p className="mt-3 text-xs text-muted-foreground">{story.author}</p></article>)}</div></section> : null}

      <AdvertisementPlaceholder className="mt-14" label={t("advertisement")} />
    </article>
  );
}
