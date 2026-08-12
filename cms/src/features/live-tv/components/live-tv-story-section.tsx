import { StoryCard } from "@/components/common/story-card";
import type { HomepageStory } from "@/features/news/server/services/homepage.model";

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
    <section aria-labelledby={id} className="border-t border-[#14110f] pt-4">
      <div className="mb-5 flex items-center gap-3">
        {emphasis ? <span aria-hidden="true" className="size-2 bg-[#b3261e]" /> : null}
        <h2 id={id} className="text-xl font-bold tracking-[-0.01em] sm:text-2xl">
          {title}
        </h2>
        <span aria-hidden="true" className="h-px flex-1 bg-[#d8d0c5]" />
      </div>
      <div className="grid gap-7 md:grid-cols-2 xl:grid-cols-3">
        {stories.map((story) => (
          <StoryCard
            key={story.id}
            title={story.title}
            href={story.href}
            summary={story.summary}
            category={story.categoryName ?? undefined}
            publishedAt={story.publishedAt}
            image={{
              src: story.image.src,
              alt: story.image.alt,
              unoptimized: story.image.unoptimized,
              width: story.image.width ?? undefined,
              height: story.image.height ?? undefined,
            }}
            locale={locale}
            variant="standard"
          />
        ))}
      </div>
    </section>
  );
}
