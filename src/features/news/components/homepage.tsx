import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { AdvertisementPlaceholder } from "@/components/common/advertisement-placeholder";
import { EmptyState } from "@/components/common/empty-state";
import { FeaturedCard } from "@/components/common/featured-card";
import { HorizontalCard } from "@/components/common/horizontal-card";
import { StoryCard } from "@/components/common/story-card";
import { Container } from "@/components/layout/container";
import { Grid } from "@/components/layout/grid";
import { SignalRail } from "@/components/layout/public";
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type {
  HomepageCategorySection,
  HomepageCategorySlug,
  HomepageStory,
  HomepageViewModel,
} from "@/features/news/server/services/homepage.service";

type HomepageProps = {
  locale: string;
  data: HomepageViewModel;
};

function storyProps(story: HomepageStory, locale: string) {
  return {
    title: story.title,
    summary: story.summary,
    href: story.href,
    category: story.categoryName ?? undefined,
    publishedAt: story.publishedAt,
    locale,
    image: story.image,
  };
}

function StoryCollection({
  section,
  locale,
  emptyTitle,
  emptyDescription,
}: {
  section: HomepageCategorySection;
  locale: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (section.stories.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        className="min-h-40 justify-center"
      />
    );
  }

  return (
    <Grid columns={{ base: 1, md: 2, lg: 4 }} gap="md">
      {section.stories.map((story, index) => (
        <StoryCard
          key={story.id}
          {...storyProps(story, locale)}
          priority={index === 0}
        />
      ))}
    </Grid>
  );
}

export async function Homepage({ locale, data }: HomepageProps) {
  const t = await getTranslations({ locale, namespace: "homepage" });
  const signal = data.signal;
  const hero = data.hero;
  const sectionOrder: HomepageCategorySlug[] = [
    "national",
    "world",
    "business",
    "technology",
    "sports",
    "entertainment",
    "opinion",
  ];

  return (
    <>
      <SignalRail
        state={signal?.isBreaking ? "breaking" : "developing"}
        label={signal?.isBreaking ? t("signals.breaking") : t("signals.developing")}
        headline={signal?.title ?? t("signals.empty")}
        timestamp={signal ? undefined : t("signals.standby")}
        href={signal?.href ?? `/${locale}`}
      />

      <Container className="max-w-[1360px] px-6">
        <Section id="latest" spacing="sm" className="lg:py-12">
          {hero ? (
            <Grid columns={{ base: 1, lg: 12 }} gap="lg">
              <div className="lg:col-span-8">
                <FeaturedCard
                  {...storyProps(hero, locale)}
                  priority
                  className="grid items-start gap-5 lg:grid-cols-[minmax(0,.88fr)_minmax(20rem,1.12fr)]"
                />
              </div>
              <aside
                aria-labelledby="latest-news-heading"
                className="border-t-2 border-foreground pt-3 lg:col-span-4"
              >
                <h2
                  id="latest-news-heading"
                  className="font-heading text-xl font-semibold tracking-tight"
                >
                  {t("sections.latest")}
                </h2>
                {data.latest.length > 0 ? (
                  <div className="mt-6 divide-y divide-border">
                    {data.latest.map((story) => (
                      <article key={story.id} className="py-5 first:pt-0">
                        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide">
                          {story.isBreaking && (
                            <Badge variant="signal">{t("signals.breaking")}</Badge>
                          )}
                          {story.categoryName && <span>{story.categoryName}</span>}
                          <time
                            dateTime={story.publishedAt}
                            className="ms-auto shrink-0 text-right text-muted-foreground"
                          >
                            {new Intl.DateTimeFormat(locale, {
                              hour: "numeric",
                              minute: "2-digit",
                            }).format(new Date(story.publishedAt))}
                          </time>
                        </div>
                        <Link
                          href={story.href}
                          className="mt-2 block text-base font-semibold leading-snug hover:underline"
                        >
                          {story.title}
                        </Link>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title={t("empty.latestTitle")}
                    description={t("empty.latestDescription")}
                    className="mt-6"
                  />
                )}
              </aside>
            </Grid>
          ) : (
            <EmptyState
              align="center"
              title={t("empty.heroTitle")}
              description={t("empty.heroDescription")}
              className="min-h-72 justify-center"
            />
          )}
        </Section>

        <AdvertisementPlaceholder label={t("advertisement.leaderboard")} />

        <Section title={t("sections.across")} spacing="sm" className="lg:py-12">
          {data.across.length > 0 ? (
            <Grid columns={{ base: 1, md: 2, lg: 3 }} gap="md">
              {data.across.map(({ category, stories }) => {
                if (!category) return null;
                const lead = stories[0];
                return (
                  <Card key={category.id} variant="bordered" className="overflow-hidden">
                    {lead ? (
                      <StoryCard
                        {...storyProps(lead, locale)}
                        category={category.name}
                        className="p-4 sm:p-5"
                      />
                    ) : (
                      <div className="p-5">
                        <Badge variant="outline">{category.name}</Badge>
                        <p className="mt-4 text-sm text-muted-foreground">
                          {t("empty.categoryCard")}
                        </p>
                      </div>
                    )}
                  </Card>
                );
              })}
            </Grid>
          ) : (
            <EmptyState
              title={t("empty.categoriesTitle")}
              description={t("empty.categoriesDescription")}
            />
          )}
        </Section>

        {sectionOrder.map((slug, index) => {
          const section = data.sections[slug];
          return (
            <div key={slug}>
              {index === 3 && (
                <AdvertisementPlaceholder
                  size="mobile"
                  label={t("advertisement.inFeed")}
                  className="mb-6 sm:mb-8"
                />
              )}
              <Section
                id={slug}
                title={section.category?.name ?? t(`categories.${slug}`)}
                spacing="sm"
                className="lg:py-12"
              >
                <StoryCollection
                  section={section}
                  locale={locale}
                  emptyTitle={t("empty.sectionTitle", {
                    category: section.category?.name ?? t(`categories.${slug}`),
                  })}
                  emptyDescription={t("empty.sectionDescription")}
                />
              </Section>
            </div>
          );
        })}

        <Section title={t("sections.editorsPicks")} spacing="sm" className="lg:py-12">
          {data.editorsPicks.length > 0 ? (
            <Grid columns={{ base: 1, md: 2 }} gap="lg">
              {data.editorsPicks.map((story) => (
                <FeaturedCard key={story.id} {...storyProps(story, locale)} />
              ))}
            </Grid>
          ) : (
            <EmptyState
              title={t("empty.editorsTitle")}
              description={t("empty.editorsDescription")}
            />
          )}
        </Section>

        <Section title={t("sections.trending")} spacing="sm" className="lg:py-12">
          {data.trending.length > 0 ? (
            <div className="divide-y divide-border">
              {data.trending.map((story) => (
                <HorizontalCard key={story.id} {...storyProps(story, locale)} />
              ))}
            </div>
          ) : (
            <EmptyState
              title={t("empty.trendingTitle")}
              description={t("empty.trendingDescription")}
            />
          )}
        </Section>
      </Container>
    </>
  );
}
