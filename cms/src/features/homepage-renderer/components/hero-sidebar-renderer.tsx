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
    <aside aria-label={title} className="proto-hero-sidebar">
      <h2 className="sr-only">{title}</h2>
      {stories.map((story) => (
        <article className="proto-hero-sidebar-card" key={story.id}>
          <HomepageStoryImage className="proto-hero-sidebar-image" story={story} />
          <div className="proto-hero-sidebar-copy">
            <div className="proto-label">{story.categoryName ?? "News"}</div>
            <h3><Link href={story.href}>{story.title}</Link></h3>
            <p>{story.summary}</p>
            <small>{publishedLabel(locale,story.publishedAt)}</small>
          </div>
        </article>
      ))}
    </aside>
  );
}
