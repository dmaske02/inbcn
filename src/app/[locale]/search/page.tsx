import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { AdvertisementPlaceholder } from "@/components/common/advertisement-placeholder";
import { Breadcrumb } from "@/components/common/breadcrumb";
import { EmptyState } from "@/components/common/empty-state";
import { Pagination } from "@/components/common/pagination";
import { SearchForm } from "@/features/news/components/search-form";
import { buildSearchHref } from "@/features/news/server/services/search.model";
import {
  getSearchPageData,
  type SearchPageSearchParams,
} from "@/features/news/server/services/search.service";

type SearchPageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchPageSearchParams>;
}>;

export async function generateMetadata({
  params,
  searchParams,
}: SearchPageProps): Promise<Metadata> {
  const [{ locale }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const result = await getSearchPageData(locale, resolvedSearchParams);
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

export default async function SearchPage({ params, searchParams }: SearchPageProps) {
  const [{ locale }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const result = await getSearchPageData(locale, resolvedSearchParams);
  if (result.status !== "ready") notFound();

  const { data } = result;
  const t = await getTranslations({ locale, namespace: "searchPage" });
  const jsonLd = JSON.stringify(data.jsonLd).replace(/</gu, "\\u003c");
  const previousHref = data.pagination.previousPage
    ? buildSearchHref({
        locale,
        query: data.query,
        category: data.category,
        date: data.date,
        page: data.pagination.previousPage,
      })
    : undefined;
  const nextHref = data.pagination.nextPage
    ? buildSearchHref({
        locale,
        query: data.query,
        category: data.category,
        date: data.date,
        page: data.pagination.nextPage,
      })
    : undefined;

  return (
    <div className="mx-auto w-full max-w-[1288px] px-4 py-7 sm:px-6 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />

      <Breadcrumb
        label={t("breadcrumb.label")}
        items={[
          { label: t("breadcrumb.home"), href: `/${locale}` },
          { label: t("breadcrumb.search") },
        ]}
      />

      <header className="mt-6 border-b-2 border-[#14110f] pb-5">
        <h1 className="text-[30px] font-bold leading-tight tracking-[-0.02em] sm:text-[34px]">
          {t("title")}
        </h1>
      </header>

      <div className="mt-6">
        <SearchForm
          locale={locale}
          query={data.query}
          category={data.category}
          date={data.date}
          languageName={result.languageName}
          categories={result.categories}
          labels={{
            search: t("form.label"),
            placeholder: t("form.placeholder"),
            submit: t("form.submit"),
            category: t("filters.category"),
            allCategories: t("filters.allCategories"),
            language: t("filters.language"),
            date: t("filters.date"),
            allDates: t("filters.allDates"),
            pastDay: t("filters.pastDay"),
            pastWeek: t("filters.pastWeek"),
            pastMonth: t("filters.pastMonth"),
            order: t("filters.order"),
            newest: t("filters.newest"),
          }}
        />
      </div>

      <AdvertisementPlaceholder className="mt-7" label={t("advertisement")} />

      <div className="mt-9 grid gap-9 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10">
      <section
        aria-labelledby={result.state === "searched" ? "search-results" : undefined}
        aria-label={result.state === "initial" ? t("initial.title") : undefined}
      >
        {result.state === "searched" ? (
          <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="search-results" className="text-[22px] font-bold tracking-[-0.01em]">
              {t("resultCount", { count: data.resultCount, query: data.query })}
          </h2>
          </div>
        ) : null}

        {data.emptyState ? (
          <EmptyState
            className="mt-8"
            title={data.emptyState.title}
            description={data.emptyState.description}
          />
        ) : (
          <div className="mt-5 divide-y divide-[#e3ddd3] border-t border-[#e3ddd3]">
            {data.results.map((story) => (
              <article key={story.id} className="grid gap-4 py-6 sm:grid-cols-[200px_1fr] sm:gap-5">
                <Link href={story.href} className="relative aspect-[3/2] overflow-hidden border border-[#ded7cb] bg-[#e7e0d4]"><Image src={story.image.src} alt={story.image.alt} fill unoptimized={story.image.unoptimized} className="object-cover" sizes="200px" /></Link>
                <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#b3261e]">{story.category}</p><Link href={story.href}><h3 className="mt-2 text-[22px] font-semibold leading-[1.25] hover:text-[#b3261e]">{story.title}</h3></Link><p className="mt-2 max-w-[70ch] text-[14px] leading-[1.5] text-[#5c534b]">{story.summary}</p><p className="mt-3 text-[11.5px] text-[#8a7f73]">{story.author}</p></div>
              </article>
            ))}
          </div>
        )}
      </section>
      <aside><AdvertisementPlaceholder size="rectangle" label={t("advertisement")} className="lg:sticky lg:top-5" /></aside>
      </div>

      {data.pagination.totalPages > 1 ? (
        <Pagination
          className="mt-12 border-t border-border pt-6"
          currentPage={data.pagination.page}
          totalPages={data.pagination.totalPages}
          previousHref={previousHref}
          nextHref={nextHref}
          previousLabel={t("pagination.previous")}
          nextLabel={t("pagination.next")}
          pageLabel={t("pagination.page")}
          ofLabel={t("pagination.of")}
        />
      ) : null}

    </div>
  );
}
