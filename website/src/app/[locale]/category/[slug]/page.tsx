import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { Breadcrumb } from "@/components/common/breadcrumb";
import { EmptyState } from "@/components/common/empty-state";
import { Pagination } from "@/components/common/pagination";
import { EditorialSectionHeader, type LedgerStory } from "@/components/editorial";
import { Badge } from "@/components/ui/badge";
import { EditorialListingFeed } from "@/features/news/components/editorial-listing-feed";
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
  const categoryStories: LedgerStory[] = [
    ...(firstPage && data.hero ? [data.hero] : []),
    ...data.stories,
  ].map((story) => ({
    id: story.id,
    href: story.href,
    title: story.title,
    summary: story.summary,
    category: data.category.name,
    publishedAt: story.publishedAt,
    author: story.author,
    image: story.image,
  }));

  return (
    <div className="editorial-container editorial-listing-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />

      <Breadcrumb
        items={[
          { label: t("breadcrumb.home"), href: `/${locale}` },
          { label: data.category.name },
        ]}
      />

      <header className="editorial-listing-header">
        <h1>{data.category.name}</h1>
        {firstPage ? (
          <>
            <p>
              {data.category.description ?? t("description", { category: data.category.name })}
            </p>
            <small>
              {t("storyCount", { count: data.storyCount })}
            </small>
          </>
        ) : null}
      </header>

      <section className="editorial-listing-results" aria-labelledby="category-stories">
        {firstPage ? (
          <EditorialSectionHeader
            id="category-stories"
            title={t("sections.latest", { category: data.category.name })}
          />
        ) : (
          <h2 id="category-stories" className="sr-only">
            {t("sections.latest", { category: data.category.name })}
          </h2>
        )}

        {data.emptyState ? (
          <EmptyState
            className="mt-8"
            title={data.emptyState.title}
            description={data.emptyState.description}
          />
        ) : (
          <EditorialListingFeed
            stories={categoryStories}
            locale={locale}
            sponsorLabel={t("advertisement")}
            sponsorSlotId={`category-${data.category.slug}-feed`}
            priorityFirst={firstPage}
          />
        )}
      </section>

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
        <nav className="editorial-listing-related" aria-labelledby="related-categories">
          <EditorialSectionHeader id="related-categories" title={t("sections.related")} />
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
