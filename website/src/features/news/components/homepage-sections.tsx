import Image from "next/image";
import Link from "next/link";

import {
  EditorialSectionHeader,
  EditorialSponsorRow,
  LedgerStoryRow,
  RankedStoryList,
  StoryActionButtons,
  type LedgerStory,
} from "@/components/editorial";
import type { HomepageStory } from "@/features/news/server/services/homepage.service";
import { getHeroImagePresentation } from "@/features/news/server/services/story-reader.model";

export function publishedLabel(locale: string, publishedAt: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(publishedAt));
}

export function toLedgerStory(story: HomepageStory): LedgerStory {
  return {
    id: story.id,
    href: story.href,
    title: story.title,
    summary: story.summary,
    category: story.categoryName ?? "News",
    publishedAt: story.publishedAt,
    image: story.image,
  };
}

export function HomepageStoryImage({
  story,
  className,
  priority = false,
}: {
  story: HomepageStory;
  className: string;
  priority?: boolean;
}) {
  const presentation = priority ? getHeroImagePresentation(story.image) : null;

  return (
    <div className={className}>
      <Image
        src={story.image.src}
        alt={story.image.alt}
        fill
        priority={priority}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        unoptimized={story.image.unoptimized}
        sizes="(max-width: 820px) 100vw, 56vw"
        style={presentation ? {
          objectFit: presentation.objectFit,
          objectPosition: presentation.objectPosition,
          maxWidth: presentation.maxWidth,
          maxHeight: presentation.maxHeight,
          margin: "auto",
        } : undefined}
      />
    </div>
  );
}

export function HomepageAdvertisement({
  rectangle = false,
  label = "Advertisement",
}: {
  rectangle?: boolean;
  label?: string;
}) {
  return (
    <EditorialSponsorRow
      label={label}
      slotId={rectangle ? "homepage-secondary" : "homepage-leaderboard"}
    />
  );
}

export function HomepageHeroSection({
  locale,
  story,
  deck = [],
}: {
  locale: string;
  story: HomepageStory;
  deck?: readonly HomepageStory[];
}) {
  return (
    <>
      <article className="editorial-home-hero" aria-label="Featured story">
        <HomepageStoryImage story={story} className="editorial-home-hero-media" priority />
        <div className="editorial-home-hero-copy">
          <p className="editorial-home-kicker">Featured story</p>
          <h1><Link href={story.href}>{story.title}</Link></h1>
          <p className="editorial-home-hero-summary">{story.summary}</p>
          <div className="editorial-home-hero-meta">
            <span>{story.categoryName ?? "News"}</span>
            <time dateTime={story.publishedAt}>{publishedLabel(locale, story.publishedAt)}</time>
          </div>
          <div className="editorial-home-hero-actions">
            <Link href={story.href}>Read full story</Link>
            <StoryActionButtons storyId={story.id} title={story.title} url={story.href} />
          </div>
        </div>
      </article>
      {deck.length ? (
        <section className="editorial-home-hero-deck" aria-label="More featured stories">
          {deck.map((item) => (
            <LedgerStoryRow
              key={item.id}
              locale={locale}
              story={toLedgerStory(item)}
              showActions={false}
            />
          ))}
        </section>
      ) : null}
    </>
  );
}

export function HomepageHeadlineSection({
  title = "Top headlines",
  stories,
}: {
  title?: string;
  stories: readonly HomepageStory[];
}) {
  return (
    <section className="editorial-home-section">
      <RankedStoryList title={title} stories={stories} />
    </section>
  );
}

export function HomepageFeedSection({
  locale,
  title,
  stories,
}: {
  locale: string;
  title: string;
  stories: readonly HomepageStory[];
}) {
  return (
    <section className="editorial-home-section">
      <EditorialSectionHeader
        title={title}
        action={<Link href={`/${locale}/search`}>View all stories</Link>}
      />
      <div className="editorial-home-feed">
        {stories.map((story) => (
          <LedgerStoryRow key={story.id} locale={locale} story={toLedgerStory(story)} />
        ))}
      </div>
    </section>
  );
}

export function HomepageRankedSection({
  title,
  stories,
}: {
  title: string;
  stories: readonly HomepageStory[];
}) {
  return <RankedStoryList title={title} stories={stories} />;
}

export type HomepageCategoryRailPresentation = Readonly<{
  category: Readonly<{ id: string; name: string; slug: string }>;
  stories: readonly HomepageStory[];
}>;

export function HomepageCategoryRails({
  locale,
  title = "Across the newsroom",
  rails,
}: {
  locale: string;
  title?: string;
  rails: readonly HomepageCategoryRailPresentation[];
}) {
  return (
    <section className="editorial-home-section editorial-home-categories">
      <EditorialSectionHeader title={title} kicker="Sections" />
      <div className="editorial-home-category-grid">
        {rails.map(({ category, stories }) => (
          <section className="editorial-home-category" key={category.id} aria-labelledby={`category-${category.id}`}>
            <EditorialSectionHeader
              id={`category-${category.id}`}
              title={category.name}
              action={<Link href={`/${locale}/category/${category.slug}`}>Open section</Link>}
            />
            <div>
              {stories.map((story) => (
                <LedgerStoryRow
                  key={story.id}
                  locale={locale}
                  story={toLedgerStory(story)}
                  showActions={false}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

export function HomepageEditorsSection({
  locale,
  title = "Editor's picks",
  stories,
}: {
  locale: string;
  title?: string;
  stories: readonly HomepageStory[];
}) {
  const lead = stories[0];
  if (!lead) return null;

  return (
    <section className="editorial-home-editors" aria-label={title}>
      <p className="editorial-home-kicker">Editor&apos;s pick</p>
      <article className="editorial-home-editors-lead">
        <HomepageStoryImage story={lead} className="editorial-home-editors-media" />
        <div className="editorial-home-editors-meta">
          <span>{lead.categoryName ?? "News"}</span>
          <time dateTime={lead.publishedAt}>{publishedLabel(locale, lead.publishedAt)}</time>
        </div>
        <h2><Link href={lead.href}>{lead.title}</Link></h2>
        <p>{lead.summary}</p>
      </article>
      <div className="editorial-home-editors-list">
        {stories.slice(1).map((story) => (
          <article key={story.id}>
            <h3><Link href={story.href}>{story.title}</Link></h3>
          </article>
        ))}
      </div>
    </section>
  );
}
