import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { AdvertisementPlaceholder } from "@/components/common/advertisement-placeholder";
import { Breadcrumb } from "@/components/common/breadcrumb";
import { EmptyState } from "@/components/common/empty-state";
import { Pagination } from "@/components/common/pagination";
import { StoryCard } from "@/components/common/story-card";
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
    <div className="mx-auto w-full max-w-[1360px] px-6 py-8 sm:py-10 lg:py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />

      <Breadcrumb
        items={[
          { label: t("breadcrumb.home"), href: `/${locale}` },
          { label: data.category.name },
        ]}
      />

      <header className="mt-7 border-t-2 border-foreground pt-6">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-signal">
          {data.category.name}
        </p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-balance sm:text-5xl lg:text-6xl">
          {data.category.name}
        </h1>
        {firstPage ? (
          <>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-muted-foreground">
              {data.category.description ?? t("description", { category: data.category.name })}
            </p>
            <p className="mt-4 text-sm font-medium text-muted-foreground">
              {t("storyCount", { count: data.storyCount })}
            </p>
          </>
        ) : null}
      </header>

      {firstPage && data.hero ? (
        <section className="mt-10" aria-label={data.hero.title}>
          <StoryCard
            variant="hero"
            priority
            title={data.hero.title}
            href={data.hero.href}
            summary={data.hero.summary}
            category={data.category.name}
            publishedAt={data.hero.publishedAt}
            author={data.hero.author}
            readingTimeMinutes={data.hero.readTime}
            locale={locale}
            image={data.hero.image}
          />
        </section>
      ) : null}

      {firstPage ? (
        <AdvertisementPlaceholder className="mt-10" label={t("advertisement")} />
      ) : null}

      <section className="mt-12 border-t-2 border-foreground pt-5" aria-labelledby="category-stories">
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
          <div className="mt-6 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {data.stories.map((story) => (
              <StoryCard
                key={story.id}
                title={story.title}
                href={story.href}
                summary={story.summary}
                category={data.category.name}
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

      <AdvertisementPlaceholder className="mt-12" label={t("advertisement")} />

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
