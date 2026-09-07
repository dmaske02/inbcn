import Link from "next/link";
import {
  HomepageStoryImage,
  publishedLabel,
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
        <article className="editorial-ledger-row log-row" key={story.id}>
          <div className="editorial-ledger-meta">
            <span>{story.categoryName ?? "News"}</span>
            <time dateTime={story.publishedAt}>{publishedLabel(locale,story.publishedAt)}</time>
          </div>
          <HomepageStoryImage className="editorial-ledger-image" story={story} />
          <div className="editorial-ledger-copy">
            <h3><Link href={story.href}>{story.title}</Link></h3>
            <p>{story.summary}</p>
          </div>
        </article>
      ))}
    </aside>
  );
}
