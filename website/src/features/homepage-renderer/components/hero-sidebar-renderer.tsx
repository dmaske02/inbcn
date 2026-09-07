import { LedgerStoryRow } from "@/components/editorial";
import {
  toLedgerStory,
} from "@/features/news/components/homepage-sections";
import type { HomepageStory } from "@/features/news/server/services/homepage.service";

export type HeroSidebarPayload = Readonly<{
  locale: string;
  title: string;
  stories: readonly HomepageStory[];
}>;

export function HeroSidebarRenderer({ locale, title, stories }: HeroSidebarPayload) {
  if (!stories.length) return null;

  return (
    <aside aria-label={title} className="editorial-builder-hero-sidebar">
      <h2 className="sr-only">{title}</h2>
      {stories.map((story) => (
        <LedgerStoryRow
          key={story.id}
          locale={locale}
          story={toLedgerStory(story)}
          showActions={false}
        />
      ))}
    </aside>
  );
}
