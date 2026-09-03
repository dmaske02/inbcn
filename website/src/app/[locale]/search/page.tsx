import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { Breadcrumb } from "@/components/common/breadcrumb";
import { EmptyState } from "@/components/common/empty-state";
import { Pagination } from "@/components/common/pagination";
import type { LedgerStory } from "@/components/editorial";
import { EditorialListingFeed } from "@/features/news/components/editorial-listing-feed";
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
  const searchStories: LedgerStory[] = data.results.map((story) => ({
    id: story.id,
    href: story.href,
    title: story.title,
    summary: story.summary,
    category: story.category,
    publishedAt: story.publishedAt,
    author: story.author,
    image: story.image,
  }));

  return (
    <div className="editorial-container editorial-listing-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />

      <Breadcrumb
        label={t("breadcrumb.label")}
        items={[
          { label: t("breadcrumb.home"), href: `/${locale}` },
          { label: t("breadcrumb.search") },
        ]}
      />

      <header className="editorial-listing-header">
        <h1>{t("title")}</h1>
      </header>

      <div className="editorial-listing-search-form">
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

      <section
        className="editorial-listing-results"
        aria-labelledby={result.state === "searched" ? "search-results" : undefined}
        aria-label={result.state === "initial" ? t("initial.title") : undefined}
      >
        {result.state === "searched" ? (
          <div className="editorial-listing-result-heading">
          <h2 id="search-results">
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
          <EditorialListingFeed
            stories={searchStories}
            locale={locale}
            sponsorLabel={t("advertisement")}
            sponsorSlotId="search-results-feed"
          />
        )}
      </section>

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
