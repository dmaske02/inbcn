import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { AdvertisementPlaceholder } from "@/components/common/advertisement-placeholder";
import { Breadcrumb } from "@/components/common/breadcrumb";
import { EmptyState } from "@/components/common/empty-state";
import { Pagination } from "@/components/common/pagination";
import { Badge } from "@/components/ui/badge";
import { getCategoryPageData } from "@/features/news/server/services/category.service";

type CategoryPageProps = Readonly<{
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}>;

function pageHref(locale: string, slug: string, page: number): string {
  const path = `/${locale}/category/${slug}`;
  return page === 1 ? path : `${path}?page=${page}`;
}

export async function generateMetadata({
  params,
  searchParams,
}: CategoryPageProps): Promise<Metadata> {
  const [{ locale, slug }, { page }] = await Promise.all([params, searchParams]);
  const result = await getCategoryPageData(locale, slug, page);
  if (result.status !== "ready") notFound();

  return {
    title: result.data.metadata.title,
    description: result.data.metadata.description,
    alternates: { canonical: result.data.metadata.canonical },
    openGraph: {
      ...result.data.metadata.openGraph,
      images: [...result.data.metadata.openGraph.images],
      locale,
    },
    twitter: {
      ...result.data.metadata.twitter,
      images: [...result.data.metadata.twitter.images],
    },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: CategoryPageProps) {
  const [{ locale, slug }, { page }] = await Promise.all([params, searchParams]);
  const result = await getCategoryPageData(locale, slug, page);
  if (result.status !== "ready") notFound();

  const { data } = result;
  const t = await getTranslations({ locale, namespace: "categoryPage" });
  const jsonLd = JSON.stringify(data.jsonLd).replace(/</gu, "\\u003c");
  const firstPage = data.pagination.page === 1;

  return (
    <div className="mx-auto w-full max-w-[1288px] px-4 py-7 sm:px-6 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />

      <Breadcrumb
        items={[
          { label: t("breadcrumb.home"), href: `/${locale}` },
          { label: data.category.name },
        ]}
      />

      <header className="mt-6 border-b-2 border-[#14110f] pb-5">
        <h1 className="text-[30px] font-bold leading-tight tracking-[-0.02em] sm:text-[34px]">
          {data.category.name}
        </h1>
        {firstPage ? (
          <>
            <p className="mt-3 max-w-[70ch] text-[14px] leading-[1.55] text-[#5c534b]">
              {data.category.description ?? t("description", { category: data.category.name })}
            </p>
            <p className="mt-3 text-[12px] text-[#8a7f73]">
              {t("storyCount", { count: data.storyCount })}
            </p>
          </>
        ) : null}
      </header>

      {firstPage ? <AdvertisementPlaceholder className="mt-7" label={t("advertisement")} /> : null}

      <div className="mt-9 grid gap-9 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10">
      <section aria-labelledby="category-stories">
        <h2 id="category-stories" className={firstPage
          ? "text-2xl font-semibold tracking-tight sm:text-3xl"
          : "sr-only"}>
          {t("sections.latest", { category: data.category.name })}
        </h2>

        {data.emptyState ? (
          <EmptyState
            className="mt-8"
            title={data.emptyState.title}
            description={data.emptyState.description}
          />
        ) : (
          <div className="mt-2 divide-y divide-[#e3ddd3] border-t border-[#e3ddd3]">
            {firstPage && data.hero ? (
              <article className="grid gap-4 py-6 sm:grid-cols-[200px_1fr] sm:gap-5">
                <Link href={data.hero.href} className="relative aspect-[3/2] overflow-hidden border border-[#ded7cb] bg-[#e7e0d4]"><Image src={data.hero.image.src} alt={data.hero.image.alt} fill priority unoptimized={data.hero.image.unoptimized} className="object-cover" sizes="200px" /></Link>
                <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#b3261e]">{data.category.name}</p><Link href={data.hero.href}><h3 className="mt-2 text-[22px] font-semibold leading-[1.25] hover:text-[#b3261e]">{data.hero.title}</h3></Link><p className="mt-2 max-w-[70ch] text-[14px] leading-[1.5] text-[#5c534b]">{data.hero.summary}</p><p className="mt-3 text-[11.5px] text-[#8a7f73]">{data.hero.author}</p></div>
              </article>
            ) : null}
            {data.stories.map((story) => (
              <article key={story.id} className="grid gap-4 py-6 sm:grid-cols-[200px_1fr] sm:gap-5">
                <Link href={story.href} className="relative aspect-[3/2] overflow-hidden border border-[#ded7cb] bg-[#e7e0d4]"><Image src={story.image.src} alt={story.image.alt} fill unoptimized={story.image.unoptimized} className="object-cover" sizes="200px" /></Link>
                <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#b3261e]">{data.category.name}</p><Link href={story.href}><h3 className="mt-2 text-[22px] font-semibold leading-[1.25] hover:text-[#b3261e]">{story.title}</h3></Link><p className="mt-2 max-w-[70ch] text-[14px] leading-[1.5] text-[#5c534b]">{story.summary}</p><p className="mt-3 text-[11.5px] text-[#8a7f73]">{story.author}</p></div>
              </article>
            ))}
          </div>
        )}
      </section>

      <aside className="space-y-7"><AdvertisementPlaceholder size="rectangle" label={t("advertisement")} className="lg:sticky lg:top-5" /></aside>
      </div>

      {data.pagination.totalPages > 1 ? (
        <Pagination
          className="mt-12 border-t border-border pt-6"
          currentPage={data.pagination.page}
          totalPages={data.pagination.totalPages}
          previousHref={data.pagination.previousPage
            ? pageHref(locale, slug, data.pagination.previousPage)
            : undefined}
          nextHref={data.pagination.nextPage
            ? pageHref(locale, slug, data.pagination.nextPage)
            : undefined}
          previousLabel={t("pagination.previous")}
          nextLabel={t("pagination.next")}
          pageLabel={t("pagination.page")}
          ofLabel={t("pagination.of")}
        />
      ) : null}

      {firstPage && data.relatedCategories.length > 0 ? (
        <nav className="mt-12 border-t border-border pt-6" aria-labelledby="related-categories">
          <h2 id="related-categories" className="text-xl font-semibold">
            {t("sections.related")}
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {data.relatedCategories.map((category) => (
              <Link key={category.href} href={category.href}>
                <Badge variant="outline" className="transition-colors hover:border-foreground hover:text-foreground">
                  {category.name}
                </Badge>
              </Link>
            ))}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
