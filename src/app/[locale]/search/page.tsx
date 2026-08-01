import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { AdvertisementPlaceholder } from "@/components/common/advertisement-placeholder";
import { Breadcrumb } from "@/components/common/breadcrumb";
import { EmptyState } from "@/components/common/empty-state";
import { Pagination } from "@/components/common/pagination";
import { StoryCard } from "@/components/common/story-card";
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
    <div className="mx-auto w-full max-w-[1360px] px-6 py-8 sm:py-10 lg:py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />

      <Breadcrumb
        label={t("breadcrumb.label")}
        items={[
          { label: t("breadcrumb.home"), href: `/${locale}` },
          { label: t("breadcrumb.search") },
        ]}
      />

      <header className="mt-7 border-t-2 border-foreground pt-6">
        <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          {t("title")}
        </h1>
      </header>

      <div className="mt-7">
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

      <AdvertisementPlaceholder className="mt-10" label={t("advertisement")} />

      <section
        className="mt-12 border-t-2 border-foreground pt-5"
        aria-labelledby={result.state === "searched" ? "search-results" : undefined}
        aria-label={result.state === "initial" ? t("initial.title") : undefined}
      >
        {result.state === "searched" ? (
          <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="search-results" className="text-2xl font-semibold tracking-tight sm:text-3xl">
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
          <div className="mt-7 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {data.results.map((story) => (
              <StoryCard
                key={story.id}
                title={story.title}
                href={story.href}
                summary={story.summary}
                category={story.category}
                publishedAt={story.publishedAt}
                author={story.author}
                readingTimeMinutes={story.readTime}
                locale={locale}
                image={story.image}
              />
            ))}
          </div>
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

      <AdvertisementPlaceholder className="mt-12" label={t("advertisement")} />
    </div>
  );
}
