import {
  EditorialSectionHeader,
  LedgerStoryRow,
  type LedgerStory,
} from "@/components/editorial";
import type { HomepageStory } from "@/features/news/server/services/homepage.model";

function toLiveTvLedgerStory(story: HomepageStory): LedgerStory {
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

export function LiveTvStorySection({
  id,
  title,
  stories,
  locale,
  emphasis = false,
}: Readonly<{
  id: string;
  title: string;
  stories: readonly HomepageStory[];
  locale: string;
  emphasis?: boolean;
}>) {
  if (stories.length === 0) return null;
  return (
    <section
      aria-labelledby={id}
      className="editorial-live-story-section"
      data-emphasis={emphasis ? "true" : undefined}
    >
      <EditorialSectionHeader id={id} title={title} />
      <div>
        {stories.map((story) => (
          <LedgerStoryRow
            key={story.id}
            story={toLiveTvLedgerStory(story)}
            locale={locale}
          />
        ))}
      </div>
    </section>
  );
}
